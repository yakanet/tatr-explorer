/**
 * Builds the `tatr ls` command that lists what a query shows, or names what in
 * the query no command can express.
 *
 * Printing the command lets a reader check that a query means the same here as
 * in the terminal, and shows the CLI to a reader who came through the web. A
 * `~` term (a title search) and the `all` status (open and closed at once) have
 * no `tatr ls` equivalent, so for those the output names the term rather than
 * a command that would fail or list something else.
 */
import type { Node } from './query.ts';

/**
 * Which tasks a query runs over. `open` is `tatr ls` and `closed` is
 * `tatr ls -c`, which lists closed tasks only. `all` is this viewer's addition:
 * the CLI has no single command for both, and a reader checking whether
 * something was ever filed, or following the dashboard's total, needs one.
 */
export type Status = 'open' | 'closed' | 'all';

export const STATUSES: readonly Status[] = ['open', 'closed', 'all'];

/** What `tatr ls` makes of a query and a status. */
export type LsEcho =
	| { kind: 'command'; text: string }
	| {
			kind: 'ours';
			/** The `~` terms, as typed, which `tatr ls` does not understand. */
			titles: string[];
			/** Whether the status is `all`, which no single `tatr ls` lists. */
			both: boolean;
	  };

/**
 * Echoes a compiled query as a `tatr ls` command. `source` is the trimmed text
 * that was compiled, which the tree's spans index into, and `node` its tree
 * (null for an empty query). A query in error shows its diagnostic instead.
 *
 * The status is part of the command because `ls` hides closed tasks and `ls -c`
 * shows only those. The query goes in one quoted argument, since the CLI joins
 * its arguments with spaces and brackets glob in a shell.
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

/** Lists every `~` term of a query, as the reader typed it. */
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
 * Quotes one argument for a POSIX shell: single quotes keep everything literal,
 * and an inner quote is closed, escaped and reopened.
 */
function shellQuote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}
