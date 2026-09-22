# Getting Started (WIP Repo)

This guide is for working in the private **`opensuitemcp-wip`** repo before changes are promoted to the public [opensuitemcp](https://github.com/unstackedapps/opensuitemcp) repo.

## What this repo is

| Repo | Visibility | Purpose |
| --- | --- | --- |
| `opensuitemcp-wip` | Private | Day-to-day development, CI, and pre-release testing |
| `opensuitemcp` | Public | Release-quality code only |

Do all feature work in **wip**. Open PRs to **public `main`** only when work is tested and ready to ship.

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io)
- Docker (for local Postgres, Redis, and SearXNG)
- GitHub access to `unstackedapps/opensuitemcp-wip`

## One-time setup

```bash
git clone https://github.com/unstackedapps/opensuitemcp-wip.git
cd opensuitemcp-wip
git checkout develop
pnpm install
pnpm setup:backend
pnpm skills:sync
pnpm db:migrate
```

Add the public repo as a read/sync remote (once):

```bash
git remote add public https://github.com/unstackedapps/opensuitemcp.git
```

Start the app locally:

```bash
pnpm dev
```

App: [http://localhost:3000](http://localhost:3000)

Configure NetSuite, AI providers, and skills in the App Portal after first login.

## Branches

| Branch | Use it for |
| --- | --- |
| `develop` | **Default working branch** — merge all feature work here |
| `main` | Mirror of public release baseline — do not commit here day-to-day |
| `feature/*` | One task or change per branch |

`develop` is ahead of `main` by WIP-only files (CI workflows and smoke scripts). That is expected.

## Daily workflow

```bash
git checkout develop
git pull origin develop

git checkout -b feature/short-description
# ... edit, test locally ...
git push -u origin feature/short-description
```

Open a pull request in the **wip repo**:

**`feature/short-description` → `develop`**

After merge, GitHub Actions runs lint, unit tests, and build on `develop`. (E2E is disabled in CI until Postgres/Redis services are wired up — run `pnpm test` locally when needed.)

## Before opening a PR

Run locally:

```bash
pnpm lint
pnpm build
pnpm test
```

For larger or infra-related changes, run the dev smoke script:

```bash
./scripts/smoke-dev.sh
```

Use this on local bare metal and on AWS/GCP dev environments when validating deploy paths.

## Stay synced with public

Pull public releases into `develop` regularly so promotion PRs stay small:

```bash
git fetch public
git checkout develop
git merge public/main
git push origin develop
```

Resolve conflicts on `develop`, not on public `main`.

## Promoting to public

**Do not merge all of `develop` into public `main`.** `develop` contains WIP-only files that must stay private.

### WIP-only files (never promote)

These exist on `develop` only and should **not** appear in the public repo:

- `docs/getting-started.md` (this file)
- `docs/mcp-server-sandbox-handoff.md` (deploy/ops notes referencing the private overlay)
- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml.disabled`
- WIP-specific changes in `.github/workflows/lint.yml` (if public differs)
- `scripts/smoke-dev.sh`

Product code, public README, CHANGELOG, and shared workflows **do** get promoted.

### How to promote (recommended)

Promote **product commits only**, not the whole `develop` branch.

```bash
git fetch public
git fetch origin

# Branch from public main
git checkout -b promote/v4.x.x public/main

# Cherry-pick only the product commits from develop (not WIP setup commits)
git cherry-pick <commit-sha-1> <commit-sha-2>

git push -u origin promote/v4.x.x
```

Open a PR: **`promote/v4.x.x` → `opensuitemcp` `main`** (cross-repo or push branch to public fork).

Before merging, confirm the PR **does not** include any WIP-only paths listed above.

Alternative: open a PR from `develop`, then **remove WIP-only files in that PR** before merge. Cherry-picking is usually cleaner.

### After public merge — sync wip

Keep wip `main` mirroring public, and keep WIP-only files on `develop`:

```bash
git checkout main
git merge public/main
git push origin main

git checkout develop
git merge public/main
git push origin develop
```

`develop` keeps this doc and WIP CI; public (and wip `main`) stay clean.

### Release checklist

1. CI green on `develop`
2. Smoke checks passed (local, bare metal, AWS, GCP as applicable)
3. Promotion PR contains **product changes only**
4. CHANGELOG / version updated in the promotion PR
5. After merge: sync wip `main` and `develop` from public (see above)

That promotion PR is the only step that changes the public repo.

## Quick reference

```text
feature branch  →  develop (wip)  →  main (public)
     ↑                    ↑
  daily work         CI + smoke tests
```

**Do:** branch from `develop`, PR back to `develop`, promote to public when ready.

**Don't:** commit directly to wip `main` or push untested work to public `main`.

## Help

- Public README: setup details, NetSuite prerequisites, and feature docs
- Repo admins: Caleb Moore, Steven Scheppelman (`scheppsr77`)
