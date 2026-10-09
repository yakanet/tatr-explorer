import { describe, expect, it } from 'vitest';
import {
	TqlError,
	compile,
	evaluate,
	formatDiagnostic,
	parse,
	parseWithWarnings,
	tokenize,
	matchesTitle,
	type TqlTask
} from './query.ts';

const task = (tags: string[], priority = 100, title = 'A task'): TqlTask => ({
	id: '20260101-000000',
	tags,
	priority,
	title
});

const bug = task(['bug'], 100);
const bugUi = task(['bug', 'ui'], 30);
const untagged = task([], 100);

/** Evaluates a source query against one task, the way a filter would. */
const run = (source: string, t: TqlTask) => evaluate(parse(source), t);

describe('tokenize', () => {
	it('treats brackets as their own tokens', () => {
		expect(tokenize('[:a or :b]').map((t) => t.text)).toEqual(['[', ':a', 'or', ':b', ']']);
	});

	it('does not require whitespace around brackets', () => {
		expect(tokenize('not[:a]').map((t) => t.text)).toEqual(['not', '[', ':a', ']']);
	});

	it('reports positions so diagnostics can point at a token', () => {
		expect(tokenize('  :bug')[0].span).toEqual({ start: 2, end: 6 });
	});

	it('returns nothing for blank input', () => {
		expect(tokenize('   ')).toEqual([]);
	});
});

describe('the README examples', () => {
	it.each([
		[':bug', bug, true],
		[':bug', untagged, false],
		[':bug and not :ui', bug, true],
		[':bug and not :ui', bugUi, false],
		['not tagged', untagged, true],
		['not tagged', bug, false],
		[':bug and priority lt 50', bugUi, true],
		[':bug and priority lt 50', bug, false]
	])('%o matches as documented', (source, t, expected) => {
		expect(run(source as string, t as TqlTask)).toBe(expected);
	});
});

describe('primaries', () => {
	it('any is always true', () => {
		expect(run('any', untagged)).toBe(true);
	});

	it('tagged reflects whether the task carries any tag', () => {
		expect(run('tagged', bug)).toBe(true);
		expect(run('tagged', untagged)).toBe(false);
	});

	it('accepts the deprecated dot syntax, with a warning', () => {
		const { warnings } = parseWithWarnings('.bug');
		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toContain('deprecated');
		expect(run('.bug', bug)).toBe(true);
	});

	it('does not warn for the current syntax', () => {
		expect(parseWithWarnings(':bug').warnings).toEqual([]);
	});

	it('reads negative integers', () => {
		expect(run('priority gt -1', task([], -5))).toBe(false);
		expect(run('priority eq -5', task([], -5))).toBe(true);
	});
});

describe('a task id', () => {
	const withId = (id: string): TqlTask => ({ ...task([]), id });
	const short = withId('20260830-000838');
	const extended = withId('20260830-000838-rexim');

	it('selects the task it names', () => {
		expect(run('20260830-000838', short)).toBe(true);
		expect(run('20260830-000838-rexim', extended)).toBe(true);
		expect(run('20260830-000838', withId('20260830-000839'))).toBe(false);
	});

	it('matches the whole id, never a prefix of it', () => {
		expect(run('20260830-000838', extended)).toBe(false);
		expect(run('20260830-000838-', extended)).toBe(false);
	});

	it('composes like any other primary', () => {
		expect(run('not 20260830-000838', short)).toBe(false);
		expect(run('20260830-000838 or 20260830-000838-rexim', extended)).toBe(true);
		expect(run('20260830-000838 and priority ge 100', short)).toBe(true);
	});

	it('reads the shape only, as the CLI does, so an impossible date is no error', () => {
		// `is_valid_huid` checks digits, not dates: the CLI answers this with an
		// empty list, and failing to parse it would be a divergence.
		expect(run('20260231-000000', short)).toBe(false);
		expect(run('99999999-999999', short)).toBe(false);
	});
});

describe('precedence', () => {
	it('binds and tighter than or', () => {
		// Parsed as `:a or [:b and :c]`, so a task with only `a` matches.
		expect(run(':a or :b and :c', task(['a']))).toBe(true);
	});

	it('binds not to a primary only', () => {
		// `not :a and :b` is `[not :a] and :b`, not `not [:a and :b]`.
		expect(run('not :a and :b', task(['b']))).toBe(true);
		expect(run('not :a and :b', task(['a', 'b']))).toBe(false);
	});

	it('groups with square brackets', () => {
		expect(run('not [:a and :b]', task(['a']))).toBe(true);
		expect(run('[:a or :b] and :c', task(['a', 'c']))).toBe(true);
		expect(run('[:a or :b] and :c', task(['a']))).toBe(false);
	});

	it('nests groups', () => {
		expect(run('[[:a or :b] and :c] or :d', task(['d']))).toBe(true);
	});

	it('stacks not', () => {
		expect(run('not not :a', task(['a']))).toBe(true);
	});
});

