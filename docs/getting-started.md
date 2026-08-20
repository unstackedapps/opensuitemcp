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

After merge, GitHub Actions runs lint, unit tests, build, and e2e on `develop`.

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

When `develop` is tested and ready:

1. Confirm CI is green on `develop`
2. Confirm smoke checks passed on target environments (local, bare metal, AWS, GCP as applicable)
3. Open a PR: **`opensuitemcp-wip` `develop` → `opensuitemcp` `main`**
4. Include CHANGELOG / version updates if releasing

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
