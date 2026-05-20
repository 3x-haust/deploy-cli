import { apiFetch } from '../api.js';
import { createTable, formatAnsiForOutput, getChalk } from '../terminal.js';
import { resolveTargetId } from './targets.js';

export async function listProjects() {
  const chalk = await getChalk();

  const projects = await apiFetch('/projects');

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects found.'));
    return;
  }

  const table = await createTable({
    head: ['ID', 'Name', 'Framework', 'Domain', 'Status', 'Created'],
  });

  for (const p of projects) {
    const status = p.lastDeployment?.status || 'none';
    const statusColor =
      status === 'ready' ? chalk.green(status) :
      status === 'building' ? chalk.yellow(status) :
      status === 'error' ? chalk.red(status) :
      chalk.gray(status);

    table.push([
      p.id,
      p.name,
      p.framework || '-',
      p.domain || '-',
      statusColor,
      new Date(p.createdAt).toLocaleDateString(),
    ]);
  }

  console.log(formatAnsiForOutput(table.toString()));
}

export async function getProject(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);

  console.log(chalk.bold(`Project: ${project.name}`));
  console.log(`  ID:         ${project.id}`);
  console.log(`  Framework:  ${project.framework || '-'}`);
  console.log(`  Language:   ${project.language || '-'}`);
  console.log(`  Repository: ${project.repositoryFullName}`);
  console.log(`  Branch:     ${project.autoDeployBranch || project.defaultBranch}`);
  console.log(`  Domain:     ${project.domain || '-'}`);
  console.log(`  Port:       ${project.port || '-'}`);
  console.log(`  Auto-deploy: ${project.autoDeployEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  Strategy:   ${project.deploymentStrategy || '-'}`);

  if (project.deployments?.length > 0) {
    const last = project.deployments[0];
    console.log(chalk.bold('\nLatest deployment:'));
    console.log(`  Status:  ${last.status}`);
    console.log(`  Branch:  ${last.branch}`);
    console.log(`  Commit:  ${last.commit}`);
    console.log(`  URL:     ${last.url || '-'}`);
    console.log(`  Created: ${new Date(last.createdAt).toLocaleString()}`);
  }
}

export async function createProject(options: {
  repo: string;
  name?: string;
  branch?: string;
  domain?: string;
  env?: string[];
  publicEnv?: string[];
  strategy?: string;
  target?: string;
  noDeploy?: boolean;
}) {
  const { default: ora } = await import('ora');
  const chalk = await getChalk();

  const privateEnv: Record<string, string> = {};
  for (const e of options.env || []) {
    const [k, ...v] = e.split('=');
    if (k) privateEnv[k] = v.join('=');
  }

  const publicEnvMap: Record<string, string> = {};
  for (const e of options.publicEnv || []) {
    const [k, ...v] = e.split('=');
    if (k) publicEnvMap[k] = v.join('=');
  }

  const repoUrl = options.repo.startsWith('http')
    ? options.repo
    : `https://github.com/${options.repo}.git`;

  const fullName = options.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

  const spinner = ora('Creating project...').start();
  const deploymentTargetId = await resolveTargetId(options.target);

  const result = await apiFetch('/projects/auto', {
    method: 'POST',
    body: JSON.stringify({
      projectName: options.name,
      source: {
        kind: 'git',
        url: repoUrl,
        branch: options.branch || 'main',
        fullName,
      },
      domain: options.domain,
      autoDeployBranch: options.branch,
      privateEnv: Object.keys(privateEnv).length > 0 ? privateEnv : undefined,
      publicEnv: Object.keys(publicEnvMap).length > 0 ? publicEnvMap : undefined,
      deploymentStrategy: options.strategy,
      deploymentTargetId,
      deployNow: !options.noDeploy,
    }),
  });

  const project = result.project || result;
  spinner.succeed(`Project created: ${chalk.bold(project.name)} (ID: ${project.id})`);

  if (result.deployment) {
    console.log(`  Deployment #${result.deployment.id} started (${result.deployment.status})`);
  }
  if (project.domain) {
    console.log(`  Domain: ${project.domain}`);
  }
}

export async function deleteProject(idOrName: string) {
  const { default: ora } = await import('ora');

  const project = await resolveProject(idOrName);
  const spinner = ora(`Deleting project "${project.name}"...`).start();
  await apiFetch(`/projects/${project.id}`, { method: 'DELETE' });
  spinner.succeed(`Project "${project.name}" deleted.`);
}

export async function inspectProject(options: {
  repo: string;
  branch?: string;
  name?: string;
}) {
  const { default: ora } = await import('ora');
  const chalk = await getChalk();

  const repoUrl = options.repo.startsWith('http')
    ? options.repo
    : `https://github.com/${options.repo}.git`;
  const fullName = options.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

  const spinner = ora('Inspecting repository...').start();

  try {
    const result = await apiFetch('/projects/auto/inspect', {
      method: 'POST',
      body: JSON.stringify({
        source: {
          kind: 'git',
          url: repoUrl,
          branch: options.branch || 'main',
          fullName,
        },
        projectName: options.name,
      }),
    });

    spinner.succeed('Inspection complete');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    spinner.fail('Inspection failed');
    const err = error as Error & {
      status?: number;
      code?: string;
      details?: { supportedBackendFrameworks?: string[]; supportedFrontendFrameworks?: string[] };
    };
    console.error(chalk.red(err.message));
    if (err.code === 'NO_SUPPORTED_UNITS') {
      const backends = err.details?.supportedBackendFrameworks?.join(', ') || '';
      const frontends = err.details?.supportedFrontendFrameworks?.join(', ') || '';
      if (backends) console.error(chalk.gray(`  Supported backends: ${backends}`));
      if (frontends) console.error(chalk.gray(`  Supported frontends: ${frontends}`));
    }
    process.exit(1);
  }
}

async function resolveProject(idOrName: string): Promise<any> {
  // Try as ID first
  if (/^\d+$/.test(idOrName)) {
    return apiFetch(`/projects/${idOrName}`);
  }

  // Search by name
  const projects = await apiFetch('/projects');
  const match = projects.find((p: any) =>
    p.name.toLowerCase() === idOrName.toLowerCase()
  );
  if (!match) throw new Error(`Project "${idOrName}" not found`);
  return apiFetch(`/projects/${match.id}`);
}

export { resolveProject };
