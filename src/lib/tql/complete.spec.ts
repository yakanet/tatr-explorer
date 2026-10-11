import { describe, expect, it } from 'vitest';
import { apply, complete, tokenAt, type TagOption } from './complete.ts';

const TAGS: TagOption[] = [
	{ name: 'bug', description: 'something is broken', count: 9 },
	{ name: 'release', description: 'planned for the next release', count: 21 },
	{ name: 'tql', description: 'Tatr Query Language', count: 8 },
	{ name: 'scope', description: 'currently working on', count: 2 },
	{ name: 'debug', count: 1 }
];

const values = (text: string, cursor = text.length) =>
	complete(text, cursor, TAGS)?.items.map((item) => item.value) ?? null;

describe('tokenAt', () => {
	it('spans the word the caret sits in', () => {
		expect(tokenAt('not :bug', 8)).toEqual({ start: 4, end: 8 });
		expect(tokenAt('not :bug', 3)).toEqual({ start: 0, end: 3 });
	});

	it('reaches past the caret to the end of the token', () => {
		expect(tokenAt(':bug and', 2)).toEqual({ start: 0, end: 4 });
	});

	it('spans the whole token even with the caret at its start', () => {
		// `complete` reads what was typed up to the caret; the end is what a
		// completion replaces.
		expect(tokenAt('not :bug', 4)).toEqual({ start: 4, end: 8 });
	});

	it('is empty where no token touches the caret', () => {
		expect(tokenAt('not  :bug', 4)).toEqual({ start: 4, end: 4 });
	});
});

describe('complete', () => {
	it('offers tags for a token opening with a colon', () => {
		expect(values(':b')).toEqual([':bug', ':debug']);
	});

	it('accepts the deprecated dot without offering it back', () => {
		expect(values('.b')).toEqual([':bug', ':debug']);
	});

	it('leaves keywords out once a sigil says a tag is wanted', () => {
		expect(values(':t')).toEqual([':tql']);
	});

	it('offers keywords for a bare word', () => {
		expect(values('n')).toEqual(['not', 'ne']);
	});

	it('offers both when a bare word could be either', () => {
		expect(values('t')).toEqual([':tql', 'tagged']);
	});

	it('puts a prefix match before a mere substring', () => {
		// `debug` contains `bug`, but `bug` is what is being spelled out.
		expect(values('bu')).toEqual([':bug', ':debug']);
	});

	it('breaks a tie on how many tasks carry the tag', () => {
		const items = complete(':', 1, TAGS)!.items.map((item) => item.value);
		expect(items.slice(0, 2)).toEqual([':release', ':bug']);
	});

	it('carries the description and the count through', () => {
		expect(complete(':rel', 4, TAGS)!.items[0]).toEqual({
			value: ':release',
			detail: 'planned for the next release',
			count: 21,
			kind: 'tag'
		});
	});

	it('has nothing to say after a bare ~', () => {
		expect(complete('~b', 2, TAGS)).toBeNull();
	});

	// Each of these ends on a prefix that matches a tag, so the test fails if
	// completion is offered inside a phrase.
	it.each([
		['~"bu', 5],
		['~"windows bu', 12],
		['~"windows support bu', 20],
		[':tql and ~"windows bu', 21],
		['~"de', 4]
	])('offers nothing inside a phrase, at %o', (text, cursor) => {
		expect(complete(text, cursor, TAGS)).toBeNull();
	});

	it('offers again once the phrase is closed', () => {
		expect(values('~"windows" and :b', 17)).toEqual([':bug', ':debug']);
	});

	it('offers again after a closed phrase and a keyword', () => {
		expect(values('~"a" or t', 9)).toEqual([':tql', 'tagged']);
	});

	it('has nothing to say off a token', () => {
		expect(complete('not ', 4, TAGS)).toBeNull();
		expect(complete('', 0, TAGS)).toBeNull();
	});

	it('has nothing to say when the only offer is already typed', () => {
		expect(complete(':scope', 6, TAGS)).toBeNull();
	});

	it('has nothing to say when nothing matches', () => {
		expect(complete(':zzz', 4, TAGS)).toBeNull();
	});

	it('completes the token the caret is in, not the line', () => {
		const found = complete(':bug and :sc', 12, TAGS)!;
		expect(found).toMatchObject({ start: 9, end: 12 });
		expect(found.items.map((item) => item.value)).toEqual([':scope']);
	});

	it('offers a tag with no description in tasks/tags', () => {
		expect(complete(':de', 3, TAGS)!.items[0]).toEqual({
			value: ':debug',
			detail: '',
			count: 1,
			kind: 'tag'
		});
	});
});

describe('apply', () => {
	it('replaces the token and follows with a space', () => {
		expect(apply(':bu', { start: 0, end: 3 }, ':bug')).toEqual({ text: ':bug ', cursor: 5 });
	});

	it('replaces a token in the middle of a query', () => {
		expect(apply('not :bu and :tql', { start: 4, end: 7 }, ':bug')).toEqual({
			text: 'not :bug and :tql',
			cursor: 8
		});
	});

	it('adds no second space where one already follows', () => {
		expect(apply(':bu and', { start: 0, end: 3 }, ':bug')).toEqual({
			text: ':bug and',
			cursor: 4
		});
	});

	it('keeps the rest of the token it replaces', () => {
		expect(apply(':bugg', { start: 0, end: 5 }, ':bug')).toEqual({ text: ':bug ', cursor: 5 });
	});
});
