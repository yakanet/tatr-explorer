import { describe, expect, it } from 'vitest';
import { lsEcho, type Status } from './command.ts';
import { parse } from './query.ts';

/** Calls `lsEcho` as the query bar does: a trimmed query, its tree (null when empty), a status. */
function echo(source: string, status: Status) {
	const query = source.trim();
	if (!query) return lsEcho(query, null, status);
	return lsEcho(query, parse(query), status);
}

describe('the tatr ls command a query is', () => {
	it('is `tatr ls` alone for no query, as the CLI reads it as `any`', () => {
		expect(echo('', 'open')).toEqual({ kind: 'command', text: 'tatr ls' });
		expect(echo('   ', 'open')).toEqual({ kind: 'command', text: 'tatr ls' });
	});

	it('carries `-c` for the closed tasks, which `ls` alone hides', () => {
		expect(echo('', 'closed')).toEqual({ kind: 'command', text: 'tatr ls -c' });
		expect(echo(':bug', 'closed')).toEqual({ kind: 'command', text: "tatr ls -c ':bug'" });
	});

	it('quotes the query as one argument, brackets and all', () => {
		// zsh refuses `[:bug]` unquoted.
		expect(echo(' [:bug or :ui] and priority ge 100 ', 'open')).toEqual({
			kind: 'command',
			text: "tatr ls '[:bug or :ui] and priority ge 100'"
		});
	});

	it('keeps a quote inside the query literal', () => {
		expect(echo(":it's", 'open')).toEqual({ kind: 'command', text: "tatr ls ':it'\\''s'" });
	});
});

describe('a query no tatr ls can say', () => {
	it('names every `~` term, as typed', () => {
		expect(echo(':bug and ~fix or not ~"two words"', 'open')).toEqual({
			kind: 'ours',
			titles: ['~fix', '~"two words"'],
			both: false
		});
	});

	it('says so for `all`, which no single command lists', () => {
		expect(echo(':bug', 'all')).toEqual({ kind: 'ours', titles: [], both: true });
	});
});
