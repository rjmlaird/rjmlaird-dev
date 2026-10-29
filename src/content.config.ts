// src/content.config.ts
import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

/**
 * BOARDS
 *
 * One entry per GitHub Project (v2), loaded from the committed snapshot in
 * src/data/github-projects.json (written by `pnpm sync:boards`). The build never
 * calls GitHub for boards. The shapes below mirror SnapshotBoard in
 * src/lib/github-projects-core.ts; derived views (groups, counts, timeline range)
 * are computed from these entries by buildBoard() in src/lib/github-projects.ts.
 *
 * Only public boards are loaded, whatever the snapshot contains, so a snapshot
 * synced with --include-private can never publish a private board by accident.
 */

const label = z.object({
  name: z.string(),
  color: z.string(),
});

const field = z.object({
  name: z.string(),
  /** GitHub ProjectV2 field type, e.g. SINGLE_SELECT, TEXT, NUMBER, DATE, ITERATION. */
  dataType: z.string(),
  options: z.array(z.string()).optional(),
});

const item = z.object({
  id: z.string(),
  kind: z.enum(["issue", "pull-request", "draft", "private"]),
  state: z.string().optional(),
  repo: z.string().optional(),
  number: z.number().optional(),
  title: z.string(),
  url: z.string().optional(),
  labels: z.array(label).default([]),
  assignees: z.array(z.string()).default([]),
  fields: z.record(z.string()).default({}),
  bodyHtml: z.string().optional(),
});

const boards = defineCollection({
  loader: file("src/data/github-projects.json", {
    parser: (text) => {
      const snapshot = JSON.parse(text) as { boards: Array<Record<string, unknown>> };
      return snapshot.boards
        .filter((board) => board.isPublic === true)
        .map((board) => ({ ...board, id: String(board.slug) }));
    },
  }),

  schema: z.object({
    number: z.number(),
    title: z.string(),
    slug: z.string(),
    description: z.string().default(""),
    url: z.string().url(),
    isPublic: z.boolean(),
    closed: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
    readmeHtml: z.string().optional(),
    fields: z.array(field).default([]),
    items: z.array(item).default([]),
  }),
});

export const collections = {
  boards,
};
