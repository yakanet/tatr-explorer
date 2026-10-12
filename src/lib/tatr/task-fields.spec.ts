import { describe, expect, it } from 'vitest';
import { editTaskMd, EditRefused, loadTaskFile } from './task-file.ts';
import { fieldsOf, NEW_TASK, newTaskMd, withFields, type TaskFields } from './task-fields.ts';

const FILE = '# A task\n\n- STATUS: OPEN\n- PRIORITY: 50\n- TAGS: data,ui\n\nA body.\n\nMore.\n';

const fields = (text: string): TaskFields => fieldsOf(loadTaskFile(text)!);

/** Saves `change` over the sheet opened on `opened`, into the file as it is now. */
const save = (opened: string, change: Partial<TaskFields>, now = opened) => {
	const sheet = fields(opened);
	return editTaskMd(now, withFields(sheet, { ...sheet, ...change }));
};

describe('the fields of a task file', () => {
	it('reads the description without the blank lines that open it', () => {
		expect(fields(FILE)).toEqual({
			title: 'A task',
			status: 'OPEN',
			priority: 50,
			tags: ['data', 'ui'],
			description: 'A body.\n\nMore.\n'
		});
	});

	it('reads the defaults of a reading whose properties lack them', () => {
		const reading = { title: 'T', properties: new Map(), body: '' };
		expect(fieldsOf(reading)).toMatchObject({ status: 'OPEN', priority: 999999, tags: [] });
	});

	it('reads a file with CRLF line endings as an editor shows it', () => {
		const crlf = fields(FILE.replaceAll('\n', '\r\n'));
		expect(crlf.title).toBe('A task');
		expect(crlf.description).toBe('A body.\n\nMore.\n');
	});
});

describe('saving the fields changed on a sheet', () => {
	it('writes nothing when nothing changed', () => {
		expect(save(FILE, {})).toBe(FILE);
	});

	it('writes the title, the description and the properties in their place', () => {
		expect(save(FILE, { title: 'Renamed', description: 'New.\n', priority: 60 })).toBe(
			'# Renamed\n\n- STATUS: OPEN\n- PRIORITY: 60\n- TAGS: data,ui\n\nNew.\n'
		);
		expect(save(FILE, { status: 'CLOSED', tags: ['ui', 'scope'] })).toBe(
			FILE.replace('OPEN', 'CLOSED').replace('data,ui', 'ui,scope')
		);
	});

	it('keeps what changed on disk in a field the sheet left alone', () => {
		const now = FILE.replace('PRIORITY: 50', 'PRIORITY: 70');
		expect(save(FILE, { description: 'New.\n' }, now)).toBe(
			now.replace('A body.\n\nMore.\n', 'New.\n')
		);
	});

	it('refuses a field changed on both sides, writing nothing', () => {
		const now = FILE.replace('PRIORITY: 50', 'PRIORITY: 70');
		expect(() => save(FILE, { priority: 60, title: 'Renamed' }, now)).toThrow(EditRefused);
		expect(() => save(FILE, { priority: 60 }, now)).toThrow(
			'the priority changed on disk since editing began, so nothing was written.'
		);
	});

	it('accepts a field changed on disk to what the sheet says', () => {
		const now = FILE.replace('PRIORITY: 50', 'PRIORITY: 60');
		expect(save(FILE, { priority: 60 }, now)).toBe(now);
	});

	it('separates a new description from the properties by a blank line', () => {
		const bare = '# A task\n\n- STATUS: OPEN\n- PRIORITY: 50\n- TAGS: ui\n';
		const written = save(bare, { description: '- NOT: a property\n' })!;
		expect(written).toBe(`${bare}\n- NOT: a property\n`);
		expect(fields(written).description).toBe('- NOT: a property\n');
	});

	it('empties the body when the description is cleared', () => {
		expect(save(FILE, { description: '' })).toBe(
			'# A task\n\n- STATUS: OPEN\n- PRIORITY: 50\n- TAGS: data,ui\n'
		);
	});

	it('keeps the CRLF line endings of a file written with them', () => {
		const crlf = FILE.replaceAll('\n', '\r\n');
		const written = save(crlf, { title: 'Renamed', description: 'One.\nTwo.\n' })!;
		// The properties are rendered with line feeds, as `render_task_md` writes them.
		expect(written).toContain('# Renamed\r\n');
		expect(written.endsWith('- TAGS: data,ui\n\r\nOne.\r\nTwo.\r\n')).toBe(true);
	});
});

describe('the file of a new task', () => {
	// What `tatr new` writes for a title, a priority and tags is pinned against
	// the binary in `task-file.conformance.spec.ts`.
	it('puts a description in place of `No description.`, ended by a line feed', () => {
		const text = newTaskMd({ ...NEW_TASK, title: 'T', description: 'Why.\n\n- not a property' });
		expect(text).toBe(
			'# T\n\n- STATUS: OPEN\n- PRIORITY: 100\n- TAGS:\n\nWhy.\n\n- not a property\n'
		);
	});

	it('reads back as the fields it was written from', () => {
		const typed = {
			title: 'T',
			status: 'CLOSED',
			priority: -3,
			tags: ['a', 'b'],
			description: 'D\n'
		};
		expect(fields(newTaskMd(typed))).toEqual(typed);
	});
});
