import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { getChalk } from '../terminal.js';
import { resolveTargetId } from './targets.js';

export async function deployCommand(
  idOrName: string,
  options: {
    branch?: string;
    domain?: string;
    env?: string[];
    publicEnv?: string[];
    strategy?: string;
    target?: string;
  },
) {
  const { default: ora } = await import('ora');
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);

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

  const body: any = {};
  if (options.branch) {
    body.source = {
      kind: 'git',
      url: project.repositoryUrl,
      branch: options.branch,
      fullName: project.repositoryFullName,
    };
  }
  if (options.domain) body.domain = options.domain;
  if (Object.keys(privateEnv).length > 0) body.privateEnv = privateEnv;
  if (Object.keys(publicEnvMap).length > 0) body.publicEnv = publicEnvMap;
  if (options.strategy) body.deploymentStrategy = options.strategy;
  const deploymentTargetId = await resolveTargetId(options.target);
  if (deploymentTargetId) body.deploymentTargetId = deploymentTargetId;

  const spinner = ora(`Deploying "${project.name}"...`).start();

  const deployment = await apiFetch(`/projects/${project.id}/deployments/auto`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  spinner.succeed(
    `Deployment #${deployment.id} started (${chalk.yellow(deployment.status)})`,
  );
  console.log(`  Use ${chalk.cyan(`deploy logs ${idOrName}`)} to follow build logs.`);
}

export async function redeployCommand(
  idOrName: string,
  options: { strategy?: string; target?: string },
) {
  const { default: ora } = await import('ora');
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const spinner = ora(`Redeploying "${project.name}"...`).start();

  const body: any = {};
  if (options.strategy) body.deploymentStrategy = options.strategy;
  const deploymentTargetId = await resolveTargetId(options.target);
  if (deploymentTargetId) body.deploymentTargetId = deploymentTargetId;

  const deployment = await apiFetch(`/projects/${project.id}/deployments/redeploy`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  spinner.succeed(
    `Redeployment #${deployment.id} started (${chalk.yellow(deployment.status)})`,
  );
}
