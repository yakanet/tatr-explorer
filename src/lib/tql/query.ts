/**
 * TQL — the Tatr Query Language, as accepted by `tatr ls`.
 *
 * The grammar and the diagnostics of `src/query.c`, with one addition of
 * our own. The grammar:
 *
 *     expr    ::= or
 *     or      ::= and *( 'or' and )
 *     and     ::= compare *( 'and' compare )
 *     compare ::= primary *( ('lt'|'le'|'gt'|'ge'|'eq'|'ne') primary )
 *     primary ::= ':' tag | '~' word | '~' '"' words '"' | '[' expr ']'
 *               | 'not' primary | 'any' | 'tagged' | 'priority' | number | huid
 *
 * Square brackets group instead of parentheses, and comparisons are spelled as
 * words, so a query survives a shell without quoting.
 *
 * A `huid` is a task id, and selects the task whose id is exactly that: no
 * prefix matching, so `20260830-000838` does not find `20260830-000838-rexim`.
 *
 * `~` searches titles, and it is the one thing the C implementation has no
 * notion of. The divergence is deliberate and one-directional: every query the
 * CLI accepts still behaves identically here, but a query written with `~` will
 * not run there. A browser reader has no `grep` beside the tool, so the
 * alternative was a second input box next to this language — which read as two
 * unrelated ways to say one thing.
 *
 * `~` rather than a bare quoted string, because the match is loose — every word,
 * in any order, case ignored — and quotes promise a phrase everywhere else.
 * With `~` carrying that meaning, quotes are left doing the one honest job of
 * grouping words that contain spaces.
 *
 * Evaluation is typed: `and`, `or` and `not` take booleans, the comparison
 * operators take integers, and the whole query must yield a boolean. Type errors
 * are reported at the offending token rather than silently coerced.
 */

import { isValidHuid } from '../tatr/huid.ts';

/** A half-open range into the query source, used to point diagnostics at a token. */
export interface Span {
	start: number;
	end: number;
}

export type BinaryOp = 'and' | 'or' | 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne';

export type Node =
	| { kind: 'tag'; name: string; span: Span }
	| { kind: 'text'; value: string; span: Span }
	| { kind: 'any'; span: Span }
	| { kind: 'tagged'; span: Span }
	| { kind: 'priority'; span: Span }
	| { kind: 'integer'; value: number; span: Span }
	| { kind: 'id'; id: string; span: Span }
	| { kind: 'not'; operand: Node; span: Span }
	| { kind: 'binary'; op: BinaryOp; left: Node; right: Node; span: Span };

/** The task fields a query can see. */
export interface TqlTask {
	/** The folder name, compared whole by a `huid` term. */
	readonly id: string;
	readonly tags: readonly string[];
	readonly priority: number;
	/** Read by `~` only, and absent from the C implementation's own query task. */
	readonly title: string;
}

/**
 * Whether a title satisfies a `~` term.
 *
 * Every word has to appear, in any order and in any position, so
 * `~"support windows"` finds "Windows support" — typing the words in the wrong
 * order otherwise would not. Case is ignored; nothing else is normalised,
 * because titles are shown verbatim and a reader is matching what they see.
 */
export function matchesTitle(title: string, search: string): boolean {
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;

	const haystack = title.toLowerCase();
	return words.every((word) => haystack.includes(word));
}

export class TqlError extends Error {
	readonly span: Span;
	/** Printed above the diagnostic, where the CLI prints one. */
	readonly help?: string;

	constructor(message: string, span: Span, help?: string) {
		super(message);
		this.name = 'TqlError';
		this.span = span;
		if (help !== undefined) this.help = help;
	}
}

/**
 * What `src/query.c` prints above this particular diagnostic, verbatim.
 *
 * Two primaries with nothing between them is the mistake a reader makes first —
 * `~support not ~mac` instead of `~support and not ~mac` — and the answer to it
 * is the list of things that could have gone in the gap, not the name of the
 * token that could not.
 */
const INFIX_HELP = `Supported infix operators:

    and  or                  - logical operators
    lt  le  gt  ge  eq  ne   - comparison operators`;

/**
 * What `src/query.c` prints above the two diagnostics about a missing or
 * unrecognised primary, with `~` added to the list.
 *
 * Adding to it is the honest consequence of adding the primary: an aid that
 * enumerates the vocabulary and omits a word of it would be worse than none.
 */
const PRIMARY_HELP = `What are primary expressions:

    :<tag>         - checks if task has a tag
    ~<word>        - checks if the title holds a word
    ~"<words>"     - checks if the title holds all of them
    [ <expr> ]     - same as previous but for Bash users
    not <primary>  - negation of a primary expression
    any            - expression that always returns true
    tagged         - checks if a task is tagged
    priority       - priority of a task as an integer
    <number>       - signed integer
    <huid>         - valid id of a task`;

/** A parse that succeeded but used deprecated syntax. */
export interface TqlWarning {
	message: string;
	span: Span;
}

export interface ParseResult {
	node: Node;
	warnings: TqlWarning[];
}

