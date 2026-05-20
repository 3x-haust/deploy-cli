import { apiFetch } from '../api.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';

interface TargetOptions {
  name?: string;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  key?: string;
  sudoPassword?: string;
  hostAddress?: string;
  workspace?: string;
  registry?: string;
}

function defaultRegistryHost(host?: string, hostAddress?: string) {
  const registryHost = (hostAddress?.trim() || host?.trim() || '').replace(
    /\/$/,
    '',
  );
  return registryHost ? `${registryHost}:5000` : undefined;
}

function buildTargetBody(options: TargetOptions, requireHost = false) {
  if (requireHost && !options.host) {
    throw new Error('--host is required');
  }

  const body: Record<string, unknown> = {};
  if (options.name !== undefined) body.name = options.name;
  if (options.host !== undefined) body.host = options.host;
  if (options.port !== undefined) body.port = Number(options.port);
  if (options.user !== undefined) body.username = options.user;
  if (options.key !== undefined) {
    body.authType = 'key';
    body.privateKey = options.key;
  }
  if (options.password !== undefined) {
    body.authType = 'password';
    body.password = options.password;
  }
  if (options.sudoPassword !== undefined) body.sudoPassword = options.sudoPassword;
  if (options.hostAddress !== undefined) body.hostAddress = options.hostAddress;
  if (options.workspace !== undefined) body.workspaceRoot = options.workspace;
  if (options.registry !== undefined) body.registryHost = options.registry;

  if (requireHost) {
    body.name = options.name || options.host;
    body.port = options.port ? Number(options.port) : 22;
    body.username = options.user || 'ubuntu';
    body.authType = options.key ? 'key' : 'password';
    body.password = options.password;
    body.privateKey = options.key;
    body.sudoPassword = options.sudoPassword || options.password;
    body.hostAddress = options.hostAddress;
    body.workspaceRoot = options.workspace || '.';
    body.registryHost =
      options.registry || defaultRegistryHost(options.host, options.hostAddress);
  }

  return body;
}

export async function listTargets() {
  const chalk = await getChalk();
  const targets = await apiFetch('/deployment-targets');

  if (!Array.isArray(targets) || targets.length === 0) {
    console.log(chalk.yellow('No deployment servers found.'));
    return;
  }

  const table = await createTable({
    head: ['ID', 'Name', 'Host', 'User', 'Auth', 'Workspace', 'Registry', 'Status'],
  });

  for (const target of targets) {
    table.push([
      target.id,
      target.name,
      `${target.host}:${target.port}`,
      target.username,
      target.authType,
      target.workspaceRoot || '.',
      target.registryHost || `${target.hostAddress || target.host}:5000`,
      target.provisionStatus || 'not_provisioned',
    ]);
  }

  console.log(formatAnsiForOutput(table.toString()));
}

export async function createTarget(options: TargetOptions) {
  const body = buildTargetBody(options, true);

  const target = await apiFetch('/deployment-targets', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const chalk = await getChalk();
  console.log(
    `Deployment server added: ${chalk.bold(target.name)} (ID: ${target.id})`,
  );
  console.log(`  Workspace: ${target.workspaceRoot || '.'}`);
  console.log(
    `  Registry: ${target.registryHost || `${target.hostAddress || target.host}:5000`}`,
  );
}

export async function updateTarget(idOrName: string, options: TargetOptions) {
  const id = await resolveTargetId(idOrName);
  const body = buildTargetBody(options);

  if (Object.keys(body).length === 0) {
    throw new Error('No update options provided.');
  }

  const target = await apiFetch(`/deployment-targets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

  const chalk = await getChalk();
  console.log(`Deployment server updated: ${chalk.bold(target.name)} (ID: ${target.id})`);
}

export async function provisionTarget(idOrName: string) {
  const id = await resolveTargetId(idOrName);
  const result = await apiFetch(`/deployment-targets/${id}/provision`, {
    method: 'POST',
  });

  const target = result.target || result;
  const chalk = await getChalk();
  console.log(
    `Provisioning started for ${chalk.bold(target.name || idOrName)} (ID: ${id})`,
  );
  if (result.status?.registryHost) {
    console.log(`  Registry: ${result.status.registryHost}`);
  }
  if (result.status?.letsEncryptIssuer) {
    console.log(`  Issuer: ${result.status.letsEncryptIssuer}`);
  }
}

export async function deleteTarget(id: string) {
  await apiFetch(`/deployment-targets/${id}`, { method: 'DELETE' });
  console.log(`Deployment server ${id} deleted.`);
}

export async function resolveTargetId(idOrName?: string): Promise<number | undefined> {
  if (!idOrName) return undefined;
  if (/^(default|default-server|default_server)$/i.test(idOrName)) {
    return undefined;
  }
  if (/^\d+$/.test(idOrName)) return Number(idOrName);

  const targets = await apiFetch('/deployment-targets');
  const target = Array.isArray(targets)
    ? targets.find(
        (item: any) => item.name.toLowerCase() === idOrName.toLowerCase(),
      )
    : null;
  if (!target) {
    throw new Error(`Deployment server "${idOrName}" not found`);
  }
  return target.id;
}
