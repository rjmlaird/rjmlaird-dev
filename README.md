# rjmlaird-dev

A small, self-contained dev/open-source showcase site. Pulls live from the
GitHub REST API at build time — profile, repos (personal + orgs), languages —
plus a locally maintained skills list. No dependency on any other repo or API.

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

If GitHub is ever unreachable or rate-limited, the page falls back to a
"view directly on GitHub" message rather than failing the build.

## Editing what shows up

- **Username / orgs**: `src/lib/github.ts` — `GITHUB_USERNAME` and `GITHUB_ORGS`
- **Skills list**: `src/data/skills.json`
- **Styling**: `src/styles/global.css` — same dark navy/teal palette as
  rjmlaird.co.uk, kept deliberately self-contained here rather than shared,
  so this repo has no build dependency on the main site.

## Deploying

Static output (`dist/`) — works on Cloudflare Pages, Netlify, Vercel, or
GitHub Pages. Point a subdomain (e.g. `dev.rjmlaird.co.uk`) at it once deployed.
