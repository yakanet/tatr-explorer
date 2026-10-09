import { describe, expect, it } from 'vitest';
import {
	INVALID_TITLE,
	UNSET_PRIORITY,
	isClosed,
	parseTags,
	parseTaskMd,
	readPriority,
	readTags
} from './task-md.ts';

const WELL_FORMED = `# Support more statuses

- STATUS: OPEN
- PRIORITY: 100
- TAGS: bug, tql

Cephon wanted to kanban this whole thing.

---

For now I just implemented it so when the status is not "CLOSED".
`;

describe('title', () => {
	it('reads the first heading', () => {
		expect(parseTaskMd(WELL_FORMED).title).toBe('Support more statuses');
	});

	it('skips blank lines before the heading', () => {
		expect(parseTaskMd('\n\n  # Late title\n').title).toBe('Late title');
	});

	it('consumes only one hash, so `##` leaks into the title', () => {
		// Faithful to md.c: md_expect_char takes a single '#'.
		expect(parseTaskMd('## Two hashes\n').title).toBe('# Two hashes');
	});

	it('abandons the whole file when the heading is missing', () => {
		const parsed = parseTaskMd('STATUS: OPEN\n- PRIORITY: 10\n');
		expect(parsed.malformed).toBe(true);
		expect(parsed.title).toBe(INVALID_TITLE);
		expect(parsed.properties.size).toBe(0);
	});
});

describe('properties', () => {
	it('reads the documented three', () => {
		const { properties } = parseTaskMd(WELL_FORMED);
		expect(properties.get('STATUS')).toBe('OPEN');
		expect(properties.get('PRIORITY')).toBe('100');
		expect(properties.get('TAGS')).toBe('bug, tql');
	});

	it('accepts arbitrary keys, since they land in a hash table', () => {
		const { properties } = parseTaskMd('# T\n\n- ASSIGNEE: rexim\n- DUE: 2026-10-01\n');
		expect(properties.get('ASSIGNEE')).toBe('rexim');
		expect(properties.get('DUE')).toBe('2026-10-01');
	});

	it('stops at the first line that is not a property', () => {
		const { properties, description } = parseTaskMd('# T\n\n- A: 1\n\nprose\n\n- B: 2\n');
		expect([...properties.keys()]).toEqual(['A']);
		expect(description).toContain('- B: 2');
	});

	it('keeps the last definition when a key repeats', () => {
		expect(parseTaskMd('# T\n\n- STATUS: OPEN\n- STATUS: CLOSED\n').properties.get('STATUS')).toBe(
			'CLOSED'
		);
	});

	it('rejects a key that is not alphanumeric', () => {
		// `MY_KEY` stops at the underscore, so the colon check fails and the block ends.
		expect(parseTaskMd('# T\n\n- MY_KEY: x\n').properties.size).toBe(0);
	});

	it('tolerates indentation and spacing around the colon', () => {
		expect(parseTaskMd('# T\n\n  -   STATUS  :   CLOSED  \n').properties.get('STATUS')).toBe(
			'CLOSED'
		);
	});

	it('keeps an empty value empty', () => {
		// The trap: a greedy whitespace match here swallows the newline and
		// captures the first line of the description as the value.
		const { properties, description } = parseTaskMd('# T\n\n- TAGS:\n\nBasically analyze it.\n');
		expect(properties.get('TAGS')).toBe('');
		expect(description.trim()).toBe('Basically analyze it.');
	});
});

describe('description', () => {
	it('keeps everything after the property block, separators included', () => {
		const { description } = parseTaskMd(WELL_FORMED);
		expect(description).toContain('Cephon wanted');
		expect(description).toContain('---');
	});

	it('is empty when there is nothing after the properties', () => {
		expect(parseTaskMd('# T\n\n- STATUS: OPEN\n').description).toBe('');
	});
});

describe('tags', () => {
	it.each([
		['foo,bar,baz', ['foo', 'bar', 'baz']],
		['foo, hello  world', ['foo', 'hello', 'world']],
		['  , , spaced ,, out , ', ['spaced', 'out']],
		['', []],
		['one', ['one']]
	])('splits %o on commas and whitespace alike', (value, expected) => {
		expect(parseTags(value)).toEqual(expected);
	});

	it('is empty when the property is absent', () => {
		expect(readTags(new Map())).toEqual([]);
	});
});

describe('priority', () => {
	it('is deliberately huge when unset, so the task is not forgotten', () => {
		expect(readPriority(new Map())).toBe(UNSET_PRIORITY);
	});

	it('reads a plain number', () => {
		expect(readPriority(new Map([['PRIORITY', '110']]))).toBe(110);
	});

	it('reads a negative number', () => {
		expect(readPriority(new Map([['PRIORITY', '-5']]))).toBe(-5);
	});

	it('stops at the first non-digit, like atoi', () => {
		expect(readPriority(new Map([['PRIORITY', '12abc']]))).toBe(12);
	});

	it('is zero when unparsable, like atoi', () => {
		expect(readPriority(new Map([['PRIORITY', 'high']]))).toBe(0);
	});
});

describe('status', () => {
	it('is closed only when exactly CLOSED', () => {
		expect(isClosed(new Map([['STATUS', 'CLOSED']]))).toBe(true);
	});

	it.each(['OPEN', 'closed', 'IN PROGRESS', '', 'CLOSED '])(
		'treats %o as open, so no task hides behind its own typo',
		(value) => {
			expect(isClosed(new Map([['STATUS', value]]))).toBe(false);
		}
	);

	it('treats a missing status as open', () => {
		expect(isClosed(new Map())).toBe(false);
	});
});

describe('references', () => {
	it('finds task ids mentioned in the body', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('As we discovered in 20260826-152351 this matters.')).toEqual([
			'20260826-152351'
		]);
	});

	it('finds ids wrapped as TASK(...)', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('See TASK(20260825-170729) for context.')).toEqual([
			'20260825-170729'
		]);
	});

	it('deduplicates and sorts', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('20260830-000001 then 20260101-000002 then 20260830-000001')).toEqual([
			'20260101-000002',
			'20260830-000001'
		]);
	});

	it('keeps a team suffix', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('see 20260830-000838-rexim')).toEqual(['20260830-000838-rexim']);
	});

	it('drops the task referring to itself', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('this is 20260826-152351 itself', '20260826-152351')).toEqual([]);
	});

	it('finds nothing in prose without ids', async () => {
		const { extractReferences } = await import('./task.ts');
		expect(extractReferences('no ids here, just 2026 and 08-26')).toEqual([]);
	});

	it('reads the whole file, as `tatr graph` does, title and properties included', async () => {
		// Upstream's 20260912-102943 cites its parent in the title and nowhere
		// else, and the CLI draws that arrow.
		const { readTask } = await import('./task.ts');
		const source = [
			'# Test task with custom properties for 20260828-211200',
			'',
			'- STATUS: CLOSED',
			'- FOO: 20260101-000001',
			'',
			'No description.'
		].join('\n');
		expect(readTask('20260912-102943', source)!.references).toEqual([
			'20260101-000001',
			'20260828-211200'
		]);
	});
});
