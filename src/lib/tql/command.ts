/**
 * The `tatr ls` command that lists what a query shows, or what in it no
 * command can say.
 *
 * The whole claim of this viewer is that a query means the same thing here as
 * in the terminal. Printing the command puts that claim where it can be
 * checked, and teaches the CLI to a reader who arrived through the web. The
 * interesting case is the one where it cannot be said: a `~` term searches
 * titles, which the CLI cannot do, and `all` lists open and closed tasks at
 * once, which no single `tatr ls` does. There the honest output is the reason,
 * naming the term, rather than a command that would not run, or would list
 * something else, once carried to a terminal.
 */
import type { Node } from './query.ts';

/**
 * Which tasks a query runs over. `open` is `tatr ls` and `closed` is
 * `tatr ls -c`, which lists the closed tasks *only*. `all` is this viewer's
 * own: the CLI has no single command for both, and a reader checking whether
 * something was ever filed, or following the dashboard's "in total", needs one.
 */
export type Status = 'open' | 'closed' | 'all';

export const STATUSES: readonly Status[] = ['open', 'closed', 'all'];

/** What `tatr ls` makes of a query and a status. */
export type LsEcho =
	| { kind: 'command'; text: string }
	| {
			kind: 'ours';
			/** The `~` terms, as typed, which no `tatr ls` understands. */
			titles: string[];
			/** Whether the status is `all`, which no single `tatr ls` lists. */
			both: boolean;
	  };

/**
 * The echo for a query that compiled: its source exactly as compiled, trimmed,
 * which is what the tree's spans count in, and its tree (null for an empty
 * query). Whether it compiled is the caller's to know, a query in error having
 * a diagnostic to show instead.
 *
 * `ls` hides closed tasks and `ls -c` shows only those, so the status is part
 * of the command. The CLI joins its arguments with spaces, so the query goes in
 * one quoted argument rather than word by word: brackets group in TQL and glob
 * in a shell.
 */
export function lsEcho(source: string, node: Node | null, status: Status): LsEcho {
	const titles = titleTerms(node, source);
	const both = status === 'all';
	if (titles.length > 0 || both) return { kind: 'ours', titles, both };

	const words = ['tatr', 'ls'];
	if (status === 'closed') words.push('-c');
	if (source) words.push(shellQuote(source));
	return { kind: 'command', text: words.join(' ') };
}

/** Every `~` term of a query, spelled as the reader typed it. */
function titleTerms(node: Node | null, source: string): string[] {
	if (!node) return [];
	switch (node.kind) {
		case 'text':
			return [source.slice(node.span.start, node.span.end)];
		case 'not':
			return titleTerms(node.operand, source);
		case 'binary':
			return [...titleTerms(node.left, source), ...titleTerms(node.right, source)];
		default:
			return [];
	}
}

/**
 * One argument for a POSIX shell: single quotes, which keep everything
 * literal, and a quote inside closed, escaped and reopened.
 */
function shellQuote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}
