import { describe, expect, it } from 'vitest';
import corpus from '../../../tests/fixtures/corpus-raw.json' with { type: 'json' };
import cliRows from '../../../tests/fixtures/corpus-ls-output.json' with { type: 'json' };
import cliCases from '../../../tests/fixtures/corpus-cli-cases.json' with { type: 'json' };
import cliEdges from '../../../tests/fixtures/corpus-graph-edges.json' with { type: 'json' };
import { compile } from '../tql/query.ts';
import { buildGraph } from './graph.ts';
import { isValidHuid } from './huid.ts';
import { compareByPriority, readTask } from './task.ts';

/**
 * The second differential corpus, beside tsoding/tatr: a few tasks of ours, each
 * holding an edge case that repository lacks: impossible dates, suffixes, a
 * status that is neither, a title without its `#`, a priority given twice,
 * trailing spaces, text outside ASCII, a self-citation, a folder that is not an
 * id. `scripts/fixtures.mjs` runs the real binary over them like over the first,
 * so each case is what the CLI does, not what we assumed it does.
 */
interface CliRow {
	id: string;
	status: string;
	priority: number;
	tags: string[];
	title: string;
}

interface CliCase {
	query: string;
	closed: boolean;
	ids: string;
}

const sources = corpus as Record<string, string>;
const rows = cliRows as CliRow[];
const tasks = Object.entries(sources)
	.filter(([id]) => isValidHuid(id))
	.map(([id, source]) => readTask(id, source)!);

describe('conformance on our corpus of edge cases', () => {
	it('loads the folders the CLI loads, and skips the one that is not an id', () => {
		expect(tasks.map((task) => task.id).sort()).toEqual(rows.map((row) => row.id).sort());
		expect(Object.keys(sources).filter((id) => !isValidHuid(id))).toEqual(['notes']);
	});

	it.each(rows)('$id parses to what the CLI prints', (row) => {
		const task = tasks.find((one) => one.id === row.id)!;
		expect(task.title).toBe(row.title);
		expect(task.status).toBe(row.status);
		expect(task.priority).toBe(row.priority);
		expect(task.tags).toEqual(row.tags);
	});

	it('orders by priority, highest first, as the CLI does', () => {
		// `tatr ls` sorts on priority alone, with qsort, so tasks of equal priority
		// come out in no defined order; only the sequence of priorities is the CLI's.
		const priorities = (closed: boolean) => ({
			ours: tasks
				.filter((task) => task.closed === closed)
				.sort(compareByPriority)
				.map((task) => task.priority),
			theirs: rows.filter((row) => (row.status === 'CLOSED') === closed).map((row) => row.priority)
		});
		for (const closed of [false, true]) {
			const { ours, theirs } = priorities(closed);
			expect(ours).toEqual(theirs);
		}
	});

	it.each(cliCases as CliCase[])(
		'`tatr ls $query` (closed: $closed) selects the same tasks',
		({ query, closed, ids }) => {
			const matches = compile(query);
			const selected = tasks
				.filter((task) => task.closed === closed)
				.filter((task) => matches(task))
				.map((task) => task.id)
				.sort();
			expect(selected.join(',')).toBe(ids);
		}
	);

	it('draws the same arrows as `tatr graph`, a task citing itself included', () => {
		const arrows = buildGraph(tasks)
			.clusters.flatMap((cluster) => cluster.nodes)
			.flatMap((node) => node.out.map((to) => `${node.task.id} -> ${to}`))
			.sort();
		const expected = (cliEdges as [string, string][]).map(([from, to]) => `${from} -> ${to}`);
		expect(arrows).toEqual(expected);
	});
});
