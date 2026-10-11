import { describe, expect, it } from 'vitest';
import { compare, snapshot, type Snapshot } from './changes.ts';
import { readTask, type Task } from './task.ts';

const make = (id: string, priority: number, tags: string[], closed = false): Task =>
	readTask(
		id,
		`# ${id}\n\n- STATUS: ${closed ? 'CLOSED' : 'OPEN'}\n- PRIORITY: ${priority}\n- TAGS: ${tags.join(',')}\n`
	)!;

const before = (tasks: Task[], at = 1_000): Snapshot => snapshot(tasks, at);

const kinds = (id: string, tasks: Task[], was: Snapshot) => compare(was, tasks).moved.get(id);

describe('snapshot', () => {
	it('keeps only what a comparison can see', () => {
		const taken = snapshot([make('20260101-000001', 90, ['ui'])], 7);
		expect(taken).toEqual({
			at: 7,
			tasks: [{ id: '20260101-000001', closed: false, priority: 90, tags: ['ui'] }]
		});
	});

	it('drops the description, so a rewritten body is not announced', () => {
		const task = readTask('20260101-000001', '# t\n\n- STATUS: OPEN\n\nA long body.\n')!;
		expect(task.description).toBeDefined();
		expect(Object.keys(snapshot([task], 0).tasks[0]).toSorted()).toEqual([
			'closed',
			'id',
			'priority',
			'tags'
		]);
	});
});

describe('compare', () => {
	const open = make('20260101-000001', 90, ['ui']);

	it('says nothing about a repository that did not move', () => {
		const changes = compare(before([open]), [open]);
		expect(changes.total).toBe(0);
		expect(changes.moved.size).toBe(0);
	});

	it('carries the time it is comparing against, for the wording', () => {
		expect(compare(before([open], 1_700_000), [open]).since).toBe(1_700_000);
	});

	it('reports a task that closed', () => {
		const closed = make('20260101-000001', 90, ['ui'], true);
		expect(kinds('20260101-000001', [closed], before([open]))).toEqual(['closed']);
	});

	it('reports a task that came back open, which is not the same event', () => {
		const closed = make('20260101-000001', 90, ['ui'], true);
		expect(kinds('20260101-000001', [open], before([closed]))).toEqual(['reopened']);
	});

	it('reports a new task', () => {
		const added = make('20260202-000002', 50, []);
		expect(kinds('20260202-000002', [open, added], before([open]))).toEqual(['new']);
	});

	it('calls a task that arrives already closed new, not closed', () => {
		const born = make('20260202-000002', 50, [], true);
		expect(kinds('20260202-000002', [open, born], before([open]))).toEqual(['new']);
	});

	it('reports a task whose folder is gone', () => {
		expect(kinds('20260101-000001', [], before([open]))).toEqual(['gone']);
	});

	it('reports a repriorised task', () => {
		const raised = make('20260101-000001', 110, ['ui']);
		expect(kinds('20260101-000001', [raised], before([open]))).toEqual(['repriorised']);
	});

	it('reports a retagged task, `scope` moving being the point of it', () => {
		const scoped = make('20260101-000001', 90, ['ui', 'scope']);
		expect(kinds('20260101-000001', [scoped], before([open]))).toEqual(['retagged']);
	});

	it('says nothing when tags were only reordered', () => {
		const two = make('20260101-000001', 90, ['ui', 'bug']);
		const swapped = make('20260101-000001', 90, ['bug', 'ui']);
		expect(compare(before([two]), [swapped]).total).toBe(0);
	});

	it('lists both movements of a task that closed and was repriorised at once', () => {
		const done = make('20260101-000001', 10, ['ui'], true);
		const changes = compare(before([open]), [done]);
		expect(changes.total).toBe(1);
		expect(changes.moved.get('20260101-000001')).toEqual(['closed', 'repriorised']);
	});

	it('totals every kind of movement together', () => {
		const changes = compare(
			before([open, make('20260101-000003', 90, []), make('20260101-000004', 90, [])]),
			[
				make('20260101-000001', 90, ['ui'], true),
				make('20260101-000003', 20, []),
				make('20260202-000002', 50, [])
			]
		);
		expect([...changes.moved.entries()].toSorted()).toEqual([
			['20260101-000001', ['closed']],
			['20260101-000003', ['repriorised']],
			['20260101-000004', ['gone']],
			['20260202-000002', ['new']]
		]);
		expect(changes.total).toBe(4);
	});

	it('compares an empty history against a full repository as all new', () => {
		const changes = compare(before([]), [open, make('20260202-000002', 50, [])]);
		expect([...changes.moved.values()]).toEqual([['new'], ['new']]);
	});
});
