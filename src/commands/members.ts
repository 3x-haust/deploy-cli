import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';

export async function membersListCommand(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const members = await apiFetch(`/projects/${project.id}/members`);

  if (members.length === 0) {
    console.log(chalk.yellow('No members found.'));
    return;
  }

  const table = await createTable({
    head: ['User ID', 'Username', 'Role'],
  });

  for (const m of members) {
    table.push([
      m.userId,
      m.user?.username || '-',
      m.role,
    ]);
  }

  console.log(chalk.bold(`Members of "${project.name}":`));
  console.log(formatAnsiForOutput(table.toString()));
}

export async function membersInviteCommand(idOrName: string, username: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  await apiFetch(`/projects/${project.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });

  console.log(chalk.green(`Invited "${username}" to "${project.name}"`));
}

export async function membersRemoveCommand(idOrName: string, userId: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  await apiFetch(`/projects/${project.id}/members/${userId}`, {
    method: 'DELETE',
  });

  console.log(chalk.green(`Removed user ${userId} from "${project.name}"`));
}
