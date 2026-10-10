/**
 * Completion for the query box.
 *
 * A query is short and its vocabulary is closed (a dozen keywords plus whatever
 * tags the repository happens to define), so completion here is not a
 * convenience, it is how a reader discovers that vocabulary at all. Tag names
 * especially: nothing else on screen lists them with what they mean.
 *
 * Kept apart from the component that draws the menu, because deciding *what* to
 * offer is a pure function of the text, the caret and the repository, and is
 * worth asserting rather than eyeballing.
 */

/** A tag a repository defines, with what `tasks/tags` says about it. */
export interface TagOption {
	name: string;
	description?: string;
	/** Tasks carrying it, among those the reader is currently looking at. */
	count: number;
}

export interface Completion {
	/** The text that replaces the token. */
	value: string;
	/** Tag description, or a one-line reminder of what a keyword does. */
	detail: string;
	/** Only tags carry one. */
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
 * The keywords `tatr ls` accepts, glossed.
 *
 * `.tag` is deliberately absent: the parser still takes it for backward
 * compatibility and warns, so offering it would teach the spelling upstream is
 * trying to retire.
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
 * Whether the caret sits inside a `~"..."` phrase.
 *
 * An unclosed quote before the caret is the whole test: quotes only ever open a
 * search, and one that has not been closed means the caret is still in it. This
 * also covers a caret several words deep, which is exactly where reading the
 * token alone fails.
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
 * What to offer for the token under the caret, or `null` when the caret is not
 * on one.
 *
 * A token opening with `:` or `.` can only become a tag, so keywords are left
 * out entirely rather than ranked below: the reader has already said which
 * half of the vocabulary they want.
 *
 * Inside a `~` search nothing is offered, since neither a tag nor a keyword can
 * appear there: a menu suggesting `:bug` into the middle of a phrase offers to
 * break the query. Detecting that cannot be done from the token alone: a phrase
 * holds spaces, `tokenAt` stops at them, and by the second word the `~"` is out
 * of view. The text before the caret is what knows.
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
	const needle = (sigil ? token.slice(1) : token).toLowerCase();

	const matching = tags
		.filter((tag) => tag.name.toLowerCase().includes(needle))
		.sort(
			(a, b) =>
				// A prefix match is what the reader is spelling out; the rest are
				// merely related, so they follow.
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

	const keywords = sigil
		? []
		: KEYWORDS.filter((keyword) => keyword.value.startsWith(needle)).map((keyword): Completion => ({
				...keyword,
				kind: 'keyword'
			}));

	const items = [...matching, ...keywords].slice(0, 8);
	// An offer identical to what is already typed teaches nothing.
	if (items.length === 1 && items[0].value === token) return null;

	return items.length > 0 ? { start, end, items } : null;
}

/** The text and caret position after accepting a completion. */
export function apply(
	text: string,
	range: { start: number; end: number },
	value: string
): { text: string; cursor: number } {
	const after = text.slice(range.end);
	// A trailing space, so the next word starts a new token rather than extending
	// this one, which is also what closes the menu, since the caret then sits on
	// no token at all. A query ending in a space parses the same.
	const spaced = after.startsWith(' ') ? value : `${value} `;
	return { text: text.slice(0, range.start) + spaced + after, cursor: range.start + spaced.length };
}
