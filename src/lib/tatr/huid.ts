/**
 * Parses and scans HUIDs (Human-Unique IDentifiers), the names of task folders.
 *
 * A HUID is `YYYYMMDD-HHMMSS` in UTC, optionally followed by `-` and a suffix of
 * letters, digits and dashes that teams add to keep ids unique across parallel
 * branches. The behaviour follows `src/huid.c`.
 *
 * A task's creation date comes from its id when the digits form a real instant.
 * The CLI never reads the digits back as a date, so `20260231-000000` is a valid
 * id here too, with no date.
 */

const HUID = /^(\d{8})-(\d{6})(?:-([A-Za-z0-9-]*))?$/;

export interface Huid {
	/** The full id, as it appears on disk. */
	id: string;
	/** Creation instant, read as UTC; `null` when the digits form no real instant. */
	created: Date | null;
	/** The optional team suffix, without its leading dash. */
	suffix?: string;
}

/**
 * Whether a text is a task id, decided by its shape alone as `is_valid_huid` in
 * `src/huid.c` does. The digits are never read as a date.
 */
export function isValidHuid(id: string): boolean {
	return HUID.test(id);
}

/** Reads an id's digits as a UTC instant, or returns `null` when they form no real one. */
function creationInstant(date: string, time: string): Date | null {
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(4, 6));
	const day = Number(date.slice(6, 8));
	const hour = Number(time.slice(0, 2));
	const minute = Number(time.slice(2, 4));
	const second = Number(time.slice(4, 6));

	const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
	// Date.UTC rolls invalid components over, so round-trip to tell them apart.
	if (formatHuid(instant) !== `${date}-${time}`) return null;
	return instant;
}

/**
 * Parses a task id, or returns `null` when the name is not a HUID. An id whose
 * digits form no real instant, such as `20260231-000000`, has a null `created`.
 */
export function parseHuid(id: string): Huid | null {
	const match = HUID.exec(id);
	if (!match) return null;

	const [, date, time, suffix] = match;
	const huid: Huid = { id, created: creationInstant(date, time) };
	if (suffix) huid.suffix = suffix;
	return huid;
}

/**
 * Matches an id at the position a scan of prose is looking at.
 *
 * The pattern is sticky rather than searching, because the scan advances one
 * character at a time and a searching pattern would report a later position.
 * Two rules decide where an id ends:
 *
 * - **No word boundary.** `abc20260101-000001` and `TASK(20260101-000001)` both
 *   hold an id, because the format's own files wrap ids in punctuation.
 * - **The end of the text ends an id.** A time cut short by it is accepted
 *   (`20260101-0000`, even `20260101-`), while the same before a space is not.
 *   This is harmless: looking up such an id finds no task.
 *
 * A suffix is greedy, so it ends at the first character that is not a letter,
 * a digit or a dash.
 */
const AT_CURSOR = /\d{8}-(?:\d{6}(?:-[A-Za-z0-9-]*)?|\d{0,5}$)/y;

/**
 * Reads an id at `start`, returning the index just past it, or `-1`. It sets
 * `AT_CURSOR.lastIndex` on every call, so the shared pattern keeps no state.
 */
function chopHuid(text: string, start: number): number {
	AT_CURSOR.lastIndex = start;
	if (!AT_CURSOR.test(text)) return -1;
	return AT_CURSOR.lastIndex;
}

/** Where an id sits in the text it was read from: `[start, end)`. */
export interface HuidSpan {
	id: string;
	start: number;
	end: number;
}

/**
 * Lists every HUID in a text, in order and with repeats, scanning as the
 * reference implementation scans a `TASK.md`: read an id at the cursor, or
 * advance one character.
 *
 * Positions come out with the ids so a renderer can cut the text into links
 * without a second scan, which would be a second definition of an id.
 */
export function scanHuidSpans(text: string): HuidSpan[] {
	const found: HuidSpan[] = [];
	let i = 0;
	while (i < text.length) {
		const end = chopHuid(text, i);
		if (end === -1) {
			i += 1;
		} else {
			found.push({ id: text.slice(i, end), start: i, end });
			i = end;
		}
	}
	return found;
}

/** Lists the ids `scanHuidSpans` finds, without their positions. */
export function scanHuids(text: string): string[] {
	return scanHuidSpans(text).map((span) => span.id);
}

/** Formats an instant as a HUID, the way `tatr new` does. */
export function formatHuid(date: Date, suffix?: string): string {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	const stamp =
		`${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
	if (suffix) return `${stamp}-${suffix}`;
	return stamp;
}
