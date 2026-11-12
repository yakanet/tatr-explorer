import { describe, expect, it } from 'vitest';
import rawTasks from '#tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { makeTask } from '#tests/support/tasks.ts';
import {
	byMonth,
	byPriority,
	byTag,
	counts,
	monthName,
	newTags,
	summarise,
	topByPriority
} from './stats.ts';
import { readTask } from './task.ts';

const sources = rawTasks as Record<string, string>;
const all = Object.entries(sources).map(([id, source]) => readTask(id, source)!);
const open = all.filter((task) => !task.closed);

describe('counts', () => {
	it('matches the real repository', () => {
		expect(counts(all)).toEqual({ total: 94, open: 27, closed: 67, untagged: 41 });
	});

	it('is all zeroes for nothing', () => {
		expect(counts([])).toEqual({ total: 0, open: 0, closed: 0, untagged: 0 });
	});
});

describe('byPriority', () => {
	it('matches the real open tasks, highest first', () => {
		expect(byPriority(open)).toEqual([
			{ priority: 100, count: 18 },
			{ priority: 90, count: 2 },
			{ priority: 80, count: 2 },
			{ priority: 50, count: 3 },
			{ priority: 10, count: 2 }
		]);
	});

	it('sums to the number of tasks', () => {
		expect(byPriority(all).reduce((n, b) => n + b.count, 0)).toBe(all.length);
	});

	it('shows whatever priorities a repository actually uses', () => {
		expect(byPriority([makeTask('20260101-000001', 7), makeTask('20260101-000002', 3)])).toEqual([
			{ priority: 7, count: 1 },
			{ priority: 3, count: 1 }
		]);
	});
});

describe('byTag', () => {
	it('matches the real repository, most used first', () => {
		expect(byTag(all)).toEqual([
			{ tag: 'release', count: 21 },
			{ tag: 'bug', count: 15 },
			{ tag: 'tql', count: 9 },
			{ tag: 'wontfix', count: 6 },
			{ tag: 'scope', count: 5 },
			{ tag: 'spec', count: 5 },
			{ tag: 'stream', count: 3 },
			{ tag: 'bar', count: 1 },
			{ tag: 'emacs', count: 1 },
			{ tag: 'foo', count: 1 }
		]);
	});

	it('breaks ties alphabetically, so the order is stable', () => {
		const tasks = [
			makeTask('20260101-000001', 100, ['b']),
			makeTask('20260101-000002', 100, ['a'])
		];
		expect(byTag(tasks).map((t) => t.tag)).toEqual(['a', 'b']);
	});

	it('is empty when nothing is tagged', () => {
		expect(byTag([makeTask('20260101-000001', 100)])).toEqual([]);
	});
});

describe('byMonth', () => {
	it('matches the real repository, including its bursts', () => {
		// Only six months have tasks.
		expect(byMonth(all)).toEqual([
			{ month: '2025-12', open: 0, closed: 2 },
			{ month: '2026-01', open: 0, closed: 0 },
			{ month: '2026-02', open: 0, closed: 0 },
			{ month: '2026-03', open: 6, closed: 18 },
			{ month: '2026-04', open: 0, closed: 2 },
			{ month: '2026-05', open: 0, closed: 0 },
			{ month: '2026-06', open: 0, closed: 0 },
			{ month: '2026-07', open: 0, closed: 0 },
			{ month: '2026-08', open: 8, closed: 21 },
			{ month: '2026-09', open: 10, closed: 16 },
			{ month: '2026-10', open: 3, closed: 8 }
		]);
	});

	it('keeps empty months rather than skipping them', () => {
		const months = byMonth([makeTask('20260101-000001', 100), makeTask('20260401-000001', 100)]);
		expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
	});

	it('spans a year boundary', () => {
		const months = byMonth([makeTask('20251201-000001', 100), makeTask('20260201-000001', 100)]);
		expect(months.map((m) => m.month)).toEqual(['2025-12', '2026-01', '2026-02']);
	});

	it('is empty for nothing', () => {
		expect(byMonth([])).toEqual([]);
	});

	it('leaves out a task whose id is no real instant, and says nothing of it', () => {
		const months = byMonth([makeTask('20260101-000001', 100), makeTask('20260231-000000', 100)]);
		expect(months).toEqual([{ month: '2026-01', open: 1, closed: 0 }]);
		expect(byMonth([makeTask('20260231-000000', 100)])).toEqual([]);
	});

	it('sums to the number of tasks', () => {
		const months = byMonth(all);
		expect(months.reduce((n, m) => n + m.open + m.closed, 0)).toBe(all.length);
	});
});

