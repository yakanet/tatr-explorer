import { describe, expect, it } from 'vitest';
import cliOutput from '#tests/fixtures/tatr-ls-output.json' with { type: 'json' };
import rawTasks from '#tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { compareByPriority, readTask, type Task } from './task.ts';

/**
 * Compares the parser with the reference implementation over tsoding/tatr.
 *
 * `tsoding-tatr-raw.json` holds its 79 `TASK.md` files verbatim, and
 * `tatr-ls-output.json` what the compiled `tatr ls` printed for them. Every
 * field the CLI shows (status, priority, tags, title) is compared, so a
 * divergence from the C parser fails the suite. `pnpm run fixtures` regenerates
 * both.
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

function earlier(a: Task, b: Task): Task {
	if (a.created! < b.created!) return a;
	return b;
}

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
		// Upstream's 20260912-102943 exercises `[other properties]`, which the
		// format's spec documents and the CLI ignores; `FOO` and `DUPLICATE` are kept.
		expect([...keys].sort()).toEqual(['DUPLICATE', 'FOO', 'PRIORITY', 'STATUS', 'TAGS']);
	});

	it('reads a creation date for every task, straight from its id', () => {
		const tasks = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
		expect(tasks.filter((task) => task.created === null)).toEqual([]);
		const earliest = tasks.reduce(earlier);
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

		// These counts need team suffixes: `20260826-204052` cites
		// `20260830-000838-rexim`, which a pattern without the suffix misses.
		expect(edges).toHaveLength(36);
		expect(nodes.size).toBe(36);

		// Upstream's mass-update task is cited by eight others, one of them
		// (20260912-102943) only in its title, which a body-only scan would miss.
		const incoming = edges.filter((edge) => edge.endsWith('->20260828-211200'));
		expect(incoming).toHaveLength(8);
	});
});
