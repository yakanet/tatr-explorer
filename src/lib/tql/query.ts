/**
 * Parses and evaluates TQL, the Tatr Query Language that `tatr ls` accepts.
 *
 * It follows the grammar and diagnostics of `src/query.c`, plus `~`:
 *
 *     expr    ::= or
 *     or      ::= and *( 'or' and )
 *     and     ::= compare *( 'and' compare )
 *     compare ::= primary *( ('lt'|'le'|'gt'|'ge'|'eq'|'ne') primary )
 *     primary ::= ':' tag | '~' word | '~' '"' words '"' | '[' expr ']'
 *               | 'not' primary | 'any' | 'tagged' | 'priority' | number | huid
 *
 * Square brackets group instead of parentheses, and comparisons are words, so a
 * query survives a shell without quoting.
 *
 * A `huid` selects the task with exactly that id, so `20260830-000838` does not
 * find `20260830-000838-rexim`.
 *
 * `~` searches titles, which the C implementation cannot do. The divergence runs
 * one way: every query the CLI accepts behaves identically here, but a query
 * using `~` will not run there. A reader in a browser has no `grep` to reach
 * for, and a second search box beside the query would be two unrelated ways to
 * say one thing. It is `~` rather than a quoted string because the match is
 * loose (every word, any order, case ignored) and quotes promise a phrase
 * everywhere else; here quotes only group words.
 *
 * Evaluation is typed: `and`, `or` and `not` take booleans, comparisons take
 * integers, and the query must yield a boolean. A type error is reported at the
 * offending token rather than coerced.
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
	/** Read only by `~`, which the C implementation lacks. */
	readonly title: string;
}

/**
 * Whether a title satisfies a `~` term: every word appears, in any order and
 * case ignored, so `~"support windows"` finds "Windows support". Nothing else is
 * normalised, because titles are shown verbatim and a reader matches what they see.
 */
export function matchesTitle(title: string, search: string): boolean {
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;

	const haystack = title.toLowerCase();
	return words.every((word) => haystack.includes(word));
}

export class TqlError extends Error {
	readonly span: Span;
	/** Help printed above the diagnostic, for the errors where the CLI prints one. */
	readonly help?: string;

	constructor(message: string, span: Span, help?: string) {
		super(message);
		this.name = 'TqlError';
		this.span = span;
		if (help !== undefined) this.help = help;
	}
}

/**
 * The help `src/query.c` prints, verbatim, above an unexpected infix operator,
 * such as two primaries with no operator between them (`~support not ~mac`).
 */
const INFIX_HELP = `Supported infix operators:

    and  or                  - logical operators
    lt  le  gt  ge  eq  ne   - comparison operators`;

/**
 * The help `src/query.c` prints above a missing or unrecognised primary, with
 * `~` added, because a list of the vocabulary that omits a word would mislead.
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
 * Splits a query into tokens. Brackets are single-character tokens; any other
 * token runs until a bracket or whitespace, so a tag cannot contain either.
 * Inside quotes, everything up to the closing quote belongs to the token, so
 * `~"windows support"` stays one piece.
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
				// An unclosed quote runs to the end and is left for the parser to report,
				// because it is the normal state while typing.
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

/** Like {@link parse}, but also returns warnings for deprecated syntax. */
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
			// The caret goes where the missing text belongs, as the CLI places it after
			// `[` and `[:bug`; a caret under the `~` would say the `~` is wrong.
			const missing: Span = { start: token.span.end, end: token.span.end };
			if (rest.length === 0) {
				throw new TqlError('Search text is expected here.', missing, PRIMARY_HELP);
			}
			if (!rest.startsWith('"')) {
				return { kind: 'text', value: rest, span: token.span };
			}
			if (rest.length < 2 || !rest.endsWith('"')) {
				// Worded as the CLI reports the unclosed bracket in `[:bug`, with no help
				// block, since an unclosed quote is the same mistake.
				throw new TqlError('Expected `"`.', missing);
			}
			const phrase = rest.slice(1, -1);
			// Worded like the CLI's `empty tag` for `:`: lower case, no full stop.
			if (phrase.trim().length === 0) throw new TqlError('empty search', token.span);
			return { kind: 'text', value: phrase, span: token.span };
		}

		if (token.text === '[') {
			const inner = expression();
			const closing = next();
			if (!closing || closing.text !== ']') {
				throw new TqlError('Expected `]`.', closing?.span ?? eof());
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

		// Checks the shape alone, as `is_valid_huid` does: `tatr ls 20260231-000000`
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
				if (node.op === 'and') return { type: 'boolean', value: a && b };
				return { type: 'boolean', value: a || b };
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
 * A stand-in task that `compile` evaluates once, to check types before any real
 * task is matched.
 *
 * Type checks run during evaluation, so `priority` parses (an integer where a
 * boolean is required) and would otherwise throw from the matcher on the first
 * task. One witness reaches every branch, because `and` and `or` evaluate both
 * sides before testing either, as the C implementation does.
 */
const WITNESS: TqlTask = { id: '', tags: [], priority: 0, title: '' };

/**
 * Compiles a query into a matcher, parsing it once for all tasks. Throws
 * {@link TqlError} for a syntax or a type error alike, so the caller handles
 * both in one place, before matching.
 */
export function compile(source: string): (task: TqlTask) => boolean {
	const node = parse(source);
	const match = (task: TqlTask) => evaluate(node, task);
	match(WITNESS);
	return match;
}

/**
 * Renders an error as the CLI does: the source, a caret under the offending
 * token, then the message.
 *
 * It prints one caret, not an underline, because `report_compile_query_diagnostic`
 * prints `"%*s", cursor, "^"`. The CLI's `ERROR: ` prefix is left off, because
 * here the diagnostic has a panel of its own.
 */
export function formatDiagnostic(
	source: string,
	error: { message: string; span: Span; help?: string }
): string {
	const caret = `${' '.repeat(error.span.start)}^`;
	const body = `${source}\n${caret}\n${error.message}`;
	if (error.help) return `${error.help}\n\n${body}`;
	return body;
}
