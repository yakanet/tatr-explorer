import { describe, expect, it } from 'vitest';
import { Sheet } from './sheet.svelte.ts';
import { NEW_TASK } from '../tatr/task-fields.ts';
import { makeTask } from '#tests/support/tasks.ts';

const ID = '20260101-000001';

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
		const [tags] = sheet.extras()(ID);
		expect(tags.path).toBe('tasks/tags');
		expect('rewrite' in tags && tags.rewrite('ui , screens\n')).toBe(
			'ui , screens\nfresh , a tag no task had\n'
		);
	});

	it('writes nothing besides the task file when nothing was added', () => {
		expect(new Sheet(NEW_TASK, REPO).extras()(ID)).toEqual([]);
	});
});

describe('the images of a sheet', () => {
	const NOW = new Date(Date.UTC(2026, 9, 12, 8, 30, 0));
	const png = (name: string) => new File(['a picture'], name, { type: 'image/png' });
	/** The sheet of a task whose folder holds `shot.png`. */
	const opened = () => {
		const task = makeTask(ID, 100);
		task.attachments = [{ name: 'shot.png', path: `tasks/${ID}/shot.png` }];
		return new Sheet(NEW_TASK, REPO, task);
	};

	it('links an image under a name the folder and the sheet do not hold yet', () => {
		const sheet = opened();
		expect(sheet.attach(png('shot.png'), NOW)).toBe('![shot-2.png](./shot-2.png)');
		expect(sheet.attach(png('shot.png'), NOW)).toBe('![shot-3.png](./shot-3.png)');
	});

	it('names a pasted screenshot after the clock', () => {
		expect(opened().attach(png('image.png'), NOW)).toBe(
			'![pasted-20261012-083000.png](./pasted-20261012-083000.png)'
		);
	});

	it('shows an image in the preview before it is written', () => {
		const sheet = opened();
		sheet.attach(png('new.png'), NOW);
		const url = sheet.preview({ taskId: ID, assetUrl: () => 'from the source' }).assetUrl;
		expect(url(`tasks/${ID}/new.png`)).toMatch(/^blob:/);
		expect(url(`tasks/${ID}/shot.png`)).toBe('from the source');
	});

	it('shows the images of a new task, which has no folder yet', () => {
		const sheet = new Sheet(NEW_TASK, REPO);
		sheet.attach(png('new.png'), NOW);
		const url = sheet.preview({ taskId: '', assetUrl: () => null }).assetUrl;
		expect(url('tasks/new.png')).toMatch(/^blob:/);
	});

	it('writes into the folder of the id it is given the images the description still links', () => {
		const sheet = opened();
		const kept = png('kept.png');
		sheet.draft.description = sheet.attach(kept, NOW);
		sheet.attach(png('dropped.png'), NOW);
		expect(sheet.extras()('20261012-083000')).toEqual([
			{ path: 'tasks/20261012-083000/kept.png', contents: kept }
		]);
	});
});
