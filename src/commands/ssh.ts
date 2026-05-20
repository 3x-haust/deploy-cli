import { spawn, spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync, chmodSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadSecrets } from '../secrets.js';
import { formatAnsiForOutput } from '../terminal.js';

interface SshCreds {
  host: string;
  user: string;
  port: number;
  key?: string;
  password?: string;
}

function readSshCreds(): SshCreds {
  const s = loadSecrets();
  const host = s.SSH_HOST;
  const user = s.SSH_USER;
  const portStr = s.SSH_PORT;
  if (!host || !user) {
    throw new Error(
      'Missing SSH credentials. Run: deploy secrets import <.env path> (requires SSH_HOST, SSH_USER, SSH_PORT, SSH_KEY).',
    );
  }
  const port = portStr ? parseInt(portStr, 10) : 22;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SSH_PORT: ${portStr}`);
  }
  const key = s.SSH_KEY;
  const password = s.SSH_PASSWORD;
  if (!key && !password) {
    throw new Error(
      'Missing SSH_KEY and SSH_PASSWORD. At least one must be stored in secrets.',
    );
  }
  return { host, user, port, key, password };
}

// Remote host allowlist to prevent accidental shell injection via SSH_HOST.
function assertSafeHost(host: string) {
  if (!/^[A-Za-z0-9._\-:]+$/.test(host)) {
    throw new Error(`Refusing to SSH: unexpected characters in host "${host}"`);
  }
}

function assertSafeUser(user: string) {
  if (!/^[A-Za-z0-9._\-]+$/.test(user)) {
    throw new Error(`Refusing to SSH: unexpected characters in user "${user}"`);
  }
}

type KeyHandle = { path: string; cleanup: () => void };

function writeEphemeralKey(key: string): KeyHandle {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-cli-ssh-'));
  try {
    chmodSync(dir, 0o700);
  } catch {}
  const path = join(dir, 'id');
  const contents = key.endsWith('\n') ? key : key + '\n';
  writeFileSync(path, contents, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {}
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    try {
      if (existsSync(path)) rmSync(path);
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  };
  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  return { path, cleanup };
}

function baseSshArgs(creds: SshCreds, keyPath: string | null): string[] {
  const args = [
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'UserKnownHostsFile=~/.ssh/known_hosts',
    '-o',
    'PreferredAuthentications=publickey,password',
    '-p',
    String(creds.port),
  ];
  if (keyPath) {
    args.push('-i', keyPath, '-o', 'IdentitiesOnly=yes');
  }
  args.push(`${creds.user}@${creds.host}`);
  return args;
}

function detectSshpass(): string | null {
  const r = spawnSync('which', ['sshpass']);
  if (r.status === 0) return r.stdout.toString().trim();
  return null;
}

export async function sshInteractiveCommand() {
  const creds = readSshCreds();
  assertSafeHost(creds.host);
  assertSafeUser(creds.user);

  let handle: KeyHandle | null = null;
  try {
    let cmd = 'ssh';
    let args: string[];
    if (creds.key) {
      handle = writeEphemeralKey(creds.key);
      args = baseSshArgs(creds, handle.path);
    } else if (creds.password) {
      const sshpass = detectSshpass();
      if (!sshpass) {
        throw new Error(
          'Password-only auth requires `sshpass` to be installed, or use SSH_KEY.',
        );
      }
      cmd = sshpass;
      args = ['-p', creds.password, 'ssh', ...baseSshArgs(creds, null)];
    } else {
      throw new Error('No SSH credential available.');
    }

    await runInteractive(cmd, args);
  } finally {
    handle?.cleanup();
  }
}

export async function sshRunCommand(
  command: string,
  options: { timeout?: string; json?: boolean },
) {
  const creds = readSshCreds();
  assertSafeHost(creds.host);
  assertSafeUser(creds.user);

  if (!command || !command.trim()) throw new Error('Empty command.');

  const timeoutMs =
    options.timeout !== undefined ? parseInt(options.timeout, 10) * 1000 : 120_000;

  let handle: KeyHandle | null = null;
  try {
    let cmd = 'ssh';
    let args: string[];
    if (creds.key) {
      handle = writeEphemeralKey(creds.key);
      args = [...baseSshArgs(creds, handle.path), '--', 'bash', '-lc', command];
    } else if (creds.password) {
      const sshpass = detectSshpass();
      if (!sshpass)
        throw new Error(
          'Password-only auth requires `sshpass` installed, or use SSH_KEY.',
        );
      cmd = sshpass;
      args = [
        '-p',
        creds.password,
        'ssh',
        ...baseSshArgs(creds, null),
        '--',
        'bash',
        '-lc',
        command,
      ];
    } else {
      throw new Error('No SSH credential available.');
    }

    const result = await runCapture(cmd, args, timeoutMs);
    if (options.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      if (result.stdout) process.stdout.write(formatAnsiForOutput(result.stdout));
      if (result.stderr) process.stderr.write(formatAnsiForOutput(result.stderr));
    }
    process.exitCode = result.code ?? 0;
  } finally {
    handle?.cleanup();
  }
}

function runInteractive(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0 || code === 130) resolve();
      else reject(new Error(`ssh exited with code ${code}`));
    });
  });
}

interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCapture(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      p.kill('SIGKILL');
    }, timeoutMs);
    p.stdout?.on('data', (c) => (stdout += c.toString()));
    p.stderr?.on('data', (c) => (stderr += c.toString()));
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    p.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: stderr + `\n${err.message}`, timedOut });
    });
  });
}