const COMPARISONS: Record<string, BinaryOp> = {
	lt: 'lt',
	le: 'le',
	gt: 'gt',
	ge: 'ge',
	eq: 'eq',
	ne: 'ne'
};

interface Token {
	text: string;
	span: Span;
}

/**
 * Splits a query into tokens. Brackets are single-character tokens; everything
 * else runs until a bracket or whitespace, which is why tags may not contain
 * either — except inside quotes, where a run of anything up to the closing
 * quote belongs to the token, so `~"windows support"` stays one piece.
 */
export function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < source.length) {
		if (/\s/.test(source[i])) {
			i += 1;
			continue;
		}
		if (source[i] === '[' || source[i] === ']') {
			tokens.push({ text: source[i], span: { start: i, end: i + 1 } });
			i += 1;
			continue;
		}
		const start = i;
		while (i < source.length && !/[\s[\]]/.test(source[i])) {
			if (source[i] === '"') {
				i += 1;
				while (i < source.length && source[i] !== '"') i += 1;
				// Left unclosed at the end of the source, which the parser reports:
				// an unterminated quote is the normal state halfway through typing.
				if (i < source.length) i += 1;
				continue;
			}
			i += 1;
		}
		tokens.push({ text: source.slice(start, i), span: { start, end: i } });
	}

	return tokens;
}

/** Parses a query, returning its syntax tree. Throws {@link TqlError}. */
export function parse(source: string): Node {
	return parseWithWarnings(source).node;
}

/** Like {@link parse}, but also reports deprecated syntax rather than hiding it. */
export function parseWithWarnings(source: string): ParseResult {
	const tokens = tokenize(source);
	const warnings: TqlWarning[] = [];
	let pos = 0;

	const eof = (): Span => ({ start: source.length, end: source.length });
	const peek = (): Token | undefined => tokens[pos];
	const next = (): Token | undefined => tokens[pos++];

	function primary(): Node {
		const token = next();
		if (!token) throw new TqlError('Primary expression is expected here.', eof(), PRIMARY_HELP);

		// `.tag` predates `:tag` and is still accepted by the reference parser.
		if (token.text.startsWith(':') || token.text.startsWith('.')) {
			if (token.text.startsWith('.')) {
				warnings.push({
					message:
						'Using `.` to refer to tags is deprecated and will be removed in the future. Use `:` instead.',
					span: token.span
				});
			}
			if (token.text.length === 1) throw new TqlError('empty tag', token.span);
			return { kind: 'tag', name: token.text.slice(1), span: token.span };
		}

		if (token.text.startsWith('~')) {
			const rest = token.text.slice(1);
			// Where the missing piece belongs, not on the sigil asking for it. The
			// CLI puts the caret one past `[` and at the end of the line for
			// `[:bug`, both of which read as "type it here"; a caret under the `~`
			// reads as "the `~` is wrong", which it is not.
			const missing: Span = { start: token.span.end, end: token.span.end };
			if (rest.length === 0) {
				throw new TqlError('Search text is expected here.', missing, PRIMARY_HELP);
			}
			if (!rest.startsWith('"')) {
				return { kind: 'text', value: rest, span: token.span };
			}
			if (rest.length < 2 || !rest.endsWith('"')) {
				// An unclosed quote is an unclosed bracket: same mistake, so the same
				// words the CLI uses for `[:bug` — `Expected `]`.`, no help block,
				// because naming the character that is missing is the whole advice.
				throw new TqlError('Expected `"`.', missing);
			}
			const phrase = rest.slice(1, -1);
			// Lower case and unpunctuated, like the `empty tag` printed for `:`.
			if (phrase.trim().length === 0) throw new TqlError('empty search', token.span);
			return { kind: 'text', value: phrase, span: token.span };
		}

		if (token.text === '[') {
			const inner = expression();
			const closing = next();
			if (!closing || closing.text !== ']') {
				throw new TqlError('Expected `]`.', closing ? closing.span : eof());
			}
			return inner;
		}

		// `not` binds to a primary, so `not :a and :b` means `[not :a] and :b`.
		if (token.text === 'not') {
			const operand = primary();
			return { kind: 'not', operand, span: token.span };
		}

		if (token.text === 'any') return { kind: 'any', span: token.span };
		if (token.text === 'tagged') return { kind: 'tagged', span: token.span };
		if (token.text === 'priority') return { kind: 'priority', span: token.span };

		// The shape alone, as `is_valid_huid` reads it: `tatr ls 20260231-000000`
		// parses and finds nothing, so refusing it here would be a divergence.
		if (isValidHuid(token.text)) return { kind: 'id', id: token.text, span: token.span };

		if (/^-?\d+$/.test(token.text)) {
			return { kind: 'integer', value: Number.parseInt(token.text, 10), span: token.span };
		}

		throw new TqlError(
			`Unexpected start of a primary expression \`${token.text}\`.`,
			token.span,
			PRIMARY_HELP
		);
	}

	function comparison(): Node {
		let left = primary();
		for (;;) {
			const token = peek();
			const op = token && COMPARISONS[token.text];
			if (!op) return left;
			pos += 1;
			const right = primary();
			left = { kind: 'binary', op, left, right, span: token!.span };
		}
	}

	function conjunction(): Node {
		let left = comparison();
		while (peek()?.text === 'and') {
			const token = next()!;
			const right = comparison();
			left = { kind: 'binary', op: 'and', left, right, span: token.span };
		}
		return left;
	}

	function expression(): Node {
		let left = conjunction();
		while (peek()?.text === 'or') {
			const token = next()!;
			const right = conjunction();
			left = { kind: 'binary', op: 'or', left, right, span: token.span };
		}
		return left;
	}

	const node = expression();

	const trailing = peek();
	if (trailing) {
		throw new TqlError(`Unexpected infix operator \`${trailing.text}\``, trailing.span, INFIX_HELP);
	}

	return { node, warnings };
}

