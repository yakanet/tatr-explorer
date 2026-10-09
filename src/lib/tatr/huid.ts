/**
 * HUID — Human-Unique IDentifier, the name of a task folder.
 *
 * The format is `YYYYMMDD-HHMMSS` in UTC, optionally followed by `-` and a
 * suffix of alphanumerics and dashes, which teams use to keep ids unique when
 * they generate them in parallel branches.
 *
 * Because the id *is* a timestamp, a task has a creation date without a single
 * extra request — when its digits form a real instant. The CLI writes them from
 * the clock but never reads them back, so `20260231-000000` is a task to it like
 * any other, and is one here too, without a date. The format is the one
 * `src/huid.c` defines; what is written here follows its behaviour, which the
 * spec pins case by case.
 */

const HUID = /^(\d{8})-(\d{6})(?:-([A-Za-z0-9-]*))?$/;

export interface Huid {
	/** The full id, as it appears on disk. */
	id: string;
	/** Creation instant, read as UTC; `null` when the digits are no real one. */
	created: Date | null;
	/** The optional team suffix, without its leading dash. */
	suffix?: string;
}

/**
 * Whether a text is a task id, as `is_valid_huid` in `src/huid.c` decides it:
 * by its shape alone, the digits never read as a date.
 */
export function isValidHuid(id: string): boolean {
	return HUID.test(id);
}

/**
 * Parses a task id. Returns `null` when the name is not a HUID; one whose
 * digits form no real instant (`20260231-000000`, say) has no `created`.
 */
export function parseHuid(id: string): Huid | null {
	const match = HUID.exec(id);
	if (!match) return null;

	const [, date, time, suffix] = match;
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(4, 6));
	const day = Number(date.slice(6, 8));
	const hour = Number(time.slice(0, 2));
	const minute = Number(time.slice(2, 4));
	const second = Number(time.slice(4, 6));

	const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
	// Date.UTC rolls invalid components over, so round-trip to tell them apart.
	const created = formatHuid(instant) === `${date}-${time}` ? instant : null;

	return suffix ? { id, created, suffix } : { id, created };
}

/**
 * An id as a scan of prose accepts it, anchored where the scan is looking.
 *
 * Sticky rather than searching, because the caller decides where to look: the
 * scan below advances one character at a time, and a pattern that searched
 * would skip ahead and report a position the caller did not ask about.
 *
 * The shape reads off the format, with two things worth naming because they
 * decide where an id ends:
 *
 * - **No word boundary.** `abc20260101-000001` holds an id, and so does
 *   `TASK(20260101-000001)`. The format's own files wrap ids in punctuation, so
 *   a boundary would lose them.
 * - **The end of the text ends an id.** A time cut short by it is accepted —
 *   `20260101-0000`, and even `20260101-` — while the same thing before a space
 *   is not. Which is harmless, every caller looking the task up and finding
 *   nothing, and is pinned by the spec because it decides where a scan stops.
 *
 * A suffix is greedy over what it may hold, so it ends at the first character
 * that is neither a letter, a digit nor a dash.
 */
const AT_CURSOR = /\d{8}-(?:\d{6}(?:-[A-Za-z0-9-]*)?|\d{0,5}$)/y;

/**
 * Reads an id at `start`, returning the index just past it, or `-1`.
 *
 * The one pattern above carries a cursor, which is assigned here on every call
 * — so it keeps nothing between them, and two scans are never in flight.
 */
function chopHuid(text: string, start: number): number {
	AT_CURSOR.lastIndex = start;
	return AT_CURSOR.test(text) ? AT_CURSOR.lastIndex : -1;
}

/** Where an id sits in the text it was read from: `[start, end)`. */
export interface HuidSpan {
	id: string;
	start: number;
	end: number;
}

/**
 * Every HUID appearing in a text, in order and with repeats, the way the
 * reference implementation scans a `TASK.md`: try to read an id at the cursor,
 * and advance by a single character when that fails.
 *
 * The positions come out with the ids because a renderer that turns an id into
 * a link has to know where to cut, and a second scan written for that would be
 * a second notion of what an id looks like.
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

/** The same scan, for the callers that only care which ids are cited. */
export function scanHuids(text: string): string[] {
	return scanHuidSpans(text).map((span) => span.id);
}

/** Formats an instant as a HUID, the way `tatr new` does. */
export function formatHuid(date: Date, suffix?: string): string {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	const stamp =
		`${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
	return suffix ? `${stamp}-${suffix}` : stamp;
}
