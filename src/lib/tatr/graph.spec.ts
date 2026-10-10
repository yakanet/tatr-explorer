import { describe, expect, it } from 'vitest';
import cliEdges from '../../../tests/fixtures/tatr-graph-edges.json' with { type: 'json' };
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { buildGraph, starCards } from './graph.ts';
import { readTask, type Task } from './task.ts';

/**
 * `tatr-graph-edges.json` holds the arrows the compiled `tatr graph` wrote into
 * its `graph.dot` for tsoding/tatr, sorted. To regenerate: `pnpm run fixtures`,
 * with the checkout at `../tatr` built.
 */
const sources = rawTasks as Record<string, string>;
const all = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
const expected = (cliEdges as [string, string][]).map(([from, to]) => `${from} -> ${to}`);

const make = (id: string, body = ''): Task => readTask(id, `# t\n\n- STATUS: OPEN\n\n${body}\n`)!;

/** Every arrow the graph implies, in the shape the `.dot` file uses. */
const arrows = (tasks: Task[]) =>
	buildGraph(tasks)
		.clusters.flatMap((cluster) => cluster.nodes)
		.flatMap((node) => node.out.map((to) => `${node.task.id} -> ${to}`))
		.sort();

describe('conformance with `tatr graph`', () => {
	it('draws the same arrows as the reference implementation', () => {
		expect(arrows(all)).toEqual(expected);
	});

	it('counts the links the way the .dot file does', () => {
		expect(buildGraph(all).linkCount).toBe(expected.length);
		expect(buildGraph(all).linkCount).toBe(36);
	});

	it('ignores ids naming no task, journal timestamps included', () => {
		// `20260828-211721` carries six `NOTE(...)` entries whose ids exist only
		// as timestamps, and cites one real task.
		const notes = all.find((task) => task.id === '20260828-211721')!;
		expect(notes.references.length).toBeGreaterThan(5);
		expect(arrows(all).filter((arrow) => arrow.startsWith(notes.id))).toEqual([
			'20260828-211721 -> 20260828-211350'
		]);
	});
});

describe('buildGraph', () => {
	const graph = buildGraph(all);

	it('finds the connected components of the real repository', () => {
		expect(graph.clusters.map((cluster) => cluster.nodes.length)).toEqual([
			10, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2
		]);
	});

	it('leaves out the tasks nothing connects', () => {
		expect(graph.isolated).toHaveLength(43);
		expect(graph.isolated.map((task) => task.id)).toEqual(
			[...graph.isolated].map((task) => task.id).sort()
		);
	});

	it('accounts for every task exactly once', () => {
		const inClusters = graph.clusters.flatMap((cluster) => cluster.nodes.length);
		expect(inClusters.reduce((n, size) => n + size, 0) + graph.isolated.length).toBe(79);
	});

	it('draws a mutual citation once', () => {
		const a = make('20260101-000001', 'see 20260101-000002');
		const b = make('20260101-000002', 'see 20260101-000001');
		const { clusters, linkCount } = buildGraph([a, b]);

		expect(linkCount).toBe(2);
		expect(clusters[0].edges).toEqual([
			{ from: '20260101-000001', to: '20260101-000002', mutual: true }
		]);
	});

	it('keeps the direction of a one-way citation', () => {
		const { clusters } = buildGraph([
			make('20260101-000001', 'see 20260101-000002'),
			make('20260101-000002')
		]);
		expect(clusters[0].edges).toEqual([
			{ from: '20260101-000001', to: '20260101-000002', mutual: false }
		]);
	});

	it('keeps a task citing itself, as one arrow that is not mutual', () => {
		// `tatr graph` draws it; the corpus spec compares against its `.dot`.
		const graph = buildGraph([make('20260101-000001', 'see 20260101-000001')]);
		expect(graph.clusters[0].edges).toEqual([
			{ from: '20260101-000001', to: '20260101-000001', mutual: false }
		]);
		expect(graph.isolated).toEqual([]);
		expect(graph.linkCount).toBe(1);
	});

	it('ignores an id no task carries', () => {
		const graph = buildGraph([make('20260101-000001', 'see 20260101-999999')]);
		expect(graph.clusters).toEqual([]);
		expect(graph.linkCount).toBe(0);
	});

	it("lists a cluster's tasks oldest first", () => {
		const graph = buildGraph([
			make('20260101-000003', 'see 20260101-000001'),
			make('20260101-000001'),
			make('20260101-000002', 'see 20260101-000001')
		]);
		expect(graph.clusters[0].nodes.map((node) => node.task.id)).toEqual([
			'20260101-000001',
			'20260101-000002',
			'20260101-000003'
		]);
	});

	it('orders clusters largest first', () => {
		const graph = buildGraph([
			make('20260101-000001', 'see 20260101-000002'),
			make('20260101-000002'),
			make('20260202-000001', 'see 20260202-000002 and 20260202-000003'),
			make('20260202-000002'),
			make('20260202-000003')
		]);
		expect(graph.clusters.map((cluster) => cluster.nodes.length)).toEqual([3, 2]);
	});

	it('has nothing to draw for an empty repository', () => {
		expect(buildGraph([])).toEqual({ clusters: [], isolated: [], linkCount: 0 });
	});
});

