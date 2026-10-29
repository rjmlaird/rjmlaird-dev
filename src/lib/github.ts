// Build-time GitHub data. Everything degrades to a saved snapshot (or an empty
// list) so a rate limit or outage never breaks the build.
import { SITE } from "../site";
import snapshot from "../data/github-repos.snapshot.json";

export const GITHUB_USERNAME = SITE.github;

const API = "https://api.github.com";

/** Token for GraphQL Projects v2 (needs read:project). */
export function devToken(): string {
  return (import.meta.env.DEV_TOKEN ?? process.env.DEV_TOKEN ?? "") as string;
}

/** Token for REST reads; any of these only raises rate limits. */
function restToken(): string {
  return devToken() || ((process.env.GITHUB_TOKEN ?? "") as string);
}

export interface GithubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics: string[];
  pushed_at: string | null;
  fork: boolean;
  archived?: boolean;
  stargazers_count?: number;
}

export interface GithubActivityItem {
  summary: string;
  url: string;
  date: string;
}

const cache = new Map<string, Promise<unknown>>();
const status = { live: false, attempted: false, failed: false };

async function gh<T>(path: string): Promise<T | null> {
  if (!cache.has(path)) {
    cache.set(
      path,
      (async () => {
        status.attempted = true;
        try {
          const request = (token: string) =>
            fetch(`${API}${path}`, {
              headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "rjmlaird-dev-build",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal: AbortSignal.timeout(10_000),
            });
          const token = restToken();
          let res = await request(token);
          // An expired or mis-scoped token must not block public data.
          if (res.status === 401 && token) res = await request("");
          if (!res.ok) {
            status.failed = true;
            console.warn(`[github] ${path} -> ${res.status}`);
            return null;
          }
          status.live = true;
          return (await res.json()) as T;
        } catch (err) {
          status.failed = true;
          console.warn(`[github] ${path} failed: ${(err as Error).message}`);
          return null;
        }
      })()
    );
  }
  return (await cache.get(path)) as T | null;
}

function snapshotRepos(): GithubRepo[] {
  return snapshot.repositories
    .filter((r) => !r.isFork)
    .map((r) => ({
      name: r.name,
      full_name: r.fullName,
      html_url: r.url,
      description: r.description ?? null,
      homepage: r.homepage || null,
      language: r.language ?? null,
      topics: r.topics ?? [],
      pushed_at: r.pushedAt ?? null,
      fork: false,
      stargazers_count: r.stars ?? 0,
    }));
}

/** True when any page had to fall back to the saved snapshot. */
export function usedSnapshot(): boolean {
  return status.failed || !status.live;
}

export const snapshotDate = snapshot.syncedAt;

export async function getGithubProfile() {
  const live = await gh<any>(`/users/${GITHUB_USERNAME}`);
  if (live) return live;
  return {
    login: GITHUB_USERNAME,
    name: SITE.author,
    bio: null,
    avatar_url: `https://github.com/${GITHUB_USERNAME}.png`,
    html_url: `https://github.com/${GITHUB_USERNAME}`,
    public_repos: snapshot.repositories.length,
  };
}

export async function getGithubRepos(): Promise<GithubRepo[]> {
  const live = await gh<GithubRepo[]>(
    `/users/${GITHUB_USERNAME}/repos?per_page=100&sort=pushed&type=owner`
  );
  const repos = live ?? snapshotRepos();
  return repos.filter((r) => !r.fork && !r.archived);
}

export async function getGithubOrgs() {
  const live = await gh<any[]>(`/users/${GITHUB_USERNAME}/orgs`);
  const logins = live ? live.map((o) => o.login as string) : SITE.orgs.map((o) => o.login);
  const orgs = await Promise.all(
    logins.map(async (login) => {
      const detail = await gh<any>(`/orgs/${login}`);
      return (
        detail ?? {
          login,
          html_url: `https://github.com/${login}`,
          avatar_url: `https://github.com/${login}.png`,
        }
      );
    })
  );
  return orgs;
}

export async function getGithubOrgRepos(): Promise<GithubRepo[]> {
  const lists = await Promise.all(
    SITE.orgs.map((o) => gh<GithubRepo[]>(`/orgs/${o.login}/repos?per_page=100&sort=pushed&type=public`))
  );
  return lists.flatMap((l) => l ?? []).filter((r) => !r.fork && !r.archived);
}

export async function getGithubActivity(limit = 10): Promise<GithubActivityItem[]> {
  const events = await gh<any[]>(`/users/${GITHUB_USERNAME}/events/public?per_page=50`);
  if (!events) return [];
  const out: GithubActivityItem[] = [];
  for (const e of events) {
    const repo: string = e.repo?.name ?? "";
    const base = `https://github.com/${repo}`;
    const p = e.payload ?? {};
    let summary = "";
    let url = base;
    switch (e.type) {
      case "PushEvent": {
        const n = p.size ?? p.commits?.length ?? 1;
        summary = `Pushed ${n} commit${n === 1 ? "" : "s"} to ${repo}`;
        break;
      }
      case "CreateEvent":
        summary = `Created ${p.ref_type}${p.ref ? ` ${p.ref}` : ""} in ${repo}`;
        break;
      case "PullRequestEvent":
        summary = `${p.action === "closed" && p.pull_request?.merged ? "Merged" : cap(p.action)} PR #${p.number} in ${repo}`;
        url = p.pull_request?.html_url ?? base;
        break;
      case "IssuesEvent":
        summary = `${cap(p.action)} issue #${p.issue?.number} in ${repo}`;
        url = p.issue?.html_url ?? base;
        break;
      case "IssueCommentEvent":
        summary = `Commented on #${p.issue?.number} in ${repo}`;
        url = p.comment?.html_url ?? base;
        break;
      case "ReleaseEvent":
        summary = `Released ${p.release?.tag_name ?? ""} of ${repo}`.replace("  ", " ");
        url = p.release?.html_url ?? base;
        break;
      case "ForkEvent":
        summary = `Forked ${repo}`;
        break;
      case "PublicEvent":
        summary = `Made ${repo} public`;
        break;
      default:
        continue;
    }
    out.push({ summary, url, date: e.created_at });
    if (out.length >= limit) break;
  }
  return out;
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "Updated");

export function aggregateLanguages(repos: GithubRepo[]) {
  const counts = new Map<string, number>();
  for (const r of repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178C6",
  JavaScript: "#F1E05A",
  Python: "#3572A5",
  HTML: "#E34C26",
  CSS: "#563D7C",
  Astro: "#FF5A03",
  Shell: "#89E051",
  "Jupyter Notebook": "#DA5B0B",
  MDX: "#FCB32C",
  Rust: "#DEA584",
  Go: "#00ADD8",
  SQL: "#E38C00",
};

export function getLanguageColor(name: string): string {
  return LANGUAGE_COLORS[name] ?? "#9AA4B8";
}
