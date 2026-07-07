/**
 * Pulls live from the public GitHub REST API at build time.
 *
 * Unauthenticated requests are capped at 60/hour per IP — set a GITHUB_TOKEN
 * env var (a classic PAT with no scopes, or fine-grained "public repos: read"
 * is plenty) to raise that to 5,000/hour for CI builds:
 *
 *   GITHUB_TOKEN=ghp_xxx npm run build
 *
 * Everything here degrades gracefully to an empty result if GitHub is
 * unreachable or rate-limited, so a GitHub hiccup can never break the build.
 */

import languageColors from "../data/language-colors.json";

export function getLanguageColor(name: string | null | undefined): string {
  if (!name) return languageColors.Default;
  return (languageColors as Record<string, string>)[name] ?? languageColors.Default;
}

const GITHUB_API = "https://api.github.com";
export const GITHUB_USERNAME = "rjmlaird";
export const GITHUB_ORGS = ["greenorbitdigital", "greenorbitspace", "spaceforneuro"];

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "rjmlaird-dev-site",
  };
  const token = import.meta.env.GITHUB_TOKEN as string | undefined;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function githubFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() });
    if (!res.ok) {
      throw new Error(`${path} -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[github] Falling back for "${path}":`, (err as Error).message);
    return fallback;
  }
}

export async function getGithubProfile(): Promise<any | null> {
  return githubFetch(`/users/${GITHUB_USERNAME}`, null);
}

export async function getGithubRepos(): Promise<any[]> {
  const repos = await githubFetch<any[]>(
    `/users/${GITHUB_USERNAME}/repos?per_page=100&sort=pushed&type=owner`,
    []
  );
  return repos.filter((r) => !r.private && !r.fork);
}

export async function getGithubOrgRepos(): Promise<any[]> {
  const perOrg = await Promise.all(
    GITHUB_ORGS.map((org) => githubFetch<any[]>(`/orgs/${org}/repos?per_page=100&sort=pushed`, []))
  );
  return perOrg.flat().filter((r) => !r.private);
}

/**
 * Full org profiles (avatar, description, repo count) for the org badges/
 * cards section — separate from getGithubOrgRepos, which just pulls repos.
 */
export async function getGithubOrgs(): Promise<any[]> {
  const orgs = await Promise.all(
    GITHUB_ORGS.map((org) => githubFetch<any | null>(`/orgs/${org}`, null))
  );
  return orgs.filter(Boolean);
}

/**
 * Recent public activity (pushes, PRs, issues, releases, new repos) —
 * GitHub's contributions calendar isn't available over the plain REST API
 * (it needs GraphQL + auth), so this is the closest equivalent: the public
 * events feed, summarised into readable lines.
 */
export async function getGithubActivity(): Promise<
  { type: string; repo: string; summary: string; date: string; url: string }[]
> {
  const events = await githubFetch<any[]>(`/users/${GITHUB_USERNAME}/events/public?per_page=30`, []);

  const describe = (e: any): string | null => {
    const repo = e.repo?.name ?? "";
    switch (e.type) {
      case "PushEvent": {
        const n = e.payload?.commits?.length ?? 0;
        return n ? `Pushed ${n} commit${n === 1 ? "" : "s"} to ${repo}` : null;
      }
      case "CreateEvent":
        return e.payload?.ref_type === "repository" ? `Created repository ${repo}` : null;
      case "PullRequestEvent":
        return `${e.payload?.action === "opened" ? "Opened" : e.payload?.action ?? "Updated"} a pull request on ${repo}`;
      case "IssuesEvent":
        return `${e.payload?.action === "opened" ? "Opened" : e.payload?.action ?? "Updated"} an issue on ${repo}`;
      case "ReleaseEvent":
        return `Published a release on ${repo}`;
      case "PublicEvent":
        return `Made ${repo} public`;
      case "ForkEvent":
        return `Forked ${repo}`;
      case "WatchEvent":
        return `Starred ${repo}`;
      default:
        return null;
    }
  };

  return events
    .map((e) => {
      const summary = describe(e);
      if (!summary) return null;
      return {
        type: e.type,
        repo: e.repo?.name ?? "",
        summary,
        date: e.created_at,
        url: `https://github.com/${e.repo?.name ?? ""}`,
      };
    })
    .filter(Boolean)
    .slice(0, 10) as { type: string; repo: string; summary: string; date: string; url: string }[];
}

/**
 * Counts each repo's primary language (fast — already returned on the repos
 * call, vs. a per-repo /languages call for byte-accurate breakdowns) and
 * returns a simple share-of-repos breakdown, most-used first.
 */
export function aggregateLanguages(repos: any[]): { name: string; count: number; pct: number }[] {
  const counts: Record<string, number> = {};

  repos.forEach((r) => {
    if (r.language) counts[r.language] = (counts[r.language] ?? 0) + 1;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}