describe('comparisons', () => {
	it.each([
		['priority lt 100', 50, true],
		['priority lt 100', 100, false],
		['priority le 100', 100, true],
		['priority gt 100', 110, true],
		['priority ge 100', 100, true],
		['priority eq 100', 100, true],
		['priority ne 100', 100, false]
	])('%o against priority %i', (source, priority, expected) => {
		expect(run(source as string, task([], priority as number))).toBe(expected);
	});

	it('compares two literals', () => {
		expect(run('1 lt 2', untagged)).toBe(true);
	});

	it('combines with logic', () => {
		expect(run('priority ge 100 and not :wontfix', task(['bug'], 110))).toBe(true);
		expect(run('priority ge 100 and not :wontfix', task(['wontfix'], 110))).toBe(false);
	});
});

describe('errors', () => {
	const fails = (source: string) => {
		try {
			parse(source);
		} catch (error) {
			return error as TqlError;
		}
		return null;
	};

	it('rejects an empty tag', () => {
		// Lowercase where every neighbouring message is capitalised. Reproduced
		// as upstream writes it, like the author's typos elsewhere.
		expect(fails(':')?.message).toBe('empty tag');
	});

	it('rejects an empty query', () => {
		expect(fails('')?.message).toBe('Primary expression is expected here.');
	});

	it('rejects an unclosed group', () => {
		expect(fails('[:a')?.message).toBe('Expected `]`.');
	});

	it('rejects a stray closing bracket', () => {
		expect(fails(':a]')?.message).toContain('Unexpected infix operator');
	});

	it('rejects an unknown word', () => {
		expect(fails('bug')?.message).toBe('Unexpected start of a primary expression `bug`.');
	});

	it('rejects a dangling operator', () => {
		expect(fails(':a and')?.message).toBe('Primary expression is expected here.');
	});

	it('points at the offending token', () => {
		expect(fails(':a and nope')?.span).toEqual({ start: 7, end: 11 });
	});

	it('rejects comparing booleans, as the reference parser does', () => {
		const error = (() => {
			try {
				run(':a lt 5', bug);
			} catch (e) {
				return e as TqlError;
			}
		})();
		expect(error?.message).toBe('Expected integer but got boolean');
	});

	it('rejects a query that yields an integer', () => {
		const error = (() => {
			try {
				run('priority', bug);
			} catch (e) {
				return e as TqlError;
			}
		})();
		expect(error?.message).toBe('Expected boolean but got integer');
	});

	it('rejects logic over integers', () => {
		const error = (() => {
			try {
				run('priority and :a', bug);
			} catch (e) {
				return e as TqlError;
			}
		})();
		expect(error?.message).toBe('Expected boolean but got integer');
	});
});

/** The error a source throws, for asserting on what gets rendered. */
const thrown = (source: string): TqlError => {
	try {
		parse(source);
		expect.unreachable('should have thrown');
	} catch (error) {
		return error as TqlError;
	}
};

describe('formatDiagnostic', () => {
	it('points a single caret at the offending token, above the primary list', () => {
		expect(formatDiagnostic(':a and nope', thrown(':a and nope'))).toBe(
			[
				'What are primary expressions:',
				'',
				'    :<tag>         - checks if task has a tag',
				'    ~<word>        - checks if the title holds a word',
				'    ~"<words>"     - checks if the title holds all of them',
				'    [ <expr> ]     - same as previous but for Bash users',
				'    not <primary>  - negation of a primary expression',
				'    any            - expression that always returns true',
				'    tagged         - checks if a task is tagged',
				'    priority       - priority of a task as an integer',
				'    <number>       - signed integer',
				'    <huid>         - valid id of a task',
				'',
				':a and nope',
				'       ^',
				'Unexpected start of a primary expression `nope`.'
			].join('\n')
		);
	});
});

describe('compile', () => {
	it('parses once and filters many', () => {
		const matches = compile(':bug and not :wontfix');
		const tasks = [task(['bug']), task(['bug', 'wontfix']), task(['ui'])];
		expect(tasks.filter(matches)).toHaveLength(1);
	});

	it('throws at compile time, not per task', () => {
		expect(() => compile(':a and')).toThrow(TqlError);
	});
});

