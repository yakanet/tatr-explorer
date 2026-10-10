/**
 * The files a task folder holds besides its `TASK.md`.
 *
 * The listing already knows them (it downloads the whole tree in one request
 * and then keeps only the `TASK.md` entries), so showing them costs nothing but
 * the lines that were being thrown away. Sizes come from the same place, so a
 * file can be listed with its weight without being fetched.
 *
 * On tsoding/tatr there are seven, four of them screenshots and one task
 * carrying four on its own. Six of the seven are already linked from the body
 * and render there, which is why this list is not about reachability: it says
 * what a task carries without the reader having to read a long body to find out.
 */

/** Whatever a listing reports: a path from the repository root, sometimes a size. */
export interface Listed {
	path: string;
	size?: number;
}

export interface Attachment {
	/** Path within the task folder, so a nested file keeps its shape. */
	name: string;
	/** Path from the repository root, which is what a raw URL needs. */
	path: string;
	size?: number;
}

const IN_TASK = /^tasks\/([^/]+)\/(.+)$/;

/**
 * Groups a listing's entries by task id.
 *
 * Dotfiles are left out. The only unreferenced file upstream is a `.gitignore`,
 * which is tooling rather than something the task carries, and a rule that
 * excludes hidden files is the one cut that needs no guessing about intent.
 */
export function collectAttachments(entries: readonly Listed[]): Map<string, Attachment[]> {
	const byTask = new Map<string, Attachment[]>();

	for (const entry of entries) {
		const match = IN_TASK.exec(entry.path);
		if (!match) continue;

		const [, id, name] = match;
		if (name === 'TASK.md') continue;
		// Hidden at any depth: `tasks/x/.git/config` is not an attachment either.
		if (name.split('/').some((segment) => segment.startsWith('.'))) continue;

		const attachment: Attachment =
			entry.size === undefined
				? { name, path: entry.path }
				: { name, path: entry.path, size: entry.size };

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

/**
 * A size worth reading at a glance: two significant figures at most, and the
 * unit that keeps the number small. Absent sizes render as nothing rather than
 * as a zero, because a listing that does not report one has not said it is
 * empty.
 */
export function formatSize(bytes: number | undefined): string {
	if (bytes === undefined) return '';

	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < UNITS.length - 1) {
		value /= 1000;
		unit += 1;
	}

	const rounded = unit === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
	return `${rounded} ${UNITS[unit]}`;
}
