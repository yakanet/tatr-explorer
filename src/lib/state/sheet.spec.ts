import { describe, expect, it } from 'vitest';
import { Sheet } from './sheet.svelte.ts';
import { NEW_TASK } from '../tatr/task-fields.ts';
import { makeTask } from '#tests/support/tasks.ts';

/** A repository whose one task is tagged `ui`, and whose `tasks/tags` describes `data`. */
const REPO = {
	tasks: [makeTask('20260101-000001', 100, ['ui'])],
	tags: { descriptions: new Map([['data', 'fetching']]), redefined: [] }
};

describe('an editing sheet', () => {
	it('is clean until its draft differs from what it was opened on', () => {
		const sheet = new Sheet(NEW_TASK, REPO);
		expect(sheet.dirty).toBe(false);
		sheet.draft.title = 'Typed';
		expect(sheet.dirty).toBe(true);
	});

	it('edits a copy, never the fields it was opened on', () => {
		const sheet = new Sheet(NEW_TASK, REPO);
		sheet.draft.tags.push('ui');
		expect(NEW_TASK.tags).toEqual([]);
	});

	it('finds the tags of the draft that are new to the repository', () => {
		const sheet = new Sheet(NEW_TASK, REPO);
		sheet.draft.tags = ['ui', 'data', 'fresh'];
		expect(sheet.fresh).toEqual(['fresh']);
	});

	it('writes the descriptions typed for new tags, leaving out blank and old ones', () => {
		const sheet = new Sheet(NEW_TASK, REPO);
		sheet.draft.tags = ['ui', 'fresh', 'blank', 'untyped'];
		sheet.described = { ui: 'used already', fresh: '  a tag no task had ', blank: '  ', gone: 'x' };
		expect(sheet.extras().tags).toEqual(new Map([['fresh', 'a tag no task had']]));
	});
});
