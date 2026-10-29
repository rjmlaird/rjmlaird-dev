// src/lib/github-projects-core.ts
//
// Pure helpers that turn a GitHub Projects (v2) snapshot into the "board"
// view model used by src/pages/boards/. Keep this file free of runtime
// imports so it can be unit-tested directly.

export type ItemKind = "issue" | "pull-request" | "draft" | "private";

export interface SnapshotField {
  name: string;
  /** GitHub ProjectV2 field type, e.g. SINGLE_SELECT, TEXT, NUMBER, DATE, ITERATION. */
  dataType: string;
  options?: string[];
}

export interface SnapshotLabel {
  name: string;
  color: string;
}

export interface SnapshotItem {
  id: string;
  kind: ItemKind;
  /** GitHub state in upper case (OPEN, CLOSED, MERGED); absent for drafts and private items. */
  state?: string;
  repo?: string;
  number?: number;
  title: string;
  url?: string;
  labels: SnapshotLabel[];
  assignees: string[];
  /** Project field values as display strings, keyed by field name. */
  fields: Record<string, string>;
  /** HTML rendered by GitHub. */
  bodyHtml?: string;
}

export interface SnapshotBoard {
  number: number;
  title: string;
  slug: string;
  description: string;
  url: string;
  isPublic: boolean;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  /** HTML rendered by GitHub's markdown API. */
  readmeHtml?: string;
  fields: SnapshotField[];
  items: SnapshotItem[];
}

export interface GithubProjectsSnapshot {
  schemaVersion: number;
  owner: string;
  syncedAt: string | null;
  boards: SnapshotBoard[];
}

export interface BoardItem extends SnapshotItem {
  /** ISO date (YYYY-MM-DD) from the board's start-date field, if any. */
  start?: string;
  /** ISO date (YYYY-MM-DD) from the board's target/end/due date field, if any. */
  end?: string;
}

export interface BoardGroup {
  name: string;
  items: BoardItem[];
}

export interface BoardRange {
  start: string;
  end: string;
}

export interface BoardCounts {
  total: number;
  open: number;
  closed: number;
  /** Single-select field name -> option -> number of items. */
  byField: Record<string, Record<string, number>>;
}

export interface Board {
  slug: string;
  number: number;
  title: string;
  description: string;
  url: string;
  isPublic: boolean;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  readmeHtml?: string;
  /** Name of the single-select field used to group items ("" when there is none). */
  statusField: string;
  /** Names of every custom field on the board, including the status field. */
  fieldNames: string[];
  groups: BoardGroup[];
  items: BoardItem[];
  range: BoardRange | null;
  counts: BoardCounts;
}

export const NO_STATUS = "No status";
export const ALL_ITEMS = "All items";

const START_FIELD = /start/i;
const END_FIELD = /(target|end|due|finish)/i;

function isoDay(value: string | undefined): string | undefined {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

function dayMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function slugifyGroup(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Pick the single-select field used to group items: "Status", else the first one. */
export function pickStatusField(fields: SnapshotField[]): SnapshotField | undefined {
  const selects = fields.filter((f) => f.dataType === "SINGLE_SELECT");
  return selects.find((f) => f.name === "Status") ?? selects[0];
}

function pickDateField(fields: SnapshotField[], pattern: RegExp): string | undefined {
  return fields.find((f) => f.dataType === "DATE" && pattern.test(f.name))?.name;
}

export function buildBoard(raw: SnapshotBoard): Board {
  const fields = raw.fields ?? [];
  const statusDef = pickStatusField(fields);
  const startName = pickDateField(fields, START_FIELD);
  const endName = pickDateField(fields, END_FIELD);

  const items: BoardItem[] = raw.items.map((item) => ({
    ...item,
    start: startName ? isoDay(item.fields[startName]) : undefined,
    end: endName ? isoDay(item.fields[endName]) : undefined,
  }));

  // Groups follow the status field's option order, then any stray values, then "No status".
  let groups: BoardGroup[];

  if (statusDef) {
    const byName = new Map<string, BoardItem[]>();
    for (const option of statusDef.options ?? []) byName.set(option, []);

    for (const item of items) {
      const value = item.fields[statusDef.name] || NO_STATUS;
      if (!byName.has(value)) byName.set(value, []);
      byName.get(value)!.push(item);
    }

    const names = [...byName.keys()].filter((n) => n !== NO_STATUS);
    if (byName.has(NO_STATUS)) names.push(NO_STATUS);

    groups = names
      .map((name) => ({ name, items: byName.get(name)! }))
      .filter((g) => g.items.length > 0 || g.name !== NO_STATUS);
  } else {
    groups = items.length > 0 ? [{ name: ALL_ITEMS, items }] : [];
  }

  const byField: Record<string, Record<string, number>> = {};
  for (const field of fields.filter((f) => f.dataType === "SINGLE_SELECT")) {
    const values: Record<string, number> = {};
    for (const item of items) {
      const value = item.fields[field.name];
      if (value) values[value] = (values[value] ?? 0) + 1;
    }
    byField[field.name] = values;
  }

  const dated = items.filter((i): i is BoardItem & { start: string; end: string } => !!i.start && !!i.end);
  const range: BoardRange | null =
    dated.length > 0
      ? {
          start: dated.map((i) => i.start).sort()[0],
          end: dated.map((i) => i.end).sort().slice(-1)[0],
        }
      : null;

  return {
    slug: raw.slug,
    number: raw.number,
    title: raw.title,
    description: raw.description,
    url: raw.url,
    isPublic: raw.isPublic,
    closed: raw.closed,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    readmeHtml: raw.readmeHtml,
    statusField: statusDef?.name ?? "",
    fieldNames: fields.map((f) => f.name),
    groups,
    items,
    range,
    counts: {
      total: items.length,
      open: items.filter((i) => i.state === "OPEN").length,
      closed: items.filter((i) => i.state === "CLOSED" || i.state === "MERGED").length,
      byField,
    },
  };
}

export function buildBoards(snapshot: GithubProjectsSnapshot): Board[] {
  return snapshot.boards
    .map(buildBoard)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number - b.number);
}

/** Position of an ISO date along a range, as a 0 to 100 percentage. */
export function percentAlong(range: BoardRange, iso: string): number {
  const start = dayMs(range.start);
  const span = dayMs(range.end) - start;
  if (!(span > 0)) return 0;
  const pct = ((dayMs(iso) - start) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

export interface MonthTick {
  left: number;
  label: string;
}

/** Month-start tick marks across a range, thinned so there are never more than 12. */
export function monthTicks(range: BoardRange): MonthTick[] {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = dayMs(range.end);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (cursor.getTime() < start.getTime()) cursor.setUTCMonth(cursor.getUTCMonth() + 1);

  const all: MonthTick[] = [];
  while (cursor.getTime() <= end) {
    all.push({
      left: percentAlong(range, cursor.toISOString().slice(0, 10)),
      label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const step = Math.max(1, Math.ceil(all.length / 12));
  return all.filter((_, index) => index % step === 0);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
