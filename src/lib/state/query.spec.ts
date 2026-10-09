import { describe, expect, it } from 'vitest';
import { QueryState, searchFor } from './query.svelte.ts';
import { formatDiagnostic } from '../tql/query.ts';
import { readTask, type Task } from '../tatr/task.ts';

const make = (id: string, priority: number, tags: string[], closed = false): Task =>
	readTask(
		id,
		`# t\n\n- STATUS: ${closed ? 'CLOSED' : 'OPEN'}\n- PRIORITY: ${priority}\n- TAGS: ${tags.join(',')}\n`
	)!;

const tasks = [
	make('20260101-000001', 100, ['bug']),
	make('20260101-000002', 50, []),
	make('20260101-000003', 100, ['bug'], true)
];

const titled = (title: string): Task =>
	readTask('20260101-000009', `# ${title}\n\n- STATUS: OPEN\n`)!;

const withText = (text: string) => {
	const query = new QueryState();
	query.text = text;
	return query;
};

describe('QueryState', () => {
	it('matches everything when empty', () => {
		expect(withText('').apply(tasks)).toHaveLength(2);
	});

	it('filters on a tag', () => {
		expect(
			withText(':bug')
				.apply(tasks)
				.map((task) => task.id)
		).toEqual(['20260101-000001']);
	});

	it('honours the status', () => {
		const query = withText(':bug');
		query.status = 'all';
		expect(query.apply(tasks)).toHaveLength(2);
	});

	it('lists the closed tasks only, as `tatr ls -c` does', () => {
		const query = withText('');
		query.status = 'closed';
		expect(query.apply(tasks).map((task) => task.id)).toEqual(['20260101-000003']);
	});

	it('reports a syntax error rather than filtering', () => {
		const query = withText('pr');
		expect(query.error?.message).toBe('Unexpected start of a primary expression `pr`.');
		expect(query.apply(tasks)).toHaveLength(2);
	});

	// `priority` parses and compiles: it is an integer where a boolean is
	// required, and the language only says so while evaluating. Left unchecked it
	// threw mid-render and took the page down with it.
	it.each(['priority', '100', 'priority and :bug'])(
		'reports the ill-typed query %o instead of throwing',
		(source) => {
			const query = withText(source);
			expect(query.error?.message).toContain('Expected boolean');
			expect(() => query.apply(tasks)).not.toThrow();
			expect(query.apply(tasks)).toHaveLength(2);
		}
	);

	it('still reports a type error hiding on the right of an and', () => {
		// `and` evaluates both sides before testing either, so no branch escapes
		// the witness — even one a short-circuiting language would skip.
		expect(withText(':bug and priority').error?.message).toContain('Expected boolean');
	});

	it('keeps a deprecated spelling working, with a warning', () => {
		const query = withText('.bug');
		expect(query.error).toBeNull();
		expect(query.warnings).toHaveLength(1);
		expect(query.apply(tasks)).toHaveLength(1);
	});
});

describe('the ~ term, through the state', () => {
	it('narrows the query rather than replacing it', () => {
		expect(withText(':bug and ~windows').apply([titled('Windows support'), ...tasks])).toEqual([]);
	});

	it('filters on its own', () => {
		expect(
			withText('~windows')
				.apply([titled('Windows support'), ...tasks])
				.map((task) => task.title)
		).toEqual(['Windows support']);
	});

	it('still hides closed tasks unless asked', () => {
		const query = withText('~t');
		expect(query.apply(tasks)).toHaveLength(2);
		query.status = 'all';
		expect(query.apply(tasks)).toHaveLength(3);
	});

	it('reports an unterminated quote instead of throwing', () => {
		const query = withText('~"windows sup');
		expect(query.error?.message).toBe('Expected `"`.');
		expect(query.apply(tasks)).toHaveLength(2);
	});

	it('reports a ~ used where a number belongs', () => {
		expect(withText('priority eq ~x').error?.message).toContain('Expected integer');
	});

	it('hands out the source the error was measured on, spaces trimmed off', () => {
		// A caret counts columns from what the compiler saw. Rendering `text`
		// instead put the leading spaces back on the line above it and left the
		// caret several columns short of the character it meant.
		const query = withText('   nope   ');
		expect(query.source).toBe('nope');
		expect(formatDiagnostic(query.source, query.error!).split('\n').slice(-3)).toEqual([
			'nope',
			'^',
			'Unexpected start of a primary expression `nope`.'
		]);
	});

	it('has a source even when nothing is wrong with it', () => {
		expect(withText('  :bug  ').source).toBe(':bug');
	});
});

describe('the query in a URL', () => {
	it('writes nothing for an empty query', () => {
		expect(searchFor('')).toBe('');
		expect(searchFor('  ')).toBe('');
	});

	it('writes the status only when given one', () => {
		expect(searchFor(' not tagged ', 'all')).toBe('?q=not+tagged&status=all');
		expect(searchFor('', 'closed')).toBe('?status=closed');
		expect(searchFor(':bug')).toBe('?q=%3Abug');
		expect(searchFor(':bug', 'open')).toBe('?q=%3Abug&status=open');
	});

	it("writes the list's status even when open, and the board's never", () => {
		const query = withText(':bug');
		expect(query.searchOf('list')).toBe('?q=%3Abug&status=open');
		query.status = 'closed';
		expect(query.searchOf('list')).toBe('?q=%3Abug&status=closed');
		expect(query.searchOf('board')).toBe('?q=%3Abug');
	});

	it('reads back what it writes', () => {
		const query = new QueryState();
		query.read(new URLSearchParams('q=not+tagged&status=all'));
		expect([query.text, query.status]).toEqual(['not tagged', 'all']);
	});

	it('clears the text when a URL names a status without one', () => {
		const query = withText(':bug');
		query.read(new URLSearchParams('status=closed'));
		expect([query.text, query.status]).toEqual(['', 'closed']);
	});

	it('keeps the status through a view that does not use it', () => {
		// The board's address carries the text alone; coming back to the list
		// must find the status the reader chose there.
		const query = withText(':bug');
		query.status = 'closed';
		query.read(new URLSearchParams('q=%3Atql'));
		expect([query.text, query.status]).toEqual([':tql', 'closed']);
	});

	it('leaves the query alone when the URL carries none', () => {
		const query = withText(':bug');
		query.status = 'all';
		query.read(new URLSearchParams(''));
		expect([query.text, query.status]).toEqual([':bug', 'all']);
	});

	it('opens a link from before the status had three values', () => {
		const query = new QueryState();
		query.read(new URLSearchParams('q=:bug&closed=1'));
		expect([query.text, query.status]).toEqual([':bug', 'all']);
	});

	it('ignores a status it does not know', () => {
		const query = new QueryState();
		query.read(new URLSearchParams('status=done'));
		expect(query.status).toBe('open');
	});
});