type Value = { type: 'boolean'; value: boolean } | { type: 'integer'; value: number };

function expect(value: Value, type: 'boolean' | 'integer', span: Span): Value {
	if (value.type !== type) {
		throw new TqlError(`Expected ${type} but got ${value.type}`, span);
	}
	return value;
}

function evaluateNode(node: Node, task: TqlTask): Value {
	switch (node.kind) {
		case 'any':
			return { type: 'boolean', value: true };
		case 'tagged':
			return { type: 'boolean', value: task.tags.length > 0 };
		case 'tag':
			return { type: 'boolean', value: task.tags.includes(node.name) };
		case 'text':
			return { type: 'boolean', value: matchesTitle(task.title, node.value) };
		case 'priority':
			return { type: 'integer', value: task.priority };
		case 'integer':
			return { type: 'integer', value: node.value };
		case 'id':
			return { type: 'boolean', value: task.id === node.id };
		case 'not': {
			const operand = expect(evaluateNode(node.operand, task), 'boolean', node.operand.span);
			return { type: 'boolean', value: !operand.value };
		}
		case 'binary': {
			const left = evaluateNode(node.left, task);
			const right = evaluateNode(node.right, task);

			if (node.op === 'and' || node.op === 'or') {
				const a = expect(left, 'boolean', node.left.span).value as boolean;
				const b = expect(right, 'boolean', node.right.span).value as boolean;
				return { type: 'boolean', value: node.op === 'and' ? a && b : a || b };
			}

			const a = expect(left, 'integer', node.left.span).value as number;
			const b = expect(right, 'integer', node.right.span).value as number;
			switch (node.op) {
				case 'lt':
					return { type: 'boolean', value: a < b };
				case 'le':
					return { type: 'boolean', value: a <= b };
				case 'gt':
					return { type: 'boolean', value: a > b };
				case 'ge':
					return { type: 'boolean', value: a >= b };
				case 'eq':
					return { type: 'boolean', value: a === b };
				case 'ne':
					return { type: 'boolean', value: a !== b };
			}
		}
	}
}

/** Evaluates a parsed query against one task. Throws {@link TqlError} on a type error. */
export function evaluate(node: Node, task: TqlTask): boolean {
	const result = evaluateNode(node, task);
	if (result.type !== 'boolean') {
		throw new TqlError(`Expected boolean but got ${result.type}`, node.span);
	}
	return result.value;
}

/**
 * Parses once and returns a predicate. Prefer this when filtering a list, so the
 * query is not re-parsed per task.
 */
/**
 * A stand-in task, so `compile` can settle the types before anything real is
 * matched.
 *
 * The language is typed but its checks run during evaluation, so `priority`
 * parses and compiles perfectly — an integer where a boolean is required — and
 * without this the error would surface from the matcher, one task in, wherever
 * that happens to be called from. It cost a page a 500 once already.
 *
 * One witness settles every branch, because `and` and `or` evaluate both sides
 * before testing either, exactly as the C implementation does. No branch can
 * hide behind a short circuit that never happens.
 */
const WITNESS: TqlTask = { id: '', tags: [], priority: 0, title: '' };

/**
 * Compiles a query into a matcher, throwing {@link TqlError} for a syntax *or* a
 * type error — the caller cannot tell the difference apart, and should not have
 * to remember that one of the two arrives later than the other.
 */
export function compile(source: string): (task: TqlTask) => boolean {
	const node = parse(source);
	const match = (task: TqlTask) => evaluate(node, task);
	match(WITNESS);
	return match;
}

/**
 * Renders an error the way the CLI does: the source, a caret under the offending
 * token, then the message.
 *
 * One caret, never a run of them under the whole token: `report_compile_query_
 * diagnostic` prints `"%*s", cursor, "^"`, so the width only positions it. An
 * underline would read better and is not what the reader sees in their terminal.
 *
 * The CLI's `ERROR: ` prefix is left off, being what separates a message from
 * ordinary output on a terminal. Here the diagnostic has a panel of its own.
 */
export function formatDiagnostic(
	source: string,
	error: { message: string; span: Span; help?: string }
): string {
	const caret = `${' '.repeat(error.span.start)}^`;
	const body = `${source}\n${caret}\n${error.message}`;
	return error.help ? `${error.help}\n\n${body}` : body;
}
