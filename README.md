# rjmlaird-dev

Source for [dev.rjmlaird.co.uk](https://dev.rjmlaird.co.uk): the developer hub of Ryan Laird. It indexes labs, tools, apps and APIs, shows live GitHub activity and the working stack, and explains the background behind the work.

Built with Astro 5 (static output). This repository contains **no documentation content**; `rjmlaird-docs` is a separate project and is only linked from the footer (`SITE.links.docs` in `src/site.ts`).

## Develop

Requirements: Node.js 20+ and pnpm 10+.

```bash
corepack enable
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # astro check + astro build -> dist/
```

## Pages

| Route | Source | Data |
|---|---|---|
| `/` | `src/pages/index.astro` | Static copy; `src/site.ts` for links |
| `/projects/` | `src/pages/projects.astro` | GitHub Projects v2 (GraphQL) if `DEV_TOKEN` is set, otherwise repository cards |
| `/open-source/` | `src/pages/open-source.astro` | GitHub REST API at build time, with a saved snapshot as fallback |
| `/boards/`, `/boards/<slug>/` | `src/pages/boards/` | `boards` content collection, loaded from `src/data/github-projects.json` |
| `/stack/` | `src/pages/stack.astro` | `src/data/techstack.json` |
| `/about/` | `src/pages/about.astro` | Static copy |

## Project boards collection

GitHub Projects (v2) boards are an Astro content collection, `boards`, defined in `src/content.config.ts`. A `file()` loader reads the committed snapshot `src/data/github-projects.json`, validates every board, field and item with zod, and keeps **public boards only**. `src/lib/github-projects.ts` exposes `getBoards()`, which runs the collection entries through the pure helpers in `src/lib/github-projects-core.ts` (grouping by status, counts, timeline range).

```bash
export GITHUB_TOKEN=ghp_...   # read:project (+ repo for private repositories' issues)
pnpm sync:boards              # rewrites src/data/github-projects.json
pnpm test                     # board helper and sync tests
```

The build itself never calls GitHub for boards, so they render even when the API is unreachable.

## Configuration

- **`src/site.ts`**: hostnames, GitHub username, organisations, canonical Person `@id`, nav. Change links here, not in pages.
- **`DEV_TOKEN`** (optional): token with `read:project` (and `read:org` for organisation boards). Copy `.env.example` to `.env` locally; in CI add it as a repository secret.
- **GitHub fallback**: if the API is unreachable or rate-limited, `src/lib/github.ts` uses `src/data/github-repos.snapshot.json` and the pages say so. Refresh the snapshot occasionally (public, non-fork repos only).
- **Stack data**: edit `src/data/techstack.json`. Each item has a `usage` level (`current`, `working_knowledge`, `legacy`, `exploratory`, `indirect_dependency`).

## Deploy

`.github/workflows/deploy.yml` builds on push to `main`, on pull requests (build only) and daily (to refresh GitHub data), then publishes to GitHub Pages. `public/CNAME` is set to `dev.rjmlaird.co.uk`.

## Structured data

Each page emits a JSON-LD `@graph` (`WebSite`, `WebPage`, plus a reference-only `Person` using `SITE.personId`). The full Person node is meant to live on rjmlaird.co.uk; keep `personId` identical to the `@id` used there.
