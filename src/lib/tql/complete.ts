/**
 * Computes completions for the query box.
 *
 * The vocabulary is closed (a dozen keywords plus the repository's tags), so
 * completion is how a reader discovers it; nothing else on screen lists the
 * tags with their meaning. It lives apart from the menu component because what
 * to offer is a pure function of the text, the caret and the tags.
 */

/** A tag a repository defines, with what `tasks/tags` says about it. */
export interface TagOption {
	name: string;
	description?: string;
	/** How many of the tasks in view carry it. */
	count: number;
}

export interface Completion {
	/** The text that replaces the token. */
	value: string;
	/** Tag description, or a one-line reminder of what a keyword does. */
	detail: string;
	/** Set for tags only. */
	count?: number;
	kind: 'tag' | 'keyword';
}

export interface Completions {
	/** The span of the source the chosen value replaces. */
	start: number;
	end: number;
	items: Completion[];
}

/**
 * The keywords `tatr ls` accepts, each with a gloss. `.tag` is left out: the
 * parser still accepts it with a warning, and offering it would teach a
 * spelling upstream is retiring.
 */
const KEYWORDS: readonly { value: string; detail: string }[] = [
	{ value: 'and', detail: 'both sides must hold' },
	{ value: 'or', detail: 'either side may hold' },
	{ value: 'not', detail: 'inverts what follows' },
	{ value: 'any', detail: 'every task' },
	{ value: 'tagged', detail: 'carries at least one tag' },
	{ value: 'priority', detail: 'compare against a number' },
	{ value: 'eq', detail: 'equal to' },
	{ value: 'ne', detail: 'not equal to' },
	{ value: 'lt', detail: 'less than' },
	{ value: 'le', detail: 'less than or equal to' },
	{ value: 'gt', detail: 'greater than' },
	{ value: 'ge', detail: 'greater than or equal to' }
];

/** Characters a token can hold: sigils and punctuation, then the name itself. */
const TOKEN = /[A-Za-z0-9_:.~"-]/;

/**
 * Whether the caret sits inside a `~"..."` phrase. An unclosed quote before the
 * caret means it does, because quotes only open a search. This works several
 * words deep, where the token alone cannot tell.
 */
function insideSearch(text: string, cursor: number): boolean {
	let quotes = 0;
	for (let i = 0; i < cursor && i < text.length; i++) {
		if (text[i] === '"') quotes += 1;
	}
	return quotes % 2 === 1;
}

/** The token the caret sits in or just after, as a half-open range. */
export function tokenAt(text: string, cursor: number): { start: number; end: number } {
	let start = Math.min(cursor, text.length);
	while (start > 0 && TOKEN.test(text[start - 1])) start -= 1;

	let end = Math.min(cursor, text.length);
	while (end < text.length && TOKEN.test(text[end])) end += 1;

	return { start, end };
}

/**
 * Lists what to offer for the token under the caret, or returns `null` when the
 * caret is not on one.
 *
 * A token opening with `:` or `.` can only become a tag, so keywords are left
 * out rather than ranked below. Nothing is offered inside a `~` search, where a
 * tag or keyword would break the phrase; `insideSearch` reads the text before
 * the caret, because `tokenAt` stops at the spaces a phrase holds.
 */
export function complete(
	text: string,
	cursor: number,
	tags: readonly TagOption[]
): Completions | null {
	const { start, end } = tokenAt(text, cursor);
	const token = text.slice(start, cursor);
	if (token.length === 0) return null;
	if (token[0] === '~' || insideSearch(text, cursor)) return null;

	const sigil = token[0] === ':' || token[0] === '.';
	let needle = token.toLowerCase();
	if (sigil) needle = needle.slice(1);

	const matching = tags
		.filter((tag) => tag.name.toLowerCase().includes(needle))
		.sort(
			(a, b) =>
				// Prefix matches come first, because they are what the reader is
				// spelling out.
				Number(b.name.toLowerCase().startsWith(needle)) -
					Number(a.name.toLowerCase().startsWith(needle)) ||
				b.count - a.count ||
				a.name.localeCompare(b.name)
		)
		.map((tag): Completion => ({
			value: `:${tag.name}`,
			detail: tag.description ?? '',
			count: tag.count,
			kind: 'tag'
		}));

	const offers = [...matching];
	if (!sigil) offers.push(...keywordsMatching(needle));
	const items = offers.slice(0, 8);
	if (items.length === 0) return null;
	// An offer identical to the typed token adds nothing.
	if (items.length === 1 && items[0].value === token) return null;
	return { start, end, items };
}

function keywordsMatching(needle: string): Completion[] {
	return KEYWORDS.filter((keyword) => keyword.value.startsWith(needle)).map(
		(keyword): Completion => ({ ...keyword, kind: 'keyword' })
	);
}

/** Returns the text and caret position after accepting a completion. */
export function apply(
	text: string,
	range: { start: number; end: number },
	value: string
): { text: string; cursor: number } {
	const after = text.slice(range.end);
	// A trailing space makes the next word a new token and closes the menu,
	// since the caret then sits on no token. It does not change the parse.
	const spaced = withTrailingSpace(value, after);
	return { text: text.slice(0, range.start) + spaced + after, cursor: range.start + spaced.length };
}

/** `value` followed by a space, unless the text `after` it already opens with one. */
function withTrailingSpace(value: string, after: string): string {
	if (after.startsWith(' ')) return value;
	return `${value} `;
}
