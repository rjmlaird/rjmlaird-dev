# rjmlaird-dev

A small, self-contained dev/open-source showcase site. Pulls live from the
GitHub REST API at build time — profile, organisations, recent activity,
repos (personal + orgs, sorted by last commit, filterable by language) — plus
a locally maintained tech stack badge grid. No dependency on any other repo
or API.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## What's on the page

- **Profile** — avatar, bio, follower/repo count badges, link to GitHub
- **Organisations** — cards for each org in `GITHUB_ORGS` (`src/lib/github.ts`)
- **Recent activity** — summarised from the public events feed (pushes, PRs,
  issues, releases), plus a contribution heatmap image via
  [ghchart.rshah.org](https://ghchart.rshah.org) (a third-party service —
  falls back gracefully if it's ever down)
- **Languages across repos** — aggregated from each repo's primary language,
  coloured using the GitHub-standard palette (`src/data/language-colors.json`)
- **Tech stack** — a full badge grid grouped by category
  (`src/data/techstack.json`), each badge linking to the tool's docs
- **Repositories** — sorted by last commit, filterable by language (colours
  match the language chart), each card links to the repo and — if
  `repo.homepage` is set on GitHub — a "Live build" link too

## Raising the GitHub API rate limit

Unauthenticated GitHub API requests are capped at 60/hour per IP. That's fine
for the occasional local build, but if this deploys via CI on every push, set
a `GITHUB_TOKEN` env var (a classic PAT with no scopes — or a fine-grained
token scoped to "public repositories: read" — is enough) to raise that to
5,000/hour:

```sh
GITHUB_TOKEN=ghp_xxx npm run build
```

On Vercel/Netlify/Cloudflare Pages, add `GITHUB_TOKEN` as a build-time
environment variable in the project settings.

If GitHub (or the third-party contribution graph) is ever unreachable or
rate-limited, the page falls back to a "view directly on GitHub" message
rather than failing the build.

## Editing what shows up

- **Username / orgs**: `src/lib/github.ts` — `GITHUB_USERNAME` and `GITHUB_ORGS`
- **Tech stack**: `src/data/techstack.json` — add/remove tools, categories,
  and badge colours/logos (uses [Simple Icons](https://simpleicons.org) slugs)
- **Language colours**: `src/data/language-colors.json` — add any language
  not already covered
- **Styling**: `src/styles/global.css` — same dark navy/teal palette as
  rjmlaird.co.uk, kept deliberately self-contained here rather than shared,
  so this repo has no build dependency on the main site.

## Deploying

Static output (`dist/`) — works on Cloudflare Pages, Netlify, Vercel, or
GitHub Pages. Point a subdomain (e.g. `dev.rjmlaird.co.uk`) at it once deployed.

