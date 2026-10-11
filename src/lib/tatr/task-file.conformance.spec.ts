import { describe, expect, it } from 'vitest';
import corpusRaw from '#tests/fixtures/corpus-raw.json' with { type: 'json' };
import corpusUntag from '#tests/fixtures/corpus-untag.json' with { type: 'json' };
import tatrRaw from '#tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import tatrNew from '#tests/fixtures/tatr-new.json' with { type: 'json' };
import tatrUntag from '#tests/fixtures/tatr-untag.json' with { type: 'json' };
import { editTaskMd, loadTaskFile, renderTaskMd, withoutTag } from './task-file.ts';
import { NEW_TASK, newTaskMd } from './task-fields.ts';

/**
 * Compares the rewriting of a task file with `tatr untag`, over tsoding/tatr and
 * over our corpus of edge cases. `scripts/fixtures.mjs` records the file the CLI
 * wrote once each tag of each task was removed, alone.
 */
interface UntagCase {
	id: string;
	tag: string;
	text: string;
}

const REPOSITORIES = [
	{ name: 'tsoding/tatr', raw: tatrRaw, cases: tatrUntag },
	{ name: 'our corpus', raw: corpusRaw, cases: corpusUntag }
] as { name: string; raw: Record<string, string>; cases: UntagCase[] }[];

describe.each(REPOSITORIES)('rewriting as `tatr untag` does, over $name', ({ raw, cases }) => {
	it.each(cases)('writes $id without :$tag as the CLI does', ({ id, tag, text }) => {
		expect(editTaskMd(raw[id], withoutTag(tag))).toBe(text);
	});

	it.each(cases)('gives back the file the CLI wrote for $id, byte for byte', ({ text }) => {
		expect(renderTaskMd(loadTaskFile(text)!)).toBe(text);
	});
});

/**
 * Compares the file of a new task with `tatr new`, which `scripts/fixtures.mjs`
 * ran with each case's title, priority and tags. A case without a priority
 * pins the CLI's default.
 */
interface NewCase {
	title: string;
	priority?: number;
	tags: string[];
	text: string;
}

describe('creating as `tatr new` does', () => {
	it.each(tatrNew as NewCase[])(
		'writes $title as the CLI does',
		({ title, priority, tags, text }) => {
			const fields = { ...NEW_TASK, title, tags, priority: priority ?? NEW_TASK.priority };
			expect(newTaskMd(fields)).toBe(text);
		}
	);
});