describe('matchesTitle', () => {
	it('ignores case', () => {
		expect(matchesTitle('Windows support', 'windows')).toBe(true);
	});

	it('matches inside a word', () => {
		expect(matchesTitle('Windows support', 'ndows')).toBe(true);
	});

	it('wants every word, in any order', () => {
		expect(matchesTitle('Windows support', 'support windows')).toBe(true);
		expect(matchesTitle('Windows support', 'windows linux')).toBe(false);
	});

	it('ignores the spacing between words', () => {
		expect(matchesTitle('Windows support', '  windows   support ')).toBe(true);
	});
});

describe('the ~ term', () => {
	const windows = task([], 100, 'Windows support');
	const macos = task([], 100, 'MacOS support');
	const run = (source: string, on: TqlTask) => compile(source)(on);

	it('reads a bare word', () => {
		expect(run('~windows', windows)).toBe(true);
		expect(run('~windows', macos)).toBe(false);
	});

	it('reads a quoted phrase as one token, spaces and all', () => {
		expect(tokenize('~"windows support"').map((t) => t.text)).toEqual(['~"windows support"']);
		expect(run('~"support windows"', windows)).toBe(true);
	});

	it('composes like any other primary', () => {
		expect(run('~windows or ~macos', macos)).toBe(true);
		expect(run('not ~windows', macos)).toBe(true);
		expect(run('[~windows or ~macos] and priority ge 100', windows)).toBe(true);
	});

	it('is a boolean, so a comparison rejects it', () => {
		expect(() => run('priority eq ~x', windows)).toThrow(TqlError);
	});

	it('refuses a bare ~', () => {
		expect(() => parse('~')).toThrow('Search text is expected here.');
	});

	it('refuses an unterminated quote, which is how typing looks halfway', () => {
		expect(() => parse('~"windows sup')).toThrow('Expected `"`.');
		expect(() => parse('~"')).toThrow('Expected `"`.');
	});

	it('refuses a phrase with nothing in it', () => {
		expect(() => parse('~"  "')).toThrow('empty search');
	});

	it('puts the caret where the closing quote belongs, not on the `~`', () => {
		// The whole of the report: a caret under the `~` accuses the one character
		// that is right. `[:bug` gets the same treatment from the CLI.
		expect(formatDiagnostic('~"windows :bug', thrown('~"windows :bug'))).toBe(
			['~"windows :bug', '              ^', 'Expected `"`.'].join('\n')
		);
	});

	it('asks for the search text one past the `~`, as the CLI does past a `[`', () => {
		const report = formatDiagnostic('~ and :bug', thrown('~ and :bug'));
		expect(report).toContain('~<word>        - checks if the title holds a word');
		expect(report.split('\n').slice(-3)).toEqual([
			'~ and :bug',
			' ^',
			'Search text is expected here.'
		]);
	});

	it('marks the empty phrase itself, there being nothing missing from it', () => {
		expect(formatDiagnostic('~"  "', thrown('~"  "'))).toBe(
			['~"  "', '^', 'empty search'].join('\n')
		);
	});

	it('leaves a quote alone where the language has no use for one', () => {
		// Nothing in the C grammar spells a string, so this stays an unknown token
		// rather than quietly becoming a search.
		expect(() => parse('"windows"')).toThrow('Unexpected start of a primary expression');
	});
});

describe('two primaries with nothing between them', () => {
	// The reference implementation answers this with the list of operators that
	// could have filled the gap, above its usual caret. It also calls the token an
	// infix operator, even for `not`, and the wording is ported as it stands.
	it('names it the way the CLI does', () => {
		expect(() => parse('~support not ~mac')).toThrow('Unexpected infix operator `not`');
		expect(() => parse(':bug not :ui')).toThrow('Unexpected infix operator `not`');
	});

	it('carries the operator list into the rendered diagnostic', () => {
		expect(formatDiagnostic(':bug not :ui', thrown(':bug not :ui'))).toBe(
			[
				'Supported infix operators:',
				'',
				'    and  or                  - logical operators',
				'    lt  le  gt  ge  eq  ne   - comparison operators',
				'',
				':bug not :ui',
				'     ^',
				'Unexpected infix operator `not`'
			].join('\n')
		);
	});

	it('helps the same way when the primary is missing rather than wrong', () => {
		expect(thrown('priority and').help).toBe(thrown('nope').help);
	});

	it('leaves a diagnostic the CLI does not help with alone', () => {
		// An unclosed bracket gets no list upstream, only the caret.
		expect(thrown('[:a').help).toBeUndefined();
		expect(formatDiagnostic('[:a', thrown('[:a'))).toBe('[:a\n   ^\nExpected `]`.');
	});
});
