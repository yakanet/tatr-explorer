/**
 * The query, shared by every view of a repository.
 *
 * It is global state on purpose: the dashboard's charts are both a
 * visualisation and a control, so clicking a tag bar has to filter the list,
 * the counts and the other charts at once. Keeping it in the URL means a
 * filtered view is a link someone can send.
 */
import { compile, parseWithWarnings, TqlError, type TqlWarning } from '../tql/query.ts';
import type { Task } from '../tatr/task.ts';

export const QUERY = Symbol('query');

/**
 * Which tasks a query runs over. `open` is `tatr ls` and `closed` is
 * `tatr ls -c`, which lists the closed tasks *only*. `all` is this viewer's
 * own: the CLI has no single command for both, and a reader checking whether
 * something was ever filed, or following the dashboard's "in total", needs one.
 */
export type Status = 'open' | 'closed' | 'all';

export const STATUSES: readonly Status[] = ['open', 'closed', 'all'];

/**
 * A query as URL parameters. The status is written only when one is given, so
 * a view that has no use for it leaves it out of its address.
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
	/** `tatr ls` hides closed tasks unless asked; so does this. */
	status = $state<Status>('open');

	readonly #compiled = $derived.by(() => {
		const source = this.text.trim();
		if (source === '') {
			return {
				source,
				match: () => true,
				error: null as TqlError | null,
				warnings: [] as TqlWarning[]
			};
		}
		try {
			return {
				source,
				match: compile(source),
				error: null,
				warnings: parseWithWarnings(source).warnings
			};
		} catch (error) {
			// An incomplete or ill-typed query is the normal state while typing, so
			// it filters nothing rather than emptying the screen under the reader.
			return {
				source,
				match: () => true,
				error: error instanceof TqlError ? error : null,
				warnings: [] as TqlWarning[]
			};
		}
	});

	/**
	 * The query as it was compiled, which is what an error's columns count from.
	 *
	 * Whoever renders a diagnostic gets handed this rather than `text`: the two
	 * differ by the trim, and printing the untrimmed line above a caret measured
	 * on the trimmed one slid the source right and left the caret pointing at
	 * nothing — leading spaces being invisible, the reader saw a caret accusing
	 * a character several columns from the one it meant.
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

	/**
	 * Whether one task satisfies the query, ignoring the closed toggle.
	 *
	 * The board needs the two apart: its Done column *is* the closed tasks, so
	 * filtering them out before the columns are built would empty it rather than
	 * narrow it. An unparsable query matches everything, so a half-typed one
	 * leaves the screen alone instead of blanking it.
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
	 * The query as a view's address carries it, so a filtered view is a link: the
	 * list uses the text and the status, the board the text alone, the other
	 * views neither. The list writes its status even when it is `open`, so that
	 * each of its addresses is a whole query — one without a status would read,
	 * coming back to it through history, as "keep the status chosen since".
	 */
	searchOf(view: 'list' | 'board'): string {
		return view === 'list' ? searchFor(this.text, this.status) : searchFor(this.text);
	}

	/**
	 * Takes from a URL what it carries, and leaves the rest as it is: a link to a
	 * task's page, or to a view that has no use for the status, should not wipe
	 * what the reader chose. A URL naming a status names the whole query, so a
	 * count's link to `?status=closed` clears a text left from before.
	 * `closed=1` is how the status was written before it had three values, and
	 * still opens as `all`.
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
