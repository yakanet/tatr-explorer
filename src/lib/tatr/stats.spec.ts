import { describe, expect, it } from 'vitest';
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { byMonth, byPriority, byTag, counts, summarise, topByPriority } from './stats.ts';
import { readTask, type Task } from './task.ts';

const sources = rawTasks as Record<string, string>;
const all = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
const open = all.filter((task) => !task.closed);

const make = (id: string, priority: number, tags: string[], closed = false): Task =>
	readTask(
		id,
		`# t\n\n- STATUS: ${closed ? 'CLOSED' : 'OPEN'}\n- PRIORITY: ${priority}\n- TAGS: ${tags.join(',')}\n`
	)!;

describe('counts', () => {
	it('matches the real repository', () => {
		expect(counts(all)).toEqual({ total: 79, open: 33, closed: 46, untagged: 34 });
	});

	it('is all zeroes for nothing', () => {
		expect(counts([])).toEqual({ total: 0, open: 0, closed: 0, untagged: 0 });
	});
});

describe('byPriority', () => {
	it('matches the real open tasks, highest first', () => {
		expect(byPriority(open)).toEqual([
			{ priority: 110, count: 1 },
			{ priority: 105, count: 1 },
			{ priority: 101, count: 1 },
			{ priority: 100, count: 19 },
			{ priority: 90, count: 3 },
			{ priority: 80, count: 2 },
			{ priority: 50, count: 2 },
			{ priority: 30, count: 2 },
			{ priority: 10, count: 2 }
		]);
	});

	it('sums to the number of tasks', () => {
		expect(byPriority(all).reduce((n, b) => n + b.count, 0)).toBe(79);
	});

	it('shows whatever priorities a repository actually uses', () => {
		expect(byPriority([make('20260101-000001', 7, []), make('20260101-000002', 3, [])])).toEqual([
			{ priority: 7, count: 1 },
			{ priority: 3, count: 1 }
		]);
	});
});

describe('byTag', () => {
	it('matches the real repository, most used first', () => {
		expect(byTag(all)).toEqual([
			{ tag: 'release', count: 21 },
			{ tag: 'bug', count: 12 },
			{ tag: 'tql', count: 9 },
			{ tag: 'scope', count: 7 },
			{ tag: 'stream', count: 3 },
			{ tag: 'wontfix', count: 3 },
			{ tag: 'bar', count: 1 },
			{ tag: 'emacs', count: 1 },
			{ tag: 'foo', count: 1 }
		]);
	});

	it('breaks ties alphabetically, so the order is stable', () => {
		const tasks = [make('20260101-000001', 100, ['b']), make('20260101-000002', 100, ['a'])];
		expect(byTag(tasks).map((t) => t.tag)).toEqual(['a', 'b']);
	});

	it('is empty when nothing is tagged', () => {
		expect(byTag([make('20260101-000001', 100, [])])).toEqual([]);
	});
});

describe('byMonth', () => {
	it('matches the real repository, including its bursts', () => {
		// Only five months have anything; the quiet ones are the point.
		expect(byMonth(all)).toEqual([
			{ month: '2025-12', open: 0, closed: 2 },
			{ month: '2026-01', open: 0, closed: 0 },
			{ month: '2026-02', open: 0, closed: 0 },
			{ month: '2026-03', open: 7, closed: 17 },
			{ month: '2026-04', open: 0, closed: 2 },
			{ month: '2026-05', open: 0, closed: 0 },
			{ month: '2026-06', open: 0, closed: 0 },
			{ month: '2026-07', open: 0, closed: 0 },
			{ month: '2026-08', open: 9, closed: 20 },
			{ month: '2026-09', open: 17, closed: 5 }
		]);
	});

	it('keeps empty months rather than skipping them', () => {
		const months = byMonth([make('20260101-000001', 100, []), make('20260401-000001', 100, [])]);
		expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
	});

	it('spans a year boundary', () => {
		const months = byMonth([make('20251201-000001', 100, []), make('20260201-000001', 100, [])]);
		expect(months.map((m) => m.month)).toEqual(['2025-12', '2026-01', '2026-02']);
	});

	it('is empty for nothing', () => {
		expect(byMonth([])).toEqual([]);
	});

	it('sums to the number of tasks', () => {
		const months = byMonth(all);
		expect(months.reduce((n, m) => n + m.open + m.closed, 0)).toBe(79);
	});
});

