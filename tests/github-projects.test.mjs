import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  absolutiseHtml,
  assignSlugs,
  normaliseBoard,
  normaliseItem,
  sameSnapshot,
  slugify,
} from '../scripts/lib/github-projects.mjs';

const hasTypeStripping = Boolean(process.features.typescript);
const skip = hasTypeStripping ? false : 'needs Node 22.18+ (TypeScript type stripping)';

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/github-projects.sample.json', 'utf8'));

function sampleBoards() {
  const boards = fixture.projects
    .filter((p) => p.public)
    .map((p) => normaliseBoard(p, { readmeHtml: p.readmeHtml }));
  const slugs = assignSlugs(boards);
  for (const b of boards) b.slug = slugs.get(b.number);
  return boards;
}

test('slugify produces stable kebab-case slugs', () => {
  assert.equal(slugify('Roadmap & Ideas 2026'), 'roadmap-and-ideas-2026');
  assert.equal(slugify('  Café  '), 'cafe');
  assert.equal(slugify('🚀🚀'), 'board');
});

test('duplicate or unusable titles get the project number', () => {
  const slugs = assignSlugs([
    { number: 1, title: 'Roadmap' },
    { number: 2, title: 'Roadmap' },
    { number: 3, title: 'Unique' },
    { number: 4, title: '🚀' },
  ]);
  assert.equal(slugs.get(1), 'roadmap-1');
  assert.equal(slugs.get(2), 'roadmap-2');
  assert.equal(slugs.get(3), 'unique');
  assert.equal(slugs.get(4), 'board-4');
});

test('GitHub-relative links are pointed at github.com', () => {
  assert.equal(
    absolutiseHtml('<a href="/a/b">x</a><img src="//cdn/x.png"><a href="https://e.com">y</a>'),
    '<a href="https://github.com/a/b">x</a><img src="//cdn/x.png"><a href="https://e.com">y</a>',
  );
});

test('items normalise to issue, pull request, draft and private kinds', () => {
  const board = sampleBoards()[0];
  assert.deepEqual(board.items.map((i) => i.kind), ['issue', 'pull-request', 'draft', 'private']);

  const [issue, pr, draft, hidden] = board.items;
  assert.equal(issue.state, 'OPEN');
  assert.equal(issue.repo, 'rjmlaird/rjmlaird-tools');
  assert.deepEqual(issue.labels, [
    { name: 'testing', color: '0e8a16' },
    { name: 'odd', color: '2b3549' },
  ]);
  assert.equal(issue.fields.Status, 'In progress');
  assert.equal(issue.fields.Estimate, '3');
  assert.equal(pr.state, 'MERGED');
  assert.equal(pr.bodyHtml, undefined);
  assert.equal(draft.url, undefined);
  assert.equal(draft.state, undefined);
  assert.equal(hidden.title, 'Private item');
});

test('archived items are dropped and huge bodies are not stored', () => {
  assert.equal(normaliseItem({ id: 'x', isArchived: true, content: null }), null);

  const item = normaliseItem({
    id: 'y',
    content: {
      __typename: 'Issue',
      number: 1,
      title: 'Big',
      url: 'https://github.com/a/b/issues/1',
      state: 'OPEN',
      bodyHTML: `<p>${'x'.repeat(40000)}</p>`,
      labels: { nodes: [] },
      assignees: { nodes: [] },
    },
    fieldValues: { nodes: [] },
  });
  assert.equal(item.bodyHtml, undefined);
});

test('built-in GitHub fields are not treated as custom fields', () => {
  const board = sampleBoards()[0];
  assert.deepEqual(board.fields.map((f) => f.name), ['Status', 'Priority', 'Start date', 'Target date', 'Estimate']);
  assert.deepEqual(board.fields[0].options, ['Todo', 'In progress', 'Done']);
});

test('sameSnapshot ignores only the sync stamp', () => {
  const a = { schemaVersion: 1, owner: 'x', syncedAt: 'a', boards: [] };
  assert.ok(sameSnapshot(a, { ...a, syncedAt: 'b' }));
  assert.ok(!sameSnapshot(a, { ...a, owner: 'y' }));
});

test('committed boards snapshot is well formed', () => {
  const snapshot = JSON.parse(fs.readFileSync('src/data/github-projects.json', 'utf8'));
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(Array.isArray(snapshot.boards));

  const slugs = snapshot.boards.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const b of snapshot.boards) assert.match(b.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('boards group by status option order and count items', { skip }, async () => {
  const { buildBoard } = await import('../src/lib/github-projects-core.ts');
  const board = buildBoard(sampleBoards()[0]);

  assert.equal(board.statusField, 'Status');
  assert.deepEqual(board.groups.map((g) => g.name), ['Todo', 'In progress', 'Done', 'No status']);
  assert.equal(board.counts.total, 4);
  assert.equal(board.counts.open, 1);
  assert.equal(board.counts.closed, 1);
  assert.deepEqual(board.counts.byField.Priority, { High: 1, Low: 1 });
});

test('boards derive a timeline range from start and target dates', { skip }, async () => {
  const core = await import('../src/lib/github-projects-core.ts');
  const board = core.buildBoard(sampleBoards()[0]);

  assert.deepEqual(board.range, { start: '2026-10-01', end: '2027-02-01' });
  assert.equal(core.percentAlong(board.range, '2026-10-01'), 0);
  assert.equal(core.percentAlong(board.range, '2027-02-01'), 100);
  assert.equal(core.percentAlong(board.range, '2030-01-01'), 100);

  const ticks = core.monthTicks(board.range);
  assert.ok(ticks.length > 0 && ticks.length <= 12);
  assert.ok(ticks.every((t) => t.left >= 0 && t.left <= 100));
  assert.equal(core.formatDate('2026-10-01'), '1 Oct 2026');
});

test('a board without a status field gets one catch-all group', { skip }, async () => {
  const { buildBoard } = await import('../src/lib/github-projects-core.ts');
  const empty = buildBoard({ ...sampleBoards()[1], fields: [], items: [] });
  assert.deepEqual(empty.groups, []);
  assert.equal(empty.statusField, '');
  assert.equal(empty.range, null);

  const plain = buildBoard({
    ...sampleBoards()[1],
    fields: [],
    items: [{ id: 'a', kind: 'draft', title: 'A', labels: [], assignees: [], fields: {} }],
  });
  assert.deepEqual(plain.groups.map((g) => g.name), ['All items']);
});
