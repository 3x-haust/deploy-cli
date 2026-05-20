import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { listProjects, getProject, createProject, deleteProject, inspectProject } from './commands/projects.js';
import { deployCommand, redeployCommand } from './commands/deploy.js';
import { logsCommand, deploymentsCommand } from './commands/logs.js';
import { envListCommand, envSetCommand, envDeleteCommand } from './commands/env.js';
import { settingsGetCommand, settingsUpdateCommand } from './commands/settings.js';
import { membersListCommand, membersInviteCommand, membersRemoveCommand } from './commands/members.js';
import { reposListCommand, branchesCommand } from './commands/repos.js';
import { blueprintCommand } from './commands/blueprint.js';
import {
  secretsListCommand,
  secretsSetCommand,
  secretsGetCommand,
  secretsDeleteCommand,
  secretsImportCommand,
  secretsClearCommand,
} from './commands/secrets.js';
import { sshInteractiveCommand, sshRunCommand } from './commands/ssh.js';
import {
  createTarget,
  deleteTarget,
  listTargets,
  provisionTarget,
  updateTarget,
} from './commands/targets.js';
import {
  skillsListCommand,
  skillsInstallCommand,
  skillsUninstallCommand,
} from './commands/skills.js';

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name('deploy')
  .description('CLI for Deploy platform — manage projects and deployments from the terminal')
  .version(__PKG_VERSION__);

// ── Auth ──
program
  .command('login')
  .description('Login via GitHub OAuth (opens browser)')
  .option('--api <url>', 'API server URL')
  .action((opts) => loginCommand(opts).catch(handleError));

program
  .command('whoami')
  .description('Show current logged-in user')
  .action(async () => {
    try {
      const { apiFetch } = await import('./api.js');
      const user = await apiFetch('/auth/me');
      console.log(`Logged in as ${user.username} (${user.role})`);
    } catch (e) { handleError(e); }
  });

// ── Projects ──
const projects = program.command('projects').description('Manage projects');

projects
  .command('list')
  .alias('ls')
  .description('List all projects')
  .action(() => listProjects().catch(handleError));

projects
  .command('info <project>')
  .description('Show project details (ID or name)')
  .action((id) => getProject(id).catch(handleError));

projects
  .command('create')
  .description('Create project from a Git repository')
  .requiredOption('-r, --repo <repo>', 'GitHub repo (owner/name or full URL)')
  .option('-n, --name <name>', 'Project name')
  .option('-b, --branch <branch>', 'Branch to deploy')
  .option('-d, --domain <domain>', 'Custom domain')
  .option('-e, --env <KEY=VALUE...>', 'Private env variables', collect, [])
  .option('--public-env <KEY=VALUE...>', 'Public env variables', collect, [])
  .option('-s, --strategy <strategy>', 'Deployment strategy (rolling-update|blue-green|canary)')
  .option('-t, --target <server>', 'Deployment server ID or name')
  .option('--no-deploy', 'Create without deploying')
  .action((opts) => createProject(opts).catch(handleError));

projects
  .command('delete <project>')
  .description('Delete a project')
  .action((id) => deleteProject(id).catch(handleError));

projects
  .command('inspect')
  .description('Inspect a repository without creating a project')
  .requiredOption('-r, --repo <repo>', 'GitHub repo (owner/name or full URL)')
  .option('-b, --branch <branch>', 'Branch')
  .option('-n, --name <name>', 'Project name hint')
  .action((opts) => inspectProject(opts).catch(handleError));

// ── Deploy ──
program
  .command('deploy <project>')
  .description('Trigger a new deployment')
  .option('-b, --branch <branch>', 'Branch to deploy')
  .option('-d, --domain <domain>', 'Override domain')
  .option('-e, --env <KEY=VALUE...>', 'Private env overrides', collect, [])
  .option('--public-env <KEY=VALUE...>', 'Public env overrides', collect, [])
  .option('-s, --strategy <strategy>', 'Deployment strategy')
  .option('-t, --target <server>', 'Deployment server ID or name')
  .action((project, opts) => deployCommand(project, opts).catch(handleError));

program
  .command('redeploy <project>')
  .description('Redeploy current version')
  .option('-s, --strategy <strategy>', 'Deployment strategy')
  .option('-t, --target <server>', 'Deployment server ID or name')
  .action((project, opts) => redeployCommand(project, opts).catch(handleError));

