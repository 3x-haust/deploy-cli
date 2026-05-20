import { readFileSync } from 'fs';
import {
  loadSecrets,
  saveSecrets,
  setSecret,
  getSecret,
  deleteSecret,
  clearSecrets,
  secretsFilePath,
  fileMode,
  maskValue,
  parseEnvContent,
} from '../secrets.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';

export async function secretsListCommand() {
  const chalk = await getChalk();

  const s = loadSecrets();
  const keys = Object.keys(s).sort();
  if (keys.length === 0) {
    console.log(chalk.yellow('No secrets stored.'));
    console.log(chalk.gray(`File: ${secretsFilePath()}`));
    return;
  }
  const table = await createTable({
    head: ['Key', 'Value (masked)', 'Length'],
  });
  for (const k of keys) {
    const v = s[k];
    table.push([k, maskValue(v), String(v.length)]);
  }
  console.log(formatAnsiForOutput(table.toString()));
  const mode = fileMode();
  if (mode !== null && mode !== 0o600) {
    console.log(
      chalk.yellow(
        `Warning: secrets file mode is ${mode.toString(8)}, expected 600.`,
      ),
    );
  }
}

export async function secretsSetCommand(
  kv: string,
  options: { file?: string; stdin?: boolean } = {},
) {
  const chalk = await getChalk();
  const [key, ...rest] = kv.split('=');
  if (!key) throw new Error('Usage: deploy secrets set KEY=VALUE');

  let value: string;
  if (options.file) {
    value = readFileSync(options.file, 'utf-8');
  } else if (options.stdin) {
    value = await readStdin();
  } else {
    value = rest.join('=');
    if (!value && !kv.includes('=')) {
      throw new Error(
        'Missing value. Pass KEY=VALUE, --file <path>, or --stdin.',
      );
    }
  }

  setSecret(key, value);
  console.log(chalk.green(`Saved secret: ${key}`));
}

export async function secretsGetCommand(
  key: string,
  options: { reveal?: boolean },
) {
  const chalk = await getChalk();
  const v = getSecret(key);
  if (v === undefined) {
    console.error(chalk.red(`Secret not found: ${key}`));
    process.exit(1);
  }
  if (options.reveal) {
    process.stdout.write(v);
    if (!v.endsWith('\n')) process.stdout.write('\n');
  } else {
    console.log(maskValue(v));
    console.log(chalk.gray('(masked — pass --reveal to print the real value)'));
  }
}

export async function secretsDeleteCommand(key: string) {
  const chalk = await getChalk();
  if (!deleteSecret(key)) {
    console.error(chalk.yellow(`Secret not found: ${key}`));
    process.exit(1);
  }
  console.log(chalk.green(`Deleted secret: ${key}`));
}

export async function secretsImportCommand(
  file: string,
  options: { overwrite?: boolean },
) {
  const chalk = await getChalk();
  const text = readFileSync(file, 'utf-8');
  const parsed = parseEnvContent(text);
  const existing = loadSecrets();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (k in existing && !options.overwrite) {
      skipped++;
      continue;
    }
    if (k in existing) updated++;
    else added++;
    existing[k] = v;
  }
  saveSecrets(existing);
  console.log(
    chalk.green(
      `Imported ${added} new, ${updated} updated, ${skipped} skipped (existing).`,
    ),
  );
  console.log(chalk.gray(`File: ${secretsFilePath()} (mode 600)`));
}

export async function secretsClearCommand() {
  const chalk = await getChalk();
  clearSecrets();
  console.log(chalk.green('Cleared all secrets.'));
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
