import { describe, expect, it } from 'vitest';
import rawTasks from '#tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { makeTask } from '#tests/support/tasks.ts';
import { columnOf, IN_PROGRESS, moveTo, toColumns } from './board.ts';
import { editTaskMd } from './task-file.ts';
import { readTask, type Task } from './task.ts';

const sources = rawTasks as Record<string, string>;
const all = Object.entries(sources).map(([id, source]) => readTask(id, source)!);

const ids = (tasks: Task[]) => tasks.map((task) => task.id);

describe('toColumns', () => {
	it('splits the real repository three ways', () => {
		const [backlog, progress, done] = toColumns(all);
		expect(backlog.tasks).toHaveLength(26);
		expect(progress.tasks).toHaveLength(7);
		expect(done.tasks).toHaveLength(46);
	});

	it('accounts for every task exactly once', () => {
		const columns = toColumns(all);
		const placed = columns.flatMap((column) => ids(column.tasks));
		expect(placed).toHaveLength(79);
		expect(new Set(placed).size).toBe(79);
	});

	it('puts a task carrying the tag in progress', () => {
		const [, progress] = toColumns([makeTask('20260101-000001', 90, [IN_PROGRESS, 'ui'])]);
		expect(ids(progress.tasks)).toEqual(['20260101-000001']);
	});

	it('counts a closed task as done even when still tagged', () => {
		const [backlog, progress, done] = toColumns([
			makeTask('20260101-000001', 90, [IN_PROGRESS], true)
		]);
		expect(ids(done.tasks)).toEqual(['20260101-000001']);
		expect(progress.tasks).toEqual([]);
		expect(backlog.tasks).toEqual([]);
	});

	it('orders the open columns by priority, as `tatr ls` does', () => {
		const [backlog] = toColumns([
			makeTask('20260101-000001', 50),
			makeTask('20260101-000002', 110),
			makeTask('20260101-000003', 90)
		]);
		expect(ids(backlog.tasks)).toEqual(['20260101-000002', '20260101-000003', '20260101-000001']);
	});

	it('breaks a priority tie by id, oldest first', () => {
		const [backlog] = toColumns([makeTask('20260202-000001', 90), makeTask('20260101-000001', 90)]);
		expect(ids(backlog.tasks)).toEqual(['20260101-000001', '20260202-000001']);
	});

	it('orders done newest first, ignoring priority', () => {
		const [, , done] = toColumns([
			makeTask('20260101-000001', 110, [], true),
			makeTask('20260303-000001', 10, [], true),
			makeTask('20260202-000001', 50, [], true)
		]);
		expect(ids(done.tasks)).toEqual(['20260303-000001', '20260202-000001', '20260101-000001']);
	});

	it('handles several tasks in progress, which upstream has', () => {
		// The convention is one at a time, but tsoding/tatr has seven.
		const [, progress] = toColumns(all);
		expect(progress.tasks.length).toBeGreaterThan(1);
	});

	it('gives three empty columns for an empty repository', () => {
		expect(toColumns([]).map((column) => column.tasks)).toEqual([[], [], []]);
	});

	it('always names its columns, so the view need not', () => {
		expect(toColumns([]).map((column) => column.key)).toEqual(['backlog', 'progress', 'done']);
	});

	it('totals what a column holds before the query', () => {
		expect(toColumns(all).map((column) => column.total)).toEqual([26, 7, 46]);
	});
});

describe('toColumns under a query', () => {
	const scoped = (task: Task) => task.tags.includes('scope');

	it('narrows each column and keeps its total', () => {
		const [backlog, progress, done] = toColumns(all, scoped);
		expect(progress.tasks).toHaveLength(7);
		expect(progress.total).toBe(7);
		// No other task carries the tag, yet the totals still count them.
		expect([backlog.tasks.length, backlog.total]).toEqual([0, 26]);
		expect([done.tasks.length, done.total]).toEqual([0, 46]);
	});

	it('leaves the totals alone when nothing matches', () => {
		const columns = toColumns(all, () => false);
		expect(columns.map((column) => column.tasks.length)).toEqual([0, 0, 0]);
		expect(columns.map((column) => column.total)).toEqual([26, 7, 46]);
	});

	it('counts a task in the column it belongs to, matched or not', () => {
		// The query filters cards; it never moves one to another column.
		const columns = toColumns([makeTask('20260101-000001', 90, [], true)], () => false);
		expect(columns.map((column) => column.total)).toEqual([0, 0, 1]);
	});

	it('sorts what survived, not what was there', () => {
		const columns = toColumns(
			[
				makeTask('20260101-000001', 50, ['ui']),
				makeTask('20260101-000002', 110),
				makeTask('20260101-000003', 90, ['ui'])
			],
			(task) => task.tags.includes('ui')
		);
		expect(ids(columns[0].tasks)).toEqual(['20260101-000003', '20260101-000001']);
	});
});

describe('moving a card', () => {
	const at = (status: string, tags: string) =>
		`# t\n\n- STATUS: ${status}\n- PRIORITY: 50\n- TAGS: ${tags}\n`;

	it.each([
		['done', at('OPEN', 'scope,ui'), at('CLOSED', 'scope,ui')],
		['progress', at('OPEN', 'ui'), at('OPEN', 'ui,scope')],
		['backlog', at('OPEN', 'ui,scope'), at('OPEN', 'ui')],
		['progress', at('CLOSED', 'ui'), at('OPEN', 'ui,scope')],
		['backlog', at('CLOSED', 'scope,ui'), at('OPEN', 'ui')]
	] as const)('to %s rewrites only what the move needs', (column, before, after) => {
		expect(editTaskMd(before, moveTo(column))).toBe(after);
	});

	it('keeps a status that is neither open nor closed, outside Done', () => {
		expect(editTaskMd(at('WIP', 'ui'), moveTo('progress'))).toBe(at('WIP', 'ui,scope'));
	});

	it('lands the card in the column it was moved to', () => {
		for (const column of ['backlog', 'progress', 'done'] as const) {
			const text = editTaskMd(at('CLOSED', 'scope'), moveTo(column))!;
			expect(columnOf(readTask('20260101-000001', text)!)).toBe(column);
		}
	});
});
