import { describe, expect, it } from 'vitest';
import cliEdges from '../../../tests/fixtures/tatr-graph-edges.json' with { type: 'json' };
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { buildGraph } from './graph.ts';
import { readTask, type Task } from './task.ts';

/**
 * `tatr-graph-edges.json` holds the arrows the compiled `tatr graph` wrote into
 * its `graph.dot` for tsoding/tatr, sorted. Regenerating it needs the checkout
 * and a compiler: run `tatr graph` there and read the `.dot` it leaves behind —
 * the SVG step fails without Graphviz, which does not matter, the file is
 * written first.
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

	it('ignores a task citing itself', () => {
		const graph = buildGraph([make('20260101-000001', 'see 20260101-000001')]);
		expect(graph.clusters).toEqual([]);
		expect(graph.isolated).toHaveLength(1);
		expect(graph.linkCount).toBe(0);
	});

	it('ignores an id no task carries', () => {
		const graph = buildGraph([make('20260101-000001', 'see 20260101-999999')]);
		expect(graph.clusters).toEqual([]);
		expect(graph.linkCount).toBe(0);
	});

	it('puts the busiest task first in its cluster', () => {
		const hub = make('20260101-000001');
		const graph = buildGraph([
			hub,
			make('20260101-000002', 'see 20260101-000001'),
			make('20260101-000003', 'see 20260101-000001')
		]);
		expect(graph.clusters[0].nodes[0].task.id).toBe(hub.id);
		expect(graph.clusters[0].nodes[0].degree).toBe(2);
		expect(graph.clusters[0].nodes[0].in).toEqual(['20260101-000002', '20260101-000003']);
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