describe('topByPriority', () => {
	it('takes the most urgent first', () => {
		expect(topByPriority(open, 2).map((task) => task.priority)).toEqual([110, 105]);
	});

	it('breaks ties by id, so the order is stable', () => {
		// The first three priorities are unique; the fourth and fifth are the
		// lowest ids of the nineteen open tasks tied at 100.
		expect(topByPriority(open, 5).map((task) => task.id)).toEqual([
			'20260830-041724',
			'20260912-085629',
			'20260910-181239',
			'20260315-160715',
			'20260825-162925'
		]);
	});

	it('returns everything when the limit exceeds the set', () => {
		expect(topByPriority(open, 500)).toHaveLength(33);
	});
});

describe('summarise', () => {
	it('states the real repository in a sentence', () => {
		const summary = summarise(all, new Date('2026-10-09T00:00:00Z'));
		expect(summary.lead).toBe('33 tasks still open');
		expect(summary.detail).toBe('46 of the 79 are already closed');
	});

	it('counts the quiet months correctly', () => {
		const months = byMonth(all);
		expect(months).toHaveLength(10);
		expect(months.filter((m) => m.open + m.closed === 0)).toHaveLength(5);
	});

	it('leads with progress once a third is closed, in whole tasks and in agreement', () => {
		const tasks = [
			make('20260801-000001', 100, ['bug'], true),
			make('20260901-000001', 100, ['bug']),
			make('20260901-000002', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBe(
			'1 of the 3 is already closed'
		);
	});

	it('does not repeat the lead when everything is closed', () => {
		const tasks = [make('20260901-000001', 100, ['bug'], true)];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z'))).toEqual({
			lead: 'Nothing left open, out of 1',
			leadCount: 0,
			detail: null
		});
	});

	it('names the month a burst came in', () => {
		const tasks = [
			make('20260101-000001', 100, ['bug']),
			make('20260301-000001', 100, ['bug']),
			make('20260301-000002', 100, ['bug']),
			make('20260301-000003', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-04-01T00:00:00Z')).detail).toBe(
			'3 were created in March 2026 alone'
		);
	});

	it('names no month when two share the most', () => {
		const tasks = [make('20260101-000001', 100, ['bug']), make('20260301-000001', 100, ['bug'])];
		expect(summarise(tasks, new Date('2026-04-01T00:00:00Z')).detail).toBeNull();
	});

	it('names the month a quiet repository stopped at, not a duration', () => {
		// "nothing new in seven months" reads as a countdown from today and invites
		// the reader to work out when that was; the month itself does not.
		const tasks = [make('20260101-000001', 100, ['bug']), make('20260201-000001', 100, ['bug'])];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBe(
			'the latest arrived in February 2026'
		);
	});

	it('says nothing rather than inventing an observation', () => {
		const tasks = [make('20260801-000001', 100, ['bug']), make('20260901-000001', 100, ['bug'])];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBeNull();
	});

	it('handles an empty repository and one with nothing open', () => {
		expect(summarise([]).lead).toBe('No tasks here yet');
		expect(summarise([make('20260901-000001', 100, ['bug'], true)]).lead).toBe(
			'Nothing left open, out of 1'
		);
	});

	it('says "1 task", not "1 tasks"', () => {
		expect(summarise([make('20260901-000001', 100, ['bug'])]).lead).toBe('1 task still open');
	});
});
