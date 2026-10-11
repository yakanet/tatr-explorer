import { describe, expect, it } from 'vitest';
import { parseTagsFile } from './tags-file.ts';

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
