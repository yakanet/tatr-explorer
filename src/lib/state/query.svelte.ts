/**
 * The query shared by every view of a repository. It is shared because a
 * chart is also a control: clicking a tag bar filters the list, the counts and
 * the other charts at once. It lives in the URL so a filtered view is a link.
 */
import { compile, parseWithWarnings, TqlError, type Node, type TqlWarning } from '../tql/query.ts';
import { STATUSES, type Status } from '../tql/command.ts';
import type { Task } from '../tatr/task.ts';

export const QUERY = Symbol('query');

/** A compiled query: what it matches, and what the query bar shows about it. */
interface Compiled {
	source: string;
	match: (task: Task) => boolean;
	error: TqlError | null;
	warnings: TqlWarning[];
	/** The parsed tree, or null when the query is empty or in error. */
	node: Node | null;
}

/**
 * Writes a query as URL parameters. The status is written only when given, so
 * a view that ignores it leaves it out of its address.
 */
export function searchFor(text: string, status?: Status): string {
	const params = new URLSearchParams();
	if (text.trim()) params.set('q', text.trim());
	if (status) params.set('status', status);
	const rendered = params.toString();
	return rendered ? `?${rendered}` : '';
}

export class QueryState {
	text = $state('');
	/** Open by default, as `tatr ls` hides closed tasks unless asked. */
	status = $state<Status>('open');

	readonly #compiled = $derived.by((): Compiled => {
		const source = this.text.trim();
		if (source === '') {
			return { source, match: () => true, error: null, warnings: [], node: null };
		}
		try {
			const match = compile(source);
			const { node, warnings } = parseWithWarnings(source);
			return { source, match, error: null, warnings, node };
		} catch (error) {
			// A query is often incomplete while typing, so an error filters nothing
			// rather than emptying the screen.
			return {
				source,
				match: () => true,
				error: error instanceof TqlError ? error : null,
				warnings: [],
				node: null
			};
		}
	});

	/**
	 * The trimmed query that was compiled. A diagnostic renders this rather than
	 * `text`, because an error's columns count from the trimmed source.
	 */
	get source(): string {
		return this.#compiled.source;
	}

	get error(): TqlError | null {
		return this.#compiled.error;
	}

	get warnings(): TqlWarning[] {
		return this.#compiled.warnings;
	}

	/** The parsed tree, or null when the query is empty or in error. */
	get node(): Node | null {
		return this.#compiled.node;
	}

	/**
	 * Whether a task satisfies the query, ignoring the status. The board needs
	 * the two apart: its Done column is the closed tasks, so filtering those out
	 * first would empty it. A query in error matches everything.
	 */
	matches(task: Task): boolean {
		return this.#compiled.error ? true : this.#compiled.match(task);
	}

	/** The tasks the status admits, before the query narrows them. */
	pool(tasks: Task[]): Task[] {
		if (this.status === 'all') return tasks;
		const closed = this.status === 'closed';
		return tasks.filter((task) => task.closed === closed);
	}

	/** Applies the query to a set of tasks, honouring the status. */
	apply(tasks: Task[]): Task[] {
		return this.pool(tasks).filter((task) => this.matches(task));
	}

	/**
	 * The query in a view's address: the text and the status for the list, the
	 * text alone for the board. The list writes its status even when `open`, so
	 * going back through history restores it instead of keeping the status
	 * chosen since.
	 */
	searchOf(view: 'list' | 'board'): string {
		return view === 'list' ? searchFor(this.text, this.status) : searchFor(this.text);
	}

	/**
	 * Reads the query from a URL and leaves untouched what it does not carry, so
	 * a link to a task or to the board keeps the reader's status. A URL naming a
	 * status names the whole query and clears the text. `closed=1` opens as
	 * `all`, for links written before the status had three values.
	 */
	read(params: Pick<URLSearchParams, 'get' | 'has'>): void {
		const named = params.get('status');
		const status =
			STATUSES.find((one) => one === named) ?? (params.get('closed') === '1' ? 'all' : undefined);
		if (status) {
			this.status = status;
			this.text = params.get('q') ?? '';
		} else if (params.has('q')) {
			this.text = params.get('q') ?? '';
		}
	}

	/** Adds a term, or removes it when it is already the whole query. */
	toggle(term: string): void {
		const current = this.text.trim();
		if (current === term) {
			this.text = '';
			return;
		}
		if (current === '') {
			this.text = term;
			return;
		}
		const parts = current.split(/\s+and\s+/);
		this.text = parts.includes(term)
			? parts.filter((part) => part !== term).join(' and ')
			: `${current} and ${term}`;
	}

	has(term: string): boolean {
		return this.text
			.trim()
			.split(/\s+and\s+/)
			.includes(term);
	}
}
