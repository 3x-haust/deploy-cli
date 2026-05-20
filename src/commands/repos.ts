import { apiFetch } from '../api.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';

export async function reposListCommand(options: { org?: string }) {
  const chalk = await getChalk();

  const url = options.org
    ? `/github/repositories?org=${encodeURIComponent(options.org)}`
    : '/github/repositories';

  const repos = await apiFetch(url);

  if (repos.length === 0) {
    console.log(chalk.yellow('No repositories found.'));
    return;
  }

  const table = await createTable({
    head: ['Name', 'Language', 'Default Branch', 'Private', 'Updated'],
  });

  for (const r of repos) {
    table.push([
      r.fullName || r.full_name,
      r.language || '-',
      r.defaultBranch || r.default_branch || '-',
      r.private ? 'yes' : 'no',
      r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '-',
    ]);
  }

  console.log(formatAnsiForOutput(table.toString()));
}

export async function branchesCommand(repo: string) {
  const chalk = await getChalk();

  const branches = await apiFetch(
    `/github/branches?fullName=${encodeURIComponent(repo)}`,
  );

  if (branches.length === 0) {
    console.log(chalk.yellow('No branches found.'));
    return;
  }

  console.log(chalk.bold(`Branches for ${repo}:`));
  for (const b of branches) {
    console.log(`  ${b}`);
  }
}
