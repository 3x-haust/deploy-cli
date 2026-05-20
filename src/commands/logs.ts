import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { loadConfig, getApiUrl } from '../config.js';
import {
  createTable,
  formatAnsiForOutput,
  getChalk,
} from '../terminal.js';

export async function logsCommand(
  idOrName: string,
  options: { follow?: boolean; deploymentId?: string },
) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);

  // Get specific deployment or latest
  let deployment: any;
  if (options.deploymentId) {
    deployment = await apiFetch(
      `/projects/${project.id}/deployments/${options.deploymentId}`,
    );
  } else {
    const deployments = await apiFetch(`/projects/${project.id}/deployments`);
    if (deployments.length === 0) {
      console.log(chalk.yellow('No deployments found.'));
      return;
    }
    deployment = deployments[0];
  }

  console.log(
    chalk.bold(`Logs for deployment #${deployment.id} (${deployment.status})`),
  );
  console.log(chalk.gray('─'.repeat(60)));

  if (deployment.buildLogs) {
    console.log(formatAnsiForOutput(deployment.buildLogs));
  }

  // Follow mode with WebSocket
  if (options.follow && (deployment.status === 'building' || deployment.status === 'queued')) {
    const config = loadConfig();
    const apiUrl = getApiUrl();
    const wsUrl = apiUrl.replace(/^http/, 'ws');

    console.log(chalk.gray('\nFollowing live logs (Ctrl+C to stop)...\n'));

    try {
      const { default: WebSocket } = await import('ws');
      const ws = new WebSocket(`${wsUrl}/deployments`, {
        headers: config?.jwt ? { Authorization: `Bearer ${config.jwt}` } : {},
      });

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'log' && msg.data?.deploymentId === deployment.id) {
            process.stdout.write(formatAnsiForOutput(msg.data.line));
          }
          if (msg.event === 'status' && msg.data?.deploymentId === deployment.id) {
            const status = msg.data.status;
            const color = status === 'ready' ? chalk.green : status === 'error' ? chalk.red : chalk.yellow;
            console.log(color(`\nDeployment status: ${status}`));
            if (status === 'ready' || status === 'error') {
              ws.close();
            }
          }
        } catch {}
      });

      ws.on('error', (err: Error) => {
        console.error(chalk.red(`WebSocket error: ${err.message}`));
      });

      await new Promise<void>((resolve) => {
        ws.on('close', resolve);
        process.on('SIGINT', () => {
          ws.close();
          resolve();
        });
      });
    } catch {
      console.log(chalk.yellow('Live log streaming not available. Showing stored logs only.'));
    }
  }
}

export async function deploymentsCommand(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const deployments = await apiFetch(`/projects/${project.id}/deployments`);

  if (deployments.length === 0) {
    console.log(chalk.yellow('No deployments found.'));
    return;
  }

  const table = await createTable({
    head: ['ID', 'Status', 'Branch', 'Commit', 'URL', 'Created'],
  });

  for (const d of deployments) {
    const status =
      d.status === 'ready' ? chalk.green(d.status) :
      d.status === 'building' ? chalk.yellow(d.status) :
      d.status === 'error' ? chalk.red(d.status) :
      chalk.gray(d.status);

    table.push([
      d.id,
      status,
      d.branch || '-',
      (d.commit || '-').slice(0, 8),
      d.url || '-',
      new Date(d.createdAt).toLocaleString(),
    ]);
  }

  console.log(chalk.bold(`Deployments for "${project.name}":`));
  console.log(formatAnsiForOutput(table.toString()));
}
