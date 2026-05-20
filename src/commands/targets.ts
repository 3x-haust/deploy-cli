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

export async function listTargets() {
  const chalk = await getChalk();
  const targets = await apiFetch('/deployment-targets');

  if (!Array.isArray(targets) || targets.length === 0) {
    console.log(chalk.yellow('No deployment servers found.'));
    return;
  }

  const table = await createTable({
    head: ['ID', 'Name', 'Host', 'User', 'Auth', 'Workspace'],
  });

  for (const target of targets) {
    table.push([
      target.id,
      target.name,
      `${target.host}:${target.port}`,
      target.username,
      target.authType,
      target.workspaceRoot || '.',
    ]);
  }

  console.log(formatAnsiForOutput(table.toString()));
}

export async function createTarget(options: TargetOptions) {
  if (!options.host) {
    throw new Error('--host is required');
  }

  const body = {
    name: options.name || options.host,
    host: options.host,
    port: options.port ? Number(options.port) : 22,
    username: options.user || 'ubuntu',
    authType: options.key ? 'key' : 'password',
    password: options.password,
    privateKey: options.key,
    sudoPassword: options.sudoPassword || options.password,
    hostAddress: options.hostAddress,
    workspaceRoot: options.workspace || '.',
    registryHost: options.registry,
  };

  const target = await apiFetch('/deployment-targets', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const chalk = await getChalk();
  console.log(
    `Deployment server added: ${chalk.bold(target.name)} (ID: ${target.id})`,
  );
}

export async function deleteTarget(id: string) {
  await apiFetch(`/deployment-targets/${id}`, { method: 'DELETE' });
  console.log(`Deployment server ${id} deleted.`);
}

export async function resolveTargetId(idOrName?: string): Promise<number | undefined> {
  if (!idOrName) return undefined;
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
