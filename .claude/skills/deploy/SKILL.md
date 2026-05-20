---
name: deploy
description: Use the Deploy platform CLI to create projects, ship deployments, manage env vars, tweak settings, invite members, and follow build logs. Invoke whenever the user asks to "deploy X", "ship", "create a project from this repo", "set env var", "change port/strategy", "invite <user> to <project>", or reviews deployment status. Requires `deploy login`.
---

# deploy

Everyday driver for the Deploy platform. Prefer CLI-mediated actions over raw HTTP — the CLI handles auth, token refresh, and error shaping. For troubleshooting broken deployments (SSH into the host, pod inspection, log forensics), switch to the `deploy-troubleshoot` skill.

## Ground rules

1. **Login is a hard prerequisite.** Every command below fails without it. Run `deploy whoami` at the start; if it errors, stop and run `deploy login`.
2. **Project reference is flexible.** Every `<project>` slot accepts the numeric ID **or** the name (case-insensitive). When the user says "myapp", pass `myapp` directly — don't look up the ID first.
3. **Secrets stay out of the shell history.** Private env vars, tokens, and keys: prefer `deploy env set` with values the user already has, or `deploy secrets set --stdin` / `--file` for multiline values. Never echo the raw value back to the user unless they ask.
4. **Ask before destructive ops.** `deploy projects delete`, `deploy members remove`, wiping env vars — confirm the target with the user first. Read-only calls (`list`, `info`, `logs`, `blueprint`) do not need confirmation.
5. **Don't guess flags.** If the user's intent needs a flag you're unsure about, run `deploy <cmd> --help` rather than inventing one.

## Preflight

```bash
deploy whoami                # must succeed; otherwise `deploy login`
```

Optional, when the user's request is project-scoped:
```bash
deploy projects list         # find IDs/names if unclear
deploy projects info <project>
```

## Common workflows

### A. Create a project from a GitHub repo

```bash
deploy projects create -r <owner>/<repo> \
  [-n <name>] [-b <branch>] [-d <domain>] \
  [-e KEY=VALUE ...] [--public-env KEY=VALUE ...] \
  [-s rolling-update|blue-green|canary] \
  [--no-deploy]
```

Notes:
- Default branch: `main`. Always pass `-b` if the user named a different one.
- `-e` = private env (backend). `--public-env` = exposed to the frontend bundle.
- Auto-deploys immediately unless `--no-deploy`.
- After creation, follow: `deploy logs <name> -f`.

### B. Deploy / redeploy an existing project

```bash
deploy deploy <project> [-b <branch>] [-d <domain>] \
  [-e KEY=VALUE ...] [--public-env KEY=VALUE ...] [-s <strategy>]
deploy redeploy <project> [-s <strategy>]
```

- `deploy` uses a fresh commit from the given branch.
- `redeploy` rebuilds the current version (useful after an env/settings change).

### C. Env vars

```bash
deploy env list <project>
deploy env set <project> KEY=VALUE [-t backend|frontend|all]   # default: backend
deploy env delete <project> <key>
```

- Target matters. Frontend-visible values **must** use `-t frontend` or they won't be embedded at build time.
- Changing a build-time env does **not** auto-redeploy. Offer to run `deploy redeploy <project>` after.

### D. Settings

```bash
deploy settings get <project>
deploy settings update <project> \
  [--install-command <cmd>] [--output-dir <dir>] [--port <port>] \
  [--db-type none|postgresql|mysql] [--redis|--no-redis] \
  [--elasticsearch|--no-elasticsearch] \
  [--auto-deploy|--no-auto-deploy] [--auto-deploy-branch <branch>] \
  [--strategy rolling-update|blue-green|canary] \
  [--cloudflare-proxied|--no-cloudflare-proxied] \
  [--pvc|--no-pvc] [--pvc-size 5Gi] [--pvc-mount-path /data]
```

Settings changes apply on next deploy. Offer `deploy redeploy <project>` unless the user says otherwise.

### E. Logs & deployment history

```bash
deploy deployments <project>                      # table of recent deployments
deploy logs <project>                             # latest build log (snapshot)
deploy logs <project> -f                          # stream live (WebSocket)
deploy logs <project> --deployment-id <id>        # specific one
```

Use `-f` when the user just triggered a deploy and wants to watch. Stop after `ready` or `error`.

### F. Members

```bash
deploy members list <project>
deploy members invite <project> <github-username>
deploy members remove <project> <userId>          # numeric userId — confirm before running
```

### G. Repos discovery (pre-create)

```bash
deploy repos list [--org <org>]                   # repos user has access to
deploy repos branches <owner>/<repo>              # list branches
deploy projects inspect -r <owner>/<repo> [-b <branch>] [-n <name>]   # dry-run framework detection
```

Use `inspect` before `create` when the user isn't sure the framework / port will be detected correctly.

### H. Blueprint

```bash
deploy blueprint <project>
```

Shows computed deployment layout (units, datastores, ingress). Useful before a strategy change or when debugging port/DB mismatches.

## Decision rules

- **"Deploy my repo"** with no existing project → `projects create`. With an existing project → `deploy` (new commit) or `redeploy` (same commit).
- **"Change the port / DB / strategy"** → `settings update`, then offer `redeploy`.
- **"Set API_KEY"** → `env set -t backend`. If the user says "public" or "frontend" → `-t frontend` and warn that a redeploy is needed for the new bundle.
- **"Is the deployment done?"** → `deployments <project>` for history, or `logs <project> -f` for live. Don't poll — the follow mode handles it.
- **"Something's broken"** → switch to `deploy-troubleshoot` skill.

## Output expectations

Report back in this shape:
1. One-line summary of what ran (command + target).
2. The key result (deployment ID + status, or the settings diff).
3. Next action, if any (e.g., "run `deploy logs <name> -f` to watch the build").

Don't dump full command help or JSON blobs unless the user asks.

## Common pitfalls

- Running `redeploy` without changing anything because a build failed — won't help; inspect logs first.
- Setting a frontend env var with `-t backend` (default) — user won't see it in the browser.
- Passing a numeric string as a project name — if a project is literally named `"42"` this is ambiguous; prefer the ID path.
- Forgetting `--no-deploy` on `projects create` when the user only wants scaffolding.
- Creating a project with no `-b` when their default branch is `develop`, `master`, etc.