// ── Deployment targets ──
const targets = program
  .command('targets')
  .description('Manage SSH deployment servers');

targets
  .command('list')
  .alias('ls')
  .description('List deployment servers')
  .action(() => listTargets().catch(handleError));

targets
  .command('add')
  .description('Add an SSH deployment server')
  .requiredOption('--host <host>', 'Server IP or host')
  .option('--name <name>', 'Display name')
  .option('--port <port>', 'SSH port', '22')
  .option('--user <user>', 'SSH user', 'ubuntu')
  .option('--password <password>', 'SSH password')
  .option('--key <privateKey>', 'SSH private key contents')
  .option('--sudo-password <password>', 'sudo password')
  .option('--host-address <address>', 'Address reachable by cluster/registry')
  .option('--workspace <path>', 'Remote workspace root', '.')
  .option('--registry <hostPort>', 'Docker registry host:port')
  .action((opts) => createTarget(opts).catch(handleError));

targets
  .command('update <server>')
  .alias('edit')
  .description('Update an SSH deployment server')
  .option('--name <name>', 'Display name')
  .option('--host <host>', 'Server IP or host')
  .option('--port <port>', 'SSH port')
  .option('--user <user>', 'SSH user')
  .option('--password <password>', 'SSH password')
  .option('--key <privateKey>', 'SSH private key contents')
  .option('--sudo-password <password>', 'sudo password')
  .option('--host-address <address>', 'Address reachable by cluster/registry')
  .option('--workspace <path>', 'Remote workspace root')
  .option('--registry <hostPort>', 'Docker registry host:port')
  .action((server, opts) => updateTarget(server, opts).catch(handleError));

targets
  .command('provision <server>')
  .alias('bootstrap')
  .description('Install Docker, k3s, registry, ingress, cert-manager, and issuer on a server')
  .action((server) => provisionTarget(server).catch(handleError));

targets
  .command('delete <id>')
  .alias('del')
  .description('Delete a deployment server')
  .action((id) => deleteTarget(id).catch(handleError));

// ── Logs & Deployments ──
program
  .command('logs <project>')
  .description('Show build logs')
  .option('-f, --follow', 'Follow live logs')
  .option('--deployment-id <id>', 'Specific deployment ID')
  .action((project, opts) => logsCommand(project, opts).catch(handleError));

program
  .command('deployments <project>')
  .description('List deployments for a project')
  .action((project) => deploymentsCommand(project).catch(handleError));

// ── Env ──
const env = program.command('env').description('Manage environment variables');

env
  .command('list <project>')
  .alias('ls')
  .description('List env variables')
  .action((project) => envListCommand(project).catch(handleError));

env
  .command('set <project> <KEY=VALUE>')
  .description('Set an env variable')
  .option('-t, --target <target>', 'Target: backend|frontend|all', 'backend')
  .action((project, kv, opts) => envSetCommand(project, kv, opts).catch(handleError));

env
  .command('delete <project> <key>')
  .alias('del')
  .description('Delete an env variable')
  .action((project, key) => envDeleteCommand(project, key).catch(handleError));

// ── Settings ──
const settings = program.command('settings').description('Manage project settings');

settings
  .command('get <project>')
  .description('Show project settings')
  .action((project) => settingsGetCommand(project).catch(handleError));

settings
  .command('update <project>')
  .description('Update project settings')
  .option('--install-command <cmd>', 'Install command')
  .option('--output-dir <dir>', 'Output directory')
  .option('--port <port>', 'Port number')
  .option('--db-type <type>', 'Database type (none|postgresql|mysql)')
  .option('--redis', 'Enable Redis')
  .option('--no-redis', 'Disable Redis')
  .option('--elasticsearch', 'Enable Elasticsearch')
  .option('--no-elasticsearch', 'Disable Elasticsearch')
  .option('--auto-deploy', 'Enable auto-deploy')
  .option('--no-auto-deploy', 'Disable auto-deploy')
  .option('--auto-deploy-branch <branch>', 'Auto-deploy branch')
  .option('--strategy <strategy>', 'Deployment strategy')
  .option('--cloudflare-proxied', 'Enable Cloudflare proxy')
  .option('--no-cloudflare-proxied', 'Disable Cloudflare proxy')
  .option('--pvc', 'Enable PVC')
  .option('--no-pvc', 'Disable PVC')
  .option('--pvc-size <size>', 'PVC size (e.g. 5Gi)')
  .option('--pvc-mount-path <path>', 'PVC mount path')
  .action((project, opts) => settingsUpdateCommand(project, opts).catch(handleError));

