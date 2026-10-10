import { describe, expect, it } from 'vitest';
import cliOutput from '../../../tests/fixtures/tatr-ls-output.json' with { type: 'json' };
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { compareByPriority, readTask } from './task.ts';

/**
 * Differential test of the parser against the reference implementation.
 *
 * `tsoding-tatr-raw.json` holds the 79 `TASK.md` files of tsoding/tatr verbatim;
 * `tatr-ls-output.json` holds what the compiled `tatr ls` binary printed for the
 * same folder. Every field the CLI shows (status, priority, tags, title) is
 * re-derived here and compared, so a divergence from the C parser fails the suite.
 *
 * To regenerate: `pnpm run fixtures`, with the checkout at `../tatr` built.
 */
interface CliRow {
	id: string;
	status: string;
	priority: number;
	tags: string[];
	title: string;
}

const rows = cliOutput as CliRow[];
const sources = rawTasks as Record<string, string>;

describe('conformance with the tatr parser', () => {
	it('covers the whole repository', () => {
		expect(rows).toHaveLength(79);
		expect(Object.keys(sources)).toHaveLength(79);
	});

	it.each(rows)('$id parses to what the CLI prints', (row) => {
		const task = readTask(row.id, sources[row.id]);
		expect(task).not.toBeNull();
		expect(task!.title).toBe(row.title);
		expect(task!.status).toBe(row.status);
		expect(task!.priority).toBe(row.priority);
		expect(task!.tags).toEqual(row.tags);
	});

	it('agrees on which tasks are closed', () => {
		const mine = Object.entries(sources)
			.map(([id, source]) => readTask(id, source)!)
			.filter((task) => task.closed)
			.map((task) => task.id)
			.sort();
		const theirs = rows
			.filter((row) => row.status === 'CLOSED')
			.map((row) => row.id)
			.sort();
		expect(mine).toEqual(theirs);
	});

	it('parses every file without falling back to the invalid title', () => {
		const malformed = Object.entries(sources)
			.map(([id, source]) => readTask(id, source)!)
			.filter((task) => task.malformed);
		expect(malformed).toEqual([]);
	});

	it('finds properties beyond the documented three', () => {
		const keys = new Set<string>();
		for (const [id, source] of Object.entries(sources)) {
			for (const key of readTask(id, source)!.properties.keys()) keys.add(key);
		}
		// Upstream's 20260912-102943 exists to exercise `[other properties]`, which
		// the spec now documents and the CLI ignores: `FOO` and `DUPLICATE` sit
		// among the three, and are kept rather than dropped.
		expect([...keys].sort()).toEqual(['DUPLICATE', 'FOO', 'PRIORITY', 'STATUS', 'TAGS']);
	});

	it('reads a creation date for every task, straight from its id', () => {
		const tasks = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
		expect(tasks.filter((task) => task.created === null)).toEqual([]);
		const earliest = tasks.reduce((a, b) => (a.created! < b.created! ? a : b));
		expect(earliest.id).toBe('20251205-071347');
	});

	it('sorts by priority descending, as the CLI does by default', () => {
		const open = Object.entries(sources)
			.map(([id, source]) => readTask(id, source)!)
			.filter((task) => !task.closed)
			.sort(compareByPriority);
		expect(open[0].priority).toBe(110);
		expect(open.at(-1)!.priority).toBe(10);
	});

	it('extracts the cross-reference graph the repository actually contains', () => {
		const tasks = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
		const known = new Set(tasks.map((task) => task.id));

		const edges = tasks.flatMap((task) =>
			task.references.filter((ref) => known.has(ref)).map((ref) => `${task.id}->${ref}`)
		);
		const nodes = new Set(edges.flatMap((edge) => edge.split('->')));

		// Measured on the real repository. Counting these correctly means honouring
		// team suffixes: `20260826-204052` cites `20260830-000838-rexim`, an edge a
		// pattern without the suffix silently misses.
		expect(edges).toHaveLength(36);
		expect(nodes.size).toBe(36);

		// The hub, upstream's mass-update task, cited by eight others. One of them,
		// 20260912-102943, names it only in its title, which a scan of the body
		// alone would miss.
		const incoming = edges.filter((edge) => edge.endsWith('->20260828-211200'));
		expect(incoming).toHaveLength(8);
	});
});
