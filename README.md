# deploy-cli

CLI for the Deploy platform. Manage projects, deployments, environment variables, and settings from the terminal.

## Setup

```bash
pnpm install
pnpm build        # esbuild -> dist/index.js
node dist/index.js login          # GitHub OAuth (opens browser)
node dist/index.js login --api https://your-api.com  # custom API server
```

Config is stored at `~/.deploy-cli/config.json` (jwt, refreshToken, apiUrl). Default API: `http://localhost:3000`. Override with `DEPLOY_API_URL` env var.

## Command Reference

Projects can be referenced by **numeric ID** or **name** (case-insensitive).

### Auth

```bash
deploy login [--api <url>]    # GitHub OAuth login
deploy whoami                 # Show logged-in user
```

### Projects

```bash
deploy projects list                         # List all projects
deploy projects info <project>               # Show project details + latest deployment
deploy projects create -r owner/repo         # Create & auto-deploy from GitHub repo
  [-n name] [-b branch] [-d domain]
  [-e KEY=VALUE ...] [--public-env KEY=VALUE ...]
  [-s rolling-update|blue-green|canary]
  [--no-deploy]                              # Create without deploying
deploy projects delete <project>             # Delete a project
deploy projects inspect -r owner/repo        # Inspect repo without creating project
  [-b branch] [-n name]
```

### Deploy

```bash
deploy deploy <project>                      # Trigger deployment
  [-b branch] [-d domain]
  [-e KEY=VALUE ...] [--public-env KEY=VALUE ...]
  [-s strategy]
deploy redeploy <project> [-s strategy]      # Redeploy current version
```

### Logs & Deployments

```bash
deploy logs <project>                        # Show build logs (latest deployment)
  [-f|--follow]                              # Stream live logs via WebSocket
  [--deployment-id <id>]                     # Specific deployment
deploy deployments <project>                 # List all deployments (table)
```

### Environment Variables

```bash
deploy env list <project>                    # List env vars (secrets masked)
deploy env set <project> KEY=VALUE           # Set env var
  [-t backend|frontend|all]                  # Target (default: backend)
deploy env delete <project> <key>            # Delete env var
```

### Settings

```bash
deploy settings get <project>               # Show all settings
deploy settings update <project>             # Update settings
  [--install-command <cmd>]
  [--output-dir <dir>]
  [--port <port>]
  [--db-type none|postgresql|mysql]
  [--redis | --no-redis]
  [--elasticsearch | --no-elasticsearch]
  [--auto-deploy | --no-auto-deploy]
  [--auto-deploy-branch <branch>]
  [--strategy <strategy>]
  [--cloudflare-proxied | --no-cloudflare-proxied]
  [--pvc | --no-pvc]
  [--pvc-size <size>]                        # e.g. 5Gi
  [--pvc-mount-path <path>]
```

### Members

```bash
deploy members list <project>               # List project members
deploy members invite <project> <username>   # Invite user by GitHub username
deploy members remove <project> <userId>     # Remove member by user ID
```

### Repos

```bash
deploy repos list [--org <org>]             # List GitHub repos accessible to user
deploy repos branches <owner/repo>          # List branches of a repo
```

### Blueprint

```bash
deploy blueprint <project>                  # Show deployment blueprint (layout, units, datastores)
```

### Secrets (local machine only)

Stored at `~/.deploy-cli/secrets.json` with file mode `0600` and directory mode `0700`. Never sent to any server — used by `deploy ssh` and the `deploy-troubleshoot` Claude skill.

```bash
deploy secrets import <file> [--overwrite]  # Import from a .env-style file (multiline-quoted values OK)
deploy secrets list                         # List keys with masked values
deploy secrets set KEY=VALUE                # Set a single key
  [--file <path>]                           # ...or read value from file
  [--stdin]                                 # ...or read value from stdin
deploy secrets get <key> [--reveal]         # Print value (masked unless --reveal)
deploy secrets delete <key>                 # Delete one key
deploy secrets clear                        # Remove the whole secrets file
```

