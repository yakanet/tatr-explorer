import { describe, expect, it } from 'vitest';
import { describedTagsFile, parseTagsFile } from './tags-file.ts';

describe('parseTagsFile', () => {
	it('reads the upstream file, oddities included', () => {
		const { descriptions } = parseTagsFile(
			[
				'bug , unintended behavior of the system that needs correction',
				'stream , good stream topic',
				'release , planned for the next release',
				'tql,, Tatr Query Language'
			].join('\n')
		);
		expect(descriptions.get('bug')).toBe('unintended behavior of the system that needs correction');
		expect(descriptions.get('stream')).toBe('good stream topic');
		expect(descriptions.get('tql')).toBe('Tatr Query Language');
	});

	it('accepts a bare space as the separator', () => {
		expect(parseTagsFile('ui screens and interaction').descriptions.get('ui')).toBe(
			'screens and interaction'
		);
	});

	it('skips blank lines', () => {
		expect(parseTagsFile('\n\na , first\n\n\nb , second\n').descriptions.size).toBe(2);
	});

	it('keeps a tag with no description', () => {
		expect(parseTagsFile('lonely\n').descriptions.get('lonely')).toBe('');
	});

	it('keeps the last definition and reports the redefinition', () => {
		const { descriptions, redefined } = parseTagsFile('a , first\na , second\n');
		expect(descriptions.get('a')).toBe('second');
		expect(redefined).toEqual(['a']);
	});
});

describe('describedTagsFile', () => {
	const described = new Map([
		['scope', 'currently working on'],
		['data', 'fetching, then caching']
	]);

	it('appends one line per tag, leaving the lines there as they were', () => {
		expect(describedTagsFile('tql,, Tatr Query Language\n', described)).toBe(
			'tql,, Tatr Query Language\nscope , currently working on\ndata , fetching, then caching\n'
		);
	});

	it('ends the last line first when it lacks its line feed', () => {
		expect(describedTagsFile('ui , screens', new Map([['data', 'd']]))).toBe(
			'ui , screens\ndata , d\n'
		);
	});

	it('writes the whole file for a repository that has none', () => {
		expect(describedTagsFile(null, new Map([['ui', 'screens']]))).toBe('ui , screens\n');
	});

	it('reads back as the descriptions it was given', () => {
		const { descriptions } = parseTagsFile(describedTagsFile('ui , screens\n', described));
		expect(Object.fromEntries(descriptions)).toEqual({
			ui: 'screens',
			...Object.fromEntries(described)
		});
	});
});
