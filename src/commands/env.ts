import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';

export async function envListCommand(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const envVars = project.envVariables || {};
  const keys = Object.keys(envVars);

  if (keys.length === 0) {
    console.log(chalk.yellow('No environment variables set.'));
    return;
  }

  const table = await createTable({
    head: ['Key', 'Value'],
  });

  for (const key of keys.sort()) {
    const val = envVars[key];
    // Mask sensitive values
    const display = key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('key')
      ? val.slice(0, 4) + '****'
      : val;
    table.push([key, display]);
  }

  console.log(chalk.bold(`Environment variables for "${project.name}":`));
  console.log(formatAnsiForOutput(table.toString()));
}

export async function envSetCommand(
  idOrName: string,
  keyValue: string,
  options: { target?: string },
) {
  const chalk = await getChalk();

  const [key, ...rest] = keyValue.split('=');
  const value = rest.join('=');

  if (!key || value === undefined) {
    throw new Error('Usage: deploy env set <project> KEY=VALUE');
  }

  const project = await resolveProject(idOrName);
  const target = options.target || 'backend';

  await apiFetch(`/projects/${project.id}/env`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target }),
  });

  console.log(chalk.green(`Set ${key} for "${project.name}" (target: ${target})`));
}

export async function envDeleteCommand(idOrName: string, key: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  await apiFetch(`/projects/${project.id}/env/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });

  console.log(chalk.green(`Deleted ${key} from "${project.name}"`));
}
