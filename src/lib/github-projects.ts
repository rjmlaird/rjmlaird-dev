// src/lib/github-projects.ts
//
// Build-time access to GitHub Projects (v2) boards. Entries come from the `boards`
// content collection (src/content.config.ts), which loads the committed snapshot
// src/data/github-projects.json. The Astro build never calls GitHub for boards.
import { getCollection } from "astro:content";
import snapshotJson from "../data/github-projects.json";
import { buildBoards, type Board, type SnapshotBoard } from "./github-projects-core";

export {
  formatDate,
  monthTicks,
  percentAlong,
  type Board,
  type BoardItem,
} from "./github-projects-core";

/** Snapshot-level metadata (the collection only holds the boards themselves). */
export const boardsSnapshot = {
  owner: snapshotJson.owner,
  syncedAt: snapshotJson.syncedAt as string | null,
};

/** Every public board in the collection, most recently updated first. */
export async function getBoards(): Promise<Board[]> {
  const entries = await getCollection("boards");
  return buildBoards({
    schemaVersion: snapshotJson.schemaVersion,
    owner: boardsSnapshot.owner,
    syncedAt: boardsSnapshot.syncedAt,
    boards: entries.map((entry) => entry.data as SnapshotBoard),
  });
}
