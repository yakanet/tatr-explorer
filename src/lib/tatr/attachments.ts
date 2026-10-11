/**
 * Lists the files a task folder holds besides its `TASK.md`.
 *
 * The tree listing already returns every path with its size, so the list costs
 * no extra request. Most attachments are also linked from the body; the list
 * shows what a task carries without reading the body.
 */

/** One file as a listing reports it: a path from the repository root, sometimes a size. */
export interface Listed {
	path: string;
	size?: number;
}

export interface Attachment {
	/** Path within the task folder, so a nested file keeps its folders. */
	name: string;
	/** Path from the repository root, which a raw URL needs. */
	path: string;
	size?: number;
}

const IN_TASK = /^tasks\/([^/]+)\/(.+)$/;

/**
 * Groups a listing's entries by task id, leaving out `TASK.md` and dotfiles.
 *
 * Dotfiles are tooling, such as upstream's one `.gitignore`, and excluding
 * hidden files needs no guess about what the author meant to attach.
 */
export function collectAttachments(entries: readonly Listed[]): Map<string, Attachment[]> {
	const byTask = new Map<string, Attachment[]>();

	for (const entry of entries) {
		const match = IN_TASK.exec(entry.path);
		if (!match) continue;

		const [, id, name] = match;
		if (name === 'TASK.md') continue;
		// A hidden folder hides its contents too, such as `tasks/x/.git/config`.
		if (name.split('/').some((segment) => segment.startsWith('.'))) continue;

		const attachment: Attachment = { name, path: entry.path };
		if (entry.size !== undefined) attachment.size = entry.size;

		const existing = byTask.get(id);
		if (existing) existing.push(attachment);
		else byTask.set(id, [attachment]);
	}

	for (const list of byTask.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	return byTask;
}

const UNITS = ['B', 'kB', 'MB'] as const;

/** Rounds to one decimal, or to a whole number for bytes and from 100 up. */
function rounded(value: number, unit: number): number {
	if (unit === 0 || value >= 100) return Math.round(value);
	return Math.round(value * 10) / 10;
}

/**
 * Formats a byte count in the unit that keeps the number small, with at most
 * one decimal. An absent size renders as an empty string, not zero, because a
 * listing that omits a size has not said the file is empty.
 */
export function formatSize(bytes: number | undefined): string {
	if (bytes === undefined) return '';

	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < UNITS.length - 1) {
		value /= 1000;
		unit += 1;
	}

	return `${rounded(value, unit)} ${UNITS[unit]}`;
}
