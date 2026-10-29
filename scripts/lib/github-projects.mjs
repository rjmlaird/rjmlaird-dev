// scripts/lib/github-projects.mjs
// Pure helpers that turn GitHub Projects (v2) GraphQL nodes into the snapshot
// format read by src/lib/github-projects-core.ts. No network access here.

/** Field types GitHub already exposes on every item (not custom project fields). */
const BUILT_IN_FIELD_TYPES = new Set([
  "TITLE",
  "ASSIGNEES",
  "LABELS",
  "LINKED_PULL_REQUESTS",
  "MILESTONE",
  "REPOSITORY",
  "REVIEWERS",
  "TRACKS",
  "TRACKED_BY",
  "PARENT_ISSUE",
  "SUB_ISSUES_PROGRESS",
]);

/** Skip rendered bodies larger than this; the page links to GitHub instead. */
export const MAX_BODY_HTML = 30000;

export function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug || "board";
}

/**
 * One unique, stable slug per board. Duplicate titles (and titles with no
 * usable characters) get the project number appended.
 * Returns a Map of project number -> slug.
 */
export function assignSlugs(boards) {
  const counts = new Map();
  for (const b of boards) {
    const slug = slugify(b.title);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const slugs = new Map();
  for (const b of boards) {
    const base = slugify(b.title);
    const unique = counts.get(base) === 1 && base !== "board";
    slugs.set(b.number, unique ? base : `${base}-${b.number}`);
  }
  return slugs;
}

/** GitHub renders relative links ("/owner/repo/issues/1"); point them at github.com. */
export function absolutiseHtml(html) {
  return String(html ?? "").replace(/\b(href|src)="\/(?!\/)/g, '$1="https://github.com/');
}

function safeColor(color) {
  return /^[0-9a-f]{6}$/i.test(color ?? "") ? color.toLowerCase() : "2b3549";
}

function renderedBody(html) {
  const out = absolutiseHtml(html).trim();
  return out && out.length <= MAX_BODY_HTML ? out : undefined;
}

/**
 * Normalise one GraphQL ProjectV2Item. Returns null for archived items.
 * Items whose content the token cannot read (private repositories) are kept
 * as a "private" placeholder so the board's counts stay honest.
 */
export function normaliseItem(node) {
  if (!node || node.isArchived) return null;

  const fields = {};
  for (const fv of node.fieldValues?.nodes ?? []) {
    const name = fv?.field?.name;
    if (!name) continue;

    const value =
      fv.name ??
      fv.text ??
      fv.date ??
      fv.title ??
      (typeof fv.number === "number" ? String(fv.number) : undefined);

    if (value != null && value !== "") fields[name] = String(value);
  }

  const content = node.content;
  const typename = content?.__typename;

  if (typename !== "Issue" && typename !== "PullRequest" && typename !== "DraftIssue") {
    return {
      id: node.id,
      kind: "private",
      title: "Private item",
      labels: [],
      assignees: [],
      fields,
    };
  }

  const isDraft = typename === "DraftIssue";

  return {
    id: node.id,
    kind: isDraft ? "draft" : typename === "PullRequest" ? "pull-request" : "issue",
    state: isDraft ? undefined : content.state,
    repo: content.repository?.nameWithOwner,
    number: isDraft ? undefined : content.number,
    title: content.title,
    url: isDraft ? undefined : content.url,
    labels: (content.labels?.nodes ?? []).map((l) => ({ name: l.name, color: safeColor(l.color) })),
    assignees: (content.assignees?.nodes ?? []).map((a) => a.login),
    fields,
    bodyHtml: renderedBody(content.bodyHTML),
  };
}

/** Normalise one GraphQL ProjectV2 (items attached as node.items.nodes). */
export function normaliseBoard(node, { readmeHtml } = {}) {
  const fields = (node.fields?.nodes ?? [])
    .filter((f) => f?.name && f.dataType && !BUILT_IN_FIELD_TYPES.has(f.dataType))
    .map((f) => ({
      name: f.name,
      dataType: f.dataType,
      ...(Array.isArray(f.options) ? { options: f.options.map((o) => o.name) } : {}),
    }));

  return {
    number: node.number,
    title: node.title,
    description: node.shortDescription ?? "",
    url: node.url,
    isPublic: Boolean(node.public),
    closed: Boolean(node.closed),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    ...(readmeHtml ? { readmeHtml: absolutiseHtml(readmeHtml).trim() } : {}),
    fields,
    items: (node.items?.nodes ?? []).map(normaliseItem).filter(Boolean),
  };
}

/** True when two snapshots are identical apart from the syncedAt stamp. */
export function sameSnapshot(a, b) {
  const strip = (s) => JSON.stringify({ ...s, syncedAt: null });
  return strip(a) === strip(b);
}