// ── Members ──
const members = program.command('members').description('Manage project members');

members
  .command('list <project>')
  .alias('ls')
  .description('List project members')
  .action((project) => membersListCommand(project).catch(handleError));

members
  .command('invite <project> <username>')
  .description('Invite a user to the project')
  .action((project, username) => membersInviteCommand(project, username).catch(handleError));

members
  .command('remove <project> <userId>')
  .description('Remove a member from the project')
  .action((project, userId) => membersRemoveCommand(project, userId).catch(handleError));

// ── Repos ──
const repos = program.command('repos').description('Browse GitHub repositories');

repos
  .command('list')
  .alias('ls')
  .description('List accessible repositories')
  .option('--org <org>', 'Filter by organization')
  .action((opts) => reposListCommand(opts).catch(handleError));

repos
  .command('branches <repo>')
  .description('List branches of a repository')
  .action((repo) => branchesCommand(repo).catch(handleError));

// ── Blueprint ──
program
  .command('blueprint <project>')
  .description('Show project deployment blueprint')
  .action((project) => blueprintCommand(project).catch(handleError));

// ── Secrets (local machine only) ──
const secrets = program
  .command('secrets')
  .description('Manage local secrets (SSH creds, tokens) — stored 0600 in ~/.deploy-cli');

secrets
  .command('list')
  .alias('ls')
  .description('List stored secret keys (values masked)')
  .action(() => secretsListCommand().catch(handleError));

secrets
  .command('set <KEY=VALUE>')
  .description('Set a secret')
  .option('--file <path>', 'Read value from file instead of arg')
  .option('--stdin', 'Read value from stdin')
  .action((kv, opts) => secretsSetCommand(kv, opts).catch(handleError));

secrets
  .command('get <key>')
  .description('Print a secret value (masked by default)')
  .option('--reveal', 'Print the real value')
  .action((key, opts) => secretsGetCommand(key, opts).catch(handleError));

secrets
  .command('delete <key>')
  .alias('del')
  .description('Delete a secret')
  .action((key) => secretsDeleteCommand(key).catch(handleError));

secrets
  .command('import <file>')
  .description('Import secrets from a .env-style file')
  .option('--overwrite', 'Overwrite existing keys')
  .action((file, opts) => secretsImportCommand(file, opts).catch(handleError));

secrets
  .command('clear')
  .description('Remove the local secrets file')
  .action(() => secretsClearCommand().catch(handleError));

// ── SSH (uses stored SSH_* secrets) ──
const ssh = program
  .command('ssh')
  .description('SSH into the configured server using stored SSH_* secrets');

ssh
  .command('open', { isDefault: true })
  .description('Open an interactive SSH session')
  .action(() => sshInteractiveCommand().catch(handleError));

ssh
  .command('run <command...>')
  .description('Run a command on the server and print output')
  .option('--timeout <seconds>', 'Command timeout in seconds', '120')
  .option('--json', 'Emit JSON {code,stdout,stderr,timedOut}')
  .action((parts: string[], opts) =>
    sshRunCommand(parts.join(' '), opts).catch(handleError),
  );

// ── Skills (Claude Code skill installer) ──
const skills = program
  .command('skills')
  .description('Install Claude Code skills bundled with this CLI');

skills
  .command('list')
  .alias('ls')
  .description('List skills bundled with this CLI install')
  .action(() => skillsListCommand().catch(handleError));

skills
  .command('install [name]')
  .description('Copy bundled skills to ~/.claude/skills (or a project dir)')
  .option('--project <path>', 'Install into <path>/.claude/skills instead of user home')
  .option('--force', 'Overwrite existing skill files')
  .action((name, opts) => skillsInstallCommand(name, opts).catch(handleError));

skills
  .command('uninstall <name>')
  .description('Remove an installed skill')
  .option('--project <path>', 'Uninstall from <path>/.claude/skills')
  .action((name, opts) => skillsUninstallCommand(name, opts).catch(handleError));

// ── Helpers ──
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
}

program.parse();
