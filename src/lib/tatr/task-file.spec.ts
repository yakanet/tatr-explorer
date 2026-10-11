import { describe, expect, it } from 'vitest';
import {
	editTaskMd,
	EditRefused,
	loadTaskFile,
	renderTaskMd,
	withoutTag,
	withPriority,
	withStatus,
	withTag
} from './task-file.ts';

const PLAIN = '# A task\n\n- STATUS: OPEN\n- PRIORITY: 50\n- TAGS: data,ui\n\nA body.\n';

describe('loading a task file to rewrite it', () => {
	it('refuses a file whose title lacks its `#`, which the CLI would empty', () => {
		expect(loadTaskFile('A task\n\n- STATUS: OPEN\n')).toBeNull();
	});

	it('appends the defaults the CLI assumes, in its order', () => {
		const file = loadTaskFile('# A task\n\n- TAGS: ui\n')!;
		expect([...file.properties]).toEqual([
			['TAGS', 'ui'],
			['STATUS', 'OPEN'],
			['PRIORITY', '999999']
		]);
	});
});

describe('rendering a task file', () => {
	it('gives back a file the CLI wrote, byte for byte', () => {
		expect(renderTaskMd(loadTaskFile(PLAIN)!)).toBe(PLAIN);
	});

	it('normalises every property as the CLI writes it', () => {
		const loose = '# T\n\n\n  -  STATUS : OPEN\n- PRIORITY: 07x\n-TAGS: a , b,,c\n- OWNER:\n';
		expect(renderTaskMd(loadTaskFile(loose)!)).toBe(
			'# T\n\n- STATUS: OPEN\n- PRIORITY: 7\n- TAGS: a,b,c\n- OWNER: \n'
		);
	});

	it('leaves no space after the colon of an empty TAGS', () => {
		expect(renderTaskMd(loadTaskFile('# T\n\n- TAGS:\n')!)).toContain('- TAGS:\n');
	});
});

describe('editing a task file', () => {
	it('sets a property in its place', () => {
		expect(editTaskMd(PLAIN, withStatus('CLOSED'))).toBe(PLAIN.replace('OPEN', 'CLOSED'));
		expect(editTaskMd(PLAIN, withPriority(60))).toBe(PLAIN.replace('50', '60'));
	});

	it('adds a tag after the others', () => {
		expect(editTaskMd(PLAIN, withTag('scope'))).toBe(PLAIN.replace('data,ui', 'data,ui,scope'));
	});

	it('removes a tag as `tatr untag` does, the last one taking its place', () => {
		const tagged = PLAIN.replace('data,ui', 'scope,data,ui');
		expect(editTaskMd(tagged, withoutTag('scope'))).toBe(PLAIN.replace('data,ui', 'ui,data'));
		expect(editTaskMd(tagged, withoutTag('ui'))).toBe(PLAIN.replace('data,ui', 'scope,data'));
	});

	it('removes every occurrence of a tag', () => {
		const twice = PLAIN.replace('data,ui', 'ui,data,ui');
		expect(editTaskMd(twice, withoutTag('ui'))).toBe(PLAIN.replace('data,ui', 'data'));
	});

	it('gives the text back untouched when the edit changes nothing', () => {
		const loose = PLAIN.replace('data,ui', 'data, ui');
		expect(editTaskMd(loose, withTag('ui'))).toBe(loose);
		expect(editTaskMd(loose, withoutTag('scope'))).toBe(loose);
		expect(editTaskMd(loose, withPriority(50))).toBe(loose);
	});

	it('refuses a file whose title lacks its `#`', () => {
		expect(() => editTaskMd('A task\n\n- STATUS: OPEN\n', withStatus('CLOSED'))).toThrow(
			EditRefused
		);
	});
});
