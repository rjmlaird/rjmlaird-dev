#!/usr/bin/env node
// scripts/sync-github-projects.mjs
//
// Sync a GitHub user's Projects (v2) — details, README, fields, issues,
// pull requests and draft items — into src/data/github-projects.json.
//
// The Astro build never calls GitHub: it reads the committed snapshot.
//
// Usage:
//   export GITHUB_TOKEN=ghp_...   # classic PAT: read:project (+ repo to read private repositories' issues)
//   pnpm sync:boards
//   node scripts/sync-github-projects.mjs --user rjmlaird --dry-run
//   node scripts/sync-github-projects.mjs --fixture tests/fixtures/github-projects.sample.json --out /tmp/boards.json
//
// Options:
//   --user <login>     GitHub user (default: rjmlaird)
//   --out <file>       Output file (default: src/data/github-projects.json)
//   --include-private  Also include private projects (default: public only)
//   --dry-run          Report what would change without writing
//   --fixture <file>   Read GraphQL-shaped JSON ({ "projects": [...] }) instead of calling GitHub

import fs from "node:fs";
import path from "node:path";

// Load .env if present
try {
  const dotenv = await import("dotenv");
  dotenv.config();
} catch {
  // dotenv not installed or optional; relies on process.env
}

import {
  assignSlugs,
  normaliseBoard,
  sameSnapshot,
} from "./lib/github-projects.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const login = option("user", "rjmlaird");
const outFile = option("out", "src/data/github-projects.json");
const fixture = option("fixture");
const includePrivate = flag("include-private");
const dryRun = flag("dry-run");

const FIELD_REF = "field { ... on ProjectV2FieldCommon { name } }";

const PROJECTS_QUERY = `
query ($login: String!, $cursor: String) {
  user(login: $login) {
    projectsV2(first: 50, after: $cursor, orderBy: { field: NUMBER, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title shortDescription readme url public closed createdAt updatedAt
        fields(first: 50) {
          nodes {
            ... on ProjectV2FieldCommon { name dataType }
            ... on ProjectV2SingleSelectField { options { name } }
          }
        }
      }
    }
  }
}`;

const CONTENT_FIELDS = `
  number title url state bodyHTML
  repository { nameWithOwner }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
`;

const ITEMS_QUERY = `
query ($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isArchived
          content {
            __typename
            ... on Issue { ${CONTENT_FIELDS} }
            ... on PullRequest { ${CONTENT_FIELDS} }
            ... on DraftIssue { title bodyHTML }
          }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name ${FIELD_REF} }
              ... on ProjectV2ItemFieldTextValue { text ${FIELD_REF} }
              ... on ProjectV2ItemFieldNumberValue { number ${FIELD_REF} }
              ... on ProjectV2ItemFieldDateValue { date ${FIELD_REF} }
              ... on ProjectV2ItemFieldIterationValue { title ${FIELD_REF} }
            }
          }
        }
      }
    }
  }
}`;

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  "User-Agent": "rjmlaird-dev-sync",
});

async function graphql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

/** Render a README with GitHub's own markdown renderer so output matches github.com. */
async function renderMarkdown(token, text) {
  if (!text?.trim()) return undefined;

  const res = await fetch("https://api.github.com/markdown", {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json", Accept: "text/html" },
    body: JSON.stringify({ text, mode: "gfm" }),
  });

  if (!res.ok) {
    console.warn(`  ! could not render a README (${res.status}); skipping it`);
    return undefined;
  }
  return res.text();
}

async function fetchAll(token) {
  const nodes = [];
  let cursor = null;

  do {
    const data = await graphql(token, PROJECTS_QUERY, { login, cursor });
    if (!data.user) throw new Error(`GitHub user "${login}" not found.`);

    const page = data.user.projectsV2;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  const wanted = includePrivate ? nodes : nodes.filter((n) => n.public);

  for (const node of wanted) {
    const items = [];
    let itemCursor = null;

    do {
      const data = await graphql(token, ITEMS_QUERY, { id: node.id, cursor: itemCursor });
      const page = data.node.items;
      items.push(...page.nodes);
      itemCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (itemCursor);

    node.items = { nodes: items };
    node.readmeHtml = await renderMarkdown(token, node.readme);
    console.log(`  #${node.number} ${node.title}: ${items.length} items`);
  }

  return { all: nodes, wanted };
}

async function main() {
  let all;
  let wanted;

  if (fixture) {
    all = JSON.parse(fs.readFileSync(fixture, "utf8")).projects;
    wanted = includePrivate ? all : all.filter((n) => n.public);
  } else {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

    if (!token) {
      console.error(
        "Set GITHUB_TOKEN (classic PAT with read:project, plus repo to read private repositories' issues).",
      );
      process.exit(1);
    }

    console.log(`Fetching GitHub Projects for ${login}…`);
    ({ all, wanted } = await fetchAll(token));
  }

  const boards = wanted.map((node) => normaliseBoard(node, { readmeHtml: node.readmeHtml }));
  const slugs = assignSlugs(boards);
  for (const board of boards) board.slug = slugs.get(board.number);

  const redacted = boards.reduce((n, b) => n + b.items.filter((i) => i.kind === "private").length, 0);

  const next = {
    schemaVersion: 1,
    owner: login,
    syncedAt: new Date().toISOString(),
    boards,
  };

  const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;
  const unchanged = existing && sameSnapshot(existing, next);

  if (!dryRun && !unchanged) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(next, null, 2)}\n`);
  }

  const itemCount = boards.reduce((n, b) => n + b.items.length, 0);
  console.log(
    `\n${dryRun ? "[dry run] " : ""}${boards.length} board(s), ${itemCount} item(s): ` +
      `${unchanged ? "no changes" : dryRun ? "would write" : "wrote"} ${outFile}`,
  );

  const skipped = all.length - wanted.length;
  if (skipped > 0) console.log(`${skipped} private project(s) skipped (use --include-private).`);
  if (redacted > 0) {
    console.warn(
      `${redacted} item(s) are in private repositories this token cannot read; they appear as "Private item".`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});