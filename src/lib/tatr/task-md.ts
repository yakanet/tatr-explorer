/**
 * Parser for `TASK.md`, written from the behaviour of `src/md.c`
 * and `src/task.c` rather than from the README, which simplifies in ways that
 * matter.
 *
 * The shape is a title line, a block of `- KEY: value` properties, then free
 * markdown:
 *
 *     # <title>
 *
 *     - STATUS: (OPEN|CLOSED)
 *     - PRIORITY: <number>
 *     - TAGS: <comma-and-whitespace-separated>
 *
 *     [description]
 */

/** What the reference parser puts in the title when the file does not start with `#`. */
export const INVALID_TITLE = '!!! INVALID: TASK TITLE MUST START WITH # !!!';

/**
 * Priority when the property is absent. Deliberately huge upstream ("unset
 * priority is high so you don't forget to set it"), so an unset task sorts to
 * the top rather than disappearing into the middle.
 */
export const UNSET_PRIORITY = 999999;

export interface ParsedTaskMd {
	title: string;
	/** Every property in the block, not just the three documented ones. */
	properties: Map<string, string>;
	/** Everything after the property block, verbatim. */
	description: string;
	/**
	 * True when the title line was missing its `#`. The reference parser then
	 * abandons property parsing entirely, so properties will be empty.
	 */
	malformed: boolean;
}

const isSpace = (c: string) => /\s/.test(c);
const isSpaceExceptNewline = (c: string) => isSpace(c) && c !== '\n' && c !== '\r';
const isAlnum = (c: string) => /[A-Za-z0-9]/.test(c);

export function parseTaskMd(source: string): ParsedTaskMd {
	let i = 0;
	const skip = (pred: (c: string) => boolean) => {
		while (i < source.length && pred(source[i])) i += 1;
	};

	skip(isSpace);
	if (source[i] !== '#') {
		return { title: INVALID_TITLE, properties: new Map(), description: '', malformed: true };
	}

	// Only one `#` is consumed, so `## Foo` yields the title `# Foo`.
	i += 1;
	skip(isSpaceExceptNewline);
	const titleStart = i;
	while (i < source.length && source[i] !== '\n') i += 1;
	const title = source.slice(titleStart, i);

	const properties = new Map<string, string>();
	skip(isSpace);

	for (;;) {
		const saved = i;
		skip(isSpaceExceptNewline);

		if (source[i] !== '-') {
			i = saved;
			break;
		}
		i += 1;
		skip(isSpaceExceptNewline);

		const keyStart = i;
		while (i < source.length && isAlnum(source[i])) i += 1;
		const key = source.slice(keyStart, i);
		skip(isSpaceExceptNewline);

		if (key.length === 0 || source[i] !== ':') {
			i = saved;
			break;
		}
		i += 1;

		const valueStart = i;
		while (i < source.length && source[i] !== '\n') i += 1;
		// A later definition of the same key wins, as the hash table overwrites.
		properties.set(key, source.slice(valueStart, i).trim());

		if (source[i] === '\n') i += 1;
	}

	return { title, properties, description: source.slice(i), malformed: false };
}

/** Splits a `TAGS` value. Commas and whitespace both separate, interchangeably. */
export function parseTags(value: string): string[] {
	return value.split(/[\s,]+/).filter((tag) => tag.length > 0);
}

/**
 * Reads the priority. Absent means {@link UNSET_PRIORITY}; anything unparsable
 * is 0, matching `atoi`, which stops at the first non-digit.
 */
export function readPriority(properties: Map<string, string>): number {
	const raw = properties.get('PRIORITY');
	if (raw === undefined) return UNSET_PRIORITY;
	const value = Number.parseInt(raw, 10);
	return Number.isNaN(value) ? 0 : value;
}

/**
 * A task is closed only when its status is exactly `CLOSED`. Every other value
 * (including a misspelt or missing one) counts as open, deliberately, so a task
 * is never hidden by its own error.
 */
export function isClosed(properties: Map<string, string>): boolean {
	return properties.get('STATUS') === 'CLOSED';
}

export function readTags(properties: Map<string, string>): string[] {
	return parseTags(properties.get('TAGS') ?? '');
}