describe('monthName', () => {
	it('names a month with its year, held together by a no-break space', () => {
		expect(monthName('2026-09')).toBe('September\u00a02026');
	});
});

describe('topByPriority', () => {
	it('takes the most urgent first', () => {
		const tasks = [
			makeTask('20260101-000001', 10),
			makeTask('20260101-000002', 110),
			makeTask('20260101-000003', 50)
		];
		expect(topByPriority(tasks, 2).map((task) => task.priority)).toEqual([110, 50]);
	});

	it('breaks ties by id, so the order is stable', () => {
		// The five are the lowest ids of the eighteen open tasks tied at 100.
		expect(topByPriority(open, 5).map((task) => task.id)).toEqual([
			'20260315-160715',
			'20260825-162925',
			'20260825-170729',
			'20260826-200345',
			'20260826-200847'
		]);
	});

	it('returns everything when the limit exceeds the set', () => {
		expect(topByPriority(open, 500)).toHaveLength(27);
	});
});

describe('summarise', () => {
	it('states the real repository in a sentence', () => {
		const summary = summarise(all, new Date('2026-10-09T00:00:00Z'));
		expect(summary.lead).toBe('27 tasks still open');
		expect(summary.detail).toBe('67 of the 94 are already closed');
	});

	it('counts the quiet months correctly', () => {
		const months = byMonth(all);
		expect(months).toHaveLength(11);
		expect(months.filter((m) => m.open + m.closed === 0)).toHaveLength(5);
	});

	it('leads with progress once a third is closed, in whole tasks and in agreement', () => {
		const tasks = [
			makeTask('20260801-000001', 100, ['bug'], true),
			makeTask('20260901-000001', 100, ['bug']),
			makeTask('20260901-000002', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBe(
			'1 of the 3 is already closed'
		);
	});

	it('does not repeat the lead when everything is closed', () => {
		const tasks = [makeTask('20260901-000001', 100, ['bug'], true)];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z'))).toEqual({
			lead: 'Nothing left open, out of 1',
			leadCount: 0,
			detail: null
		});
	});

	it('names the month a burst came in', () => {
		const tasks = [
			makeTask('20260101-000001', 100, ['bug']),
			makeTask('20260301-000001', 100, ['bug']),
			makeTask('20260301-000002', 100, ['bug']),
			makeTask('20260301-000003', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-04-01T00:00:00Z')).detail).toBe(
			'3 were created in March 2026 alone'
		);
	});

	it('names no month when two share the most', () => {
		const tasks = [
			makeTask('20260101-000001', 100, ['bug']),
			makeTask('20260301-000001', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-04-01T00:00:00Z')).detail).toBeNull();
	});

	it('names the month a quiet repository stopped at, not a duration', () => {
		const tasks = [
			makeTask('20260101-000001', 100, ['bug']),
			makeTask('20260201-000001', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBe(
			'the latest arrived in February 2026'
		);
	});

	it('says nothing rather than inventing an observation', () => {
		const tasks = [
			makeTask('20260801-000001', 100, ['bug']),
			makeTask('20260901-000001', 100, ['bug'])
		];
		expect(summarise(tasks, new Date('2026-09-07T00:00:00Z')).detail).toBeNull();
	});

	it('handles an empty repository and one with nothing open', () => {
		expect(summarise([]).lead).toBe('No tasks here yet');
		expect(summarise([makeTask('20260901-000001', 100, ['bug'], true)]).lead).toBe(
			'Nothing left open, out of 1'
		);
	});

	it('says "1 task", not "1 tasks"', () => {
		expect(summarise([makeTask('20260901-000001', 100, ['bug'])]).lead).toBe('1 task still open');
	});
});

describe('newTags', () => {
	it('keeps the tags no task carries and tasks/tags does not describe', () => {
		const tasks = [makeTask('20260101-000001', 100, ['ui'])];
		const descriptions = new Map([['data', 'fetching']]);
		expect(newTags(['ui', 'data', 'fresh'], tasks, descriptions)).toEqual(['fresh']);
	});
});
