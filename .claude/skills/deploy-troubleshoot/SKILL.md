---
name: deploy-troubleshoot
description: Diagnose failed Deploy platform deployments — fetch build logs, SSH into the k3s host, inspect pods/services, apply a fix, and redeploy. Invoke when the user reports a broken deployment, a stuck build, a 5xx from a deployed app, or asks you to look at server-side state. Requires `deploy login` and stored SSH secrets.
---

# deploy-troubleshoot

End-to-end debugger for the Deploy platform. Use `deploy-cli` as the single gateway — never paste SSH keys, passwords, or tokens into your chat, tool args, or files.

## Ground rules (read first)

1. **Never print secret values.** `deploy secrets list` and `deploy secrets get <key>` default to masked output. Never pass `--reveal`, never `cat ~/.deploy-cli/secrets.json`, never echo keys or passwords into shell args or commit them.
2. **Never run SSH by hand.** Always use `deploy ssh run "…"` or `deploy ssh open`. The CLI writes the private key to an ephemeral 0600 tmpfile and unlinks it on exit — bypassing it defeats that.
3. **Destructive ops need confirmation.** `rm -rf`, `kubectl delete`, `systemctl stop`, `docker system prune`, database drops, force-pushes — describe the command and ask the user before running. Read-only investigation does not require confirmation.
4. **Trust root-cause over retry.** If a deployment failed, understand *why* before hitting `deploy redeploy`. Redeploying an unchanged failing build just burns minutes.
5. **Touch only the failing project's scope.** Other users may share the cluster — do not restart shared infra (ingress, dns, k3s server) without the user asking.

## Preflight

Run once at the start of every session. If any check fails, stop and tell the user how to fix it.

```bash
deploy whoami                    # must succeed; otherwise: deploy login
deploy secrets list              # must include SSH_HOST, SSH_USER, SSH_PORT, SSH_KEY
deploy ssh run "hostname && uptime"   # must return cleanly
```

If `secrets list` is missing SSH_* keys, the user needs to import them from their `.env`:

```bash
deploy secrets import /path/to/.env --overwrite
```

## Triage workflow

Given a project name or ID (`<project>`), work through this order. Stop when you have a root cause.

### 1. Identify the failing deployment

```bash
deploy deployments <project>             # table of recent deployments; note ID + status
deploy projects info <project>           # framework, domain, port, strategy
deploy logs <project>                    # latest build logs
# or a specific one:
deploy logs <project> --deployment-id <id>
```

Map the status:
- `error` — build or deploy failed → read build logs
- `building` stuck > 5 min → WebSocket-follow `deploy logs <project> -f` for ~30 s
- `ready` but app 5xx → skip to step 3 (runtime)

### 2. Build-time failures

Read the build log tail. Typical classes and fixes:

| Symptom in log | Likely cause | Fix |
|---|---|---|
| `Cannot find module X` / `ERR_MODULE_NOT_FOUND` | missing dep or wrong install cmd | check `package.json`; `deploy settings update <project> --install-command "pnpm install --frozen-lockfile"` |
| `tsc` / type errors | app code | fix repo, commit, `deploy redeploy` |
| `node: not found` / wrong version | base image mismatch | check framework detection; `deploy blueprint <project>` |
| `ECONNREFUSED` to a datastore during build | build shouldn't need DB | remove DB access from build step |
| `no space left on device` | runner disk | `deploy ssh run "df -h"`; escalate to user |

For env-var-related build failures: `deploy env list <project>`, then `deploy env set <project> KEY=VALUE -t backend`.

### 3. Runtime failures (deployed but broken)

Inspect cluster state via SSH. This host runs k3s. Use read-only commands first.

```bash
deploy ssh run "kubectl get pods -A -o wide | grep -i <project>"
deploy ssh run "kubectl describe pod -n <ns> <pod>"
deploy ssh run "kubectl logs -n <ns> <pod> --tail=200"
deploy ssh run "kubectl logs -n <ns> <pod> --previous --tail=200"   # if CrashLoopBackOff
deploy ssh run "kubectl get events -n <ns> --sort-by=.lastTimestamp | tail -30"
deploy ssh run "kubectl get svc,ingress -n <ns>"
```

Common patterns:
- `CrashLoopBackOff` + `exit code 1` → inspect `--previous` logs for the real error
- `ImagePullBackOff` → image tag missing / registry auth broken; check blueprint
- `OOMKilled` → bump resources or fix leak
- `Readiness probe failed` → wrong port or slow startup; check `deploy settings get <project>` `port`
- 5xx at ingress but pod healthy → ingress misconfig or domain mismatch; `deploy ssh run "kubectl get ingress -A"`

### 4. Host-level sanity checks

```bash
deploy ssh run "df -h /"                         # disk
deploy ssh run "free -m"                         # memory
deploy ssh run "systemctl is-active k3s"         # cluster up
deploy ssh run "journalctl -u k3s --since '15 min ago' --no-pager | tail -100"
```

## Fix + redeploy

1. Diagnose → state the cause in one sentence to the user before acting.
2. Apply the smallest targeted fix (env var, setting, or repo change).
3. Redeploy: `deploy redeploy <project>`.
4. Follow: `deploy logs <project> -f` until `ready` or `error`.
5. If still broken, go back to step 1 — do not loop on retries.

## Auto-fix policy

You may apply these fixes without asking:
- Setting / unsetting non-secret env vars the user listed as the problem
- Adjusting install command / port / output dir via `deploy settings update`
- Re-running `deploy redeploy` *once* after a fix
- Restarting a single failing pod (`kubectl rollout restart deployment/<name> -n <ns>`) **scoped to the user's project**

You must ask before:
- Editing files in the user's repo (they commit)
- Deleting PVCs, secrets, namespaces, or any resource outside the project's namespace
- Modifying k3s / ingress / cert-manager / any shared infra
- Running `deploy redeploy` a second time for the same failure — treat as a signal to stop and report

## Secrets cheat sheet

| Key | Purpose |
|---|---|
| `SSH_HOST`, `SSH_USER`, `SSH_PORT` | target for `deploy ssh` |
| `SSH_KEY` | OpenSSH private key (multiline); preferred over password |
| `SSH_PASSWORD` | fallback; requires `sshpass` on local machine |
| `K3S_DEPLOYER_HOST_ADDRESS` | internal k3s endpoint (read-only context) |
| `INGRESS_IP`, `CLOUDFLARE_API_TOKEN` | DNS/ingress debugging context |
| `POSTGRES_*`, `JWT_SECRET`, `GITHUB_CLIENT_SECRET` | platform backend — do not touch unless the user asks |

Read keys only when the workflow needs them. Prefer letting `deploy ssh` consume them implicitly.

## Reporting back

After investigating, give the user:
1. **Root cause** in one sentence (quote the relevant log line).
2. **Action taken** (command + effect), or **proposed action** if you stopped for confirmation.
3. **Verification** (deployment status after redeploy, or the next check to run).
