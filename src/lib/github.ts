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
    `/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated&type=owner`,
    []
  );
  return repos.filter((r) => !r.private && !r.fork);
}

export async function getGithubOrgRepos(): Promise<any[]> {
  const perOrg = await Promise.all(
    GITHUB_ORGS.map((org) => githubFetch<any[]>(`/orgs/${org}/repos?per_page=100&sort=updated`, []))
  );
  return perOrg.flat().filter((r) => !r.private);
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