describe('star cards', () => {
	const graph = buildGraph(all);
	const cards = starCards(graph);
	const around = (card: (typeof cards)[number]) => card.links.map((link) => link.task);

	it('draws every link exactly once', () => {
		const drawn = cards.flatMap((card) => [
			...around(card).map((other) => [card.pivot.id, other.id].sort().join(' ')),
			...(card.self ? [`${card.pivot.id} ${card.pivot.id}`] : [])
		]);
		expect(new Set(drawn).size).toBe(drawn.length);
		expect(drawn).toHaveLength(graph.clusters.reduce((n, cluster) => n + cluster.edges.length, 0));
	});

	it('starts from the task with the most links, on the real repository', () => {
		expect(cards).toHaveLength(15);
		expect(cards[0].pivot.id).toBe('20260828-211200');
		expect(around(cards[0])).toHaveLength(8);
	});

	it('keeps the direction of each link', () => {
		for (const { pivot, links } of cards) {
			for (const { task, kind } of links) {
				expect(task.references.includes(pivot.id)).toBe(kind !== 'out');
				expect(pivot.references.includes(task.id)).toBe(kind !== 'in');
			}
		}
	});

	it('lists what cites the pivot, then both ways, then what it cites', () => {
		const order = { in: 0, both: 1, out: 2 };
		for (const { links } of cards) {
			const ranks = links.map((link) => order[link.kind]);
			expect(ranks).toEqual([...ranks].sort());
		}
	});

	it('makes one card of a pair, around the older task', () => {
		const pair = starCards(
			buildGraph([make('20260101-000002', 'see 20260101-000001'), make('20260101-000001')])
		);
		expect(pair).toHaveLength(1);
		expect(pair[0].pivot.id).toBe('20260101-000001');
		expect(pair[0].links.map(({ task, kind }) => [task.id, kind])).toEqual([
			['20260101-000002', 'in']
		]);
	});

	it('gives a task citing itself a line of its own, not itself as a neighbour', () => {
		const [card] = starCards(
			buildGraph([
				make('20260101-000001', '20260101-000001 and 20260101-000002'),
				make('20260101-000002')
			])
		);
		expect(card.pivot.id).toBe('20260101-000001');
		expect(card.self).toBe(true);
		expect(card.links.map(({ task, kind }) => [task.id, kind])).toEqual([
			['20260101-000002', 'out']
		]);
	});

	it('makes a card of a task that cites only itself', () => {
		const cards = starCards(buildGraph([make('20260101-000001', 'see 20260101-000001')]));
		expect(cards).toEqual([expect.objectContaining({ links: [], self: true })]);
	});

	it('lets a task appear in more than one card', () => {
		// a cites b and c; d cites b and c too. Two pivots, a and d, each with b
		// and c beside it, or b and c as pivots. Either way some task is shown
		// twice, which is the point: a card holds a pivot's own links only.
		const tasks = [
			make('20260101-000001', '20260101-000002 20260101-000003'),
			make('20260101-000002'),
			make('20260101-000003'),
			make('20260101-000004', '20260101-000002 20260101-000003')
		];
		const shown = starCards(buildGraph(tasks)).flatMap((card) => around(card).map((t) => t.id));
		expect(new Set(shown).size).toBeLessThan(shown.length);
	});
});
