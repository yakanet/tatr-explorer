/**
 * Lists the files a task folder holds besides its `TASK.md`, and names those a
 * sheet adds to it.
 *
 * The tree listing already returns every path with its size, so the list costs
 * no extra request. Most attachments are also linked from the body; the list
 * shows what a task carries without reading the body.
 */
import { formatHuid } from './huid.ts';

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

/**
 * A name for a file attached to a task: `wanted` reduced to letters, digits,
 * `.`, `-` and `_`, so that a link to it needs no escaping, and numbered `-2`,
 * `-3` before its extension while `taken` holds it. Accents go and their
 * letters stay. A name is never hidden, as a dotfile is not listed as an
 * attachment, and `taken` is compared without case, as the disks of macOS and
 * Windows compare names.
 */
export function attachmentName(wanted: string, taken: ReadonlySet<string>): string {
	const cleaned = wanted
		.normalize('NFD')
		.replace(/\p{Mn}+/gu, '')
		.replace(/[^A-Za-z0-9._-]+/g, '-');
	const [stem, extension] = splitExtension(cleaned);
	const base = stem.replace(/^[-.]+|[-.]+$/g, '') || 'file';
	const held = new Set([...taken].map((name) => name.toLowerCase()));
	let name = base + extension;
	for (let n = 2; held.has(name.toLowerCase()); n += 1) name = `${base}-${n}${extension}`;
	return name;
}

/** `name` cut before its last dot, which stays with the extension; whole when there is none. */
function splitExtension(name: string): [string, string] {
	const dot = name.lastIndexOf('.');
	if (dot < 0) return [name, ''];
	return [name.slice(0, dot), name.slice(dot)];
}

/**
 * The name a file pasted or dropped into a description asks for: its own,
 * unless it is the generic `image.png` a browser gives a pasted screenshot,
 * which is named after the clock instead, as `pasted-<YYYYMMDD-HHMMSS>.png`.
 */
export function wantedName(name: string, now: Date): string {
	const generic = /^image\.([a-z]+)$/i.exec(name);
	if (!generic) return name;
	return `pasted-${formatHuid(now)}.${generic[1].toLowerCase()}`;
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
