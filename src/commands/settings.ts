import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { getChalk } from '../terminal.js';

export async function settingsGetCommand(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const settings = await apiFetch(`/projects/${project.id}/settings`);

  console.log(chalk.bold(`Settings for "${project.name}":`));
  console.log(`  Install command:    ${settings.installCommand || '-'}`);
  console.log(`  Output dir:         ${settings.outputDir || '-'}`);
  console.log(`  Port:               ${settings.port || '-'}`);
  console.log(`  DB type:            ${settings.dbType || 'none'}`);
  console.log(`  Redis:              ${settings.useRedis ? 'yes' : 'no'}`);
  console.log(`  Elasticsearch:      ${settings.useElasticsearch ? 'yes' : 'no'}`);
  console.log(`  Auto-deploy:        ${settings.autoDeployEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  Auto-deploy branch: ${settings.autoDeployBranch || '-'}`);
  console.log(`  Deploy strategy:    ${settings.deploymentStrategy || '-'}`);
  console.log(`  Cloudflare proxied: ${settings.cloudflareProxied ? 'yes' : 'no'}`);
  console.log(`  PVC:                ${settings.usePvc ? `${settings.pvcSize} at ${settings.pvcMountPath}` : 'no'}`);

  if (settings.githubWebhookUrl) {
    console.log(`  Webhook URL:        ${settings.githubWebhookUrl}`);
  }
}

export async function settingsUpdateCommand(
  idOrName: string,
  options: {
    installCommand?: string;
    outputDir?: string;
    port?: string;
    dbType?: string;
    redis?: boolean;
    elasticsearch?: boolean;
    autoDeploy?: boolean;
    autoDeployBranch?: string;
    strategy?: string;
    cloudflareProxied?: boolean;
    pvc?: boolean;
    pvcSize?: string;
    pvcMountPath?: string;
  },
) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);

  // Get current settings to merge
  const current = await apiFetch(`/projects/${project.id}/settings`);

  const body: any = {
    installCommand: options.installCommand ?? current.installCommand ?? '',
    outputDir: options.outputDir ?? current.outputDir ?? '',
    envVariables: current.envVariables || {},
  };

  if (options.port !== undefined) body.port = parseInt(options.port, 10);
  if (options.dbType !== undefined) body.dbType = options.dbType;
  if (options.redis !== undefined) body.useRedis = options.redis;
  if (options.elasticsearch !== undefined) body.useElasticsearch = options.elasticsearch;
  if (options.autoDeploy !== undefined) body.autoDeployEnabled = options.autoDeploy;
  if (options.autoDeployBranch !== undefined) body.autoDeployBranch = options.autoDeployBranch;
  if (options.strategy !== undefined) body.deploymentStrategy = options.strategy;
  if (options.cloudflareProxied !== undefined) body.cloudflareProxied = options.cloudflareProxied;
  if (options.pvc !== undefined) body.usePvc = options.pvc;
  if (options.pvcSize !== undefined) body.pvcSize = options.pvcSize;
  if (options.pvcMountPath !== undefined) body.pvcMountPath = options.pvcMountPath;

  await apiFetch(`/projects/${project.id}/settings`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  console.log(chalk.green(`Settings updated for "${project.name}"`));
}