### SSH

Uses stored `SSH_HOST`, `SSH_USER`, `SSH_PORT`, and `SSH_KEY` (or `SSH_PASSWORD` if `sshpass` is installed). The private key is written to an ephemeral `0600` tmpfile and unlinked on exit — never persisted on disk, never echoed.

```bash
deploy ssh                                  # Open interactive session
deploy ssh run "<command>"                  # Run command, stream stdout/stderr
  [--timeout <seconds>]                     # Default 120
  [--json]                                  # Emit {code,stdout,stderr,timedOut}
```

### Deployment Servers

Register SSH servers in the Deploy API and select them when deploying:

```bash
deploy targets add --name prod --host 125.186.161.87 --port 2202 --user ubuntu --password '...'
deploy targets list
deploy targets update prod --workspace /home/ubuntu/apps --registry 125.186.161.87:5000
deploy targets provision prod
deploy deploy my-project --target prod
deploy redeploy my-project --target prod
```

## Claude Code skills

Two skills ship with the package:

- `deploy` — everyday operations (create / deploy / redeploy / env / settings / logs / members).
- `deploy-troubleshoot` — diagnose failed deployments (build logs → pod state → host checks → fix → redeploy), using `deploy ssh run` so SSH credentials never hit the command line.

Install them into Claude Code after `pnpm i -g @3xhaust/deploy-cli`:

```bash
deploy skills list                           # show what's bundled
deploy skills install                        # install all to ~/.claude/skills
deploy skills install deploy                 # install just one
deploy skills install --project .            # install into ./.claude/skills
deploy skills uninstall deploy-troubleshoot
```

`install` is idempotent — same content is skipped, diverged content requires `--force`.

## Common Workflows

**Create and deploy a project:**
```bash
deploy login
deploy projects create -r myorg/myapp -b main -d myapp.example.com -e DATABASE_URL=postgres://...
deploy logs myapp -f
```

**Update settings and redeploy:**
```bash
deploy settings update myapp --port 8080 --db-type postgresql --redis --auto-deploy
deploy redeploy myapp
```

**Manage env vars:**
```bash
deploy env set myapp SECRET_KEY=abc123 -t backend
deploy env set myapp NEXT_PUBLIC_API=https://api.example.com -t frontend
deploy env list myapp
```

## API Endpoints Used

| Command | Method | Endpoint |
|---|---|---|
| whoami | GET | `/auth/me` |
| login | GET | `/auth/github?state=cli:{port}` |
| projects list | GET | `/projects` |
| projects info | GET | `/projects/:id` |
| projects create | POST | `/projects/auto` |
| projects delete | DELETE | `/projects/:id` |
| projects inspect | POST | `/projects/auto/inspect` |
| deploy | POST | `/projects/:id/deployments/auto` |
| redeploy | POST | `/projects/:id/deployments/redeploy` |
| logs | GET | `/projects/:id/deployments` or `/projects/:id/deployments/:did` |
| logs -f | WS | `/deployments` (events: `log`, `status`) |
| deployments | GET | `/projects/:id/deployments` |
| env list | GET | `/projects/:id` (reads `envVariables`) |
| env set | POST | `/projects/:id/env` body: `{key, value, target}` |
| env delete | DELETE | `/projects/:id/env/:key` |
| settings get | GET | `/projects/:id/settings` |
| settings update | POST | `/projects/:id/settings` |
| members list | GET | `/projects/:id/members` |
| members invite | POST | `/projects/:id/members` body: `{username}` |
| members remove | DELETE | `/projects/:id/members/:userId` |
| repos list | GET | `/github/repositories[?org=]` |
| repos branches | GET | `/github/branches?fullName=` |
| blueprint | GET | `/projects/:id/blueprint` |

## Deployment Strategies

- `rolling-update` (default)
- `blue-green`
- `canary`

## Error Handling

All commands exit with code 1 on failure. API errors surface the server's `message` field when available. Auth tokens auto-refresh on 401 responses.
