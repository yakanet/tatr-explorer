/**
 * Rewrites a `TASK.md` the way `tatr untag` does, the one command of the CLI
 * that rewrites a task: it loads the file as `load_tasks` does, changes its
 * properties, and renders it whole with `render_task_md`.
 *
 * Rendering normalises every property to `- KEY: value` in its original order,
 * so a file the CLI wrote comes back byte for byte, and a file written by hand
 * comes back as the CLI would write it.
 */
import { parsePriority, parseTags, parseTaskMd, readTags, UNSET_PRIORITY } from './task-md.ts';

/** A task file as the CLI holds it to rewrite it. */
export interface TaskFile {
	title: string;
	/** Every property in the CLI's order, the defaults it assumes included. */
	properties: ReadonlyMap<string, string>;
	/** Everything after the property block, verbatim. */
	body: string;
}

/**
 * A change to a task file, applied to the file as read just before it is
 * written. It throws an {@link EditRefused} when that file is not one it can
 * change.
 */
export type Edit = (file: TaskFile) => TaskFile;

/** The sentence why an edit refused the file it was given, which follows the task's id. */
export class EditRefused extends Error {
	override name = 'EditRefused';
}

/**
 * The properties `load_tasks` adds when a file lacks them, in its order.
 * Rewriting the file writes them down.
 */
const DEFAULTS: readonly [string, string][] = [
	['STATUS', 'OPEN'],
	['PRIORITY', String(UNSET_PRIORITY)],
	['TAGS', '']
];

/**
 * Loads a task file, or returns null when its title lacks its `#`. The CLI
 * would rewrite such a file as the invalid title over an empty body, losing
 * all of it, so it is never rewritten here.
 */
export function loadTaskFile(text: string): TaskFile | null {
	const parsed = parseTaskMd(text);
	if (parsed.malformed) return null;
	return {
		title: parsed.title,
		properties: withDefaults(parsed.properties),
		body: parsed.description
	};
}

/** The properties with the defaults the CLI assumes appended, which is what a rewrite holds. */
export function withDefaults(properties: ReadonlyMap<string, string>): Map<string, string> {
	const all = new Map(properties);
	for (const [key, value] of DEFAULTS) {
		if (!all.has(key)) all.set(key, value);
	}
	return all;
}

/** Renders a task file as `render_task_md` does. */
export function renderTaskMd(file: TaskFile): string {
	let text = `# ${file.title}\n\n`;
	for (const [key, value] of file.properties) text += `- ${renderProperty(key, value)}\n`;
	return text + file.body;
}

/** One property's line without its dash: the tags joined by commas, the priority as a number. */
function renderProperty(key: string, value: string): string {
	if (key === 'TAGS') return renderTags(parseTags(value));
	if (key === 'PRIORITY') return `PRIORITY: ${parsePriority(value)}`;
	return `${key}: ${value}`;
}

/** The tags' line, which has no space after the colon when there are none. */
function renderTags(tags: string[]): string {
	if (tags.length === 0) return 'TAGS:';
	return `TAGS: ${tags.join(',')}`;
}

/** The file with one property set, in its place, or at the end when it was absent. */
function withProperty(file: TaskFile, key: string, value: string): TaskFile {
	const properties = new Map(file.properties);
	properties.set(key, value);
	return { ...file, properties };
}

export function withTitle(title: string): Edit {
	return (file) => ({ ...file, title });
}

export function withBody(body: string): Edit {
	return (file) => ({ ...file, body });
}

export function withStatus(status: string): Edit {
	return (file) => withProperty(file, 'STATUS', status);
}

export function withPriority(priority: number): Edit {
	return (file) => withProperty(file, 'PRIORITY', String(priority));
}

export function withTags(tags: readonly string[]): Edit {
	return (file) => withProperty(file, 'TAGS', tags.join(','));
}

export function withTag(tag: string): Edit {
	return (file) => withTags(tagged(readTags(file.properties), tag))(file);
}

export function withoutTag(tag: string): Edit {
	return (file) => withTags(untagged(readTags(file.properties), tag))(file);
}

/** The tags with `tag` after the others, or the same tags when they hold it. */
export function tagged(tags: readonly string[], tag: string): string[] {
	if (tags.includes(tag)) return [...tags];
	return [...tags, tag];
}

/**
 * The tags without any `tag`, removed as `tatr untag` removes them: the last
 * tag moves into each place freed, so the file is the one the CLI would write.
 */
export function untagged(tags: readonly string[], tag: string): string[] {
	const left = [...tags];
	// Searched again from the slot just filled, which the CLI checks again too.
	for (let i = left.indexOf(tag); i >= 0; i = left.indexOf(tag, i)) {
		left[i] = left[left.length - 1];
		left.pop();
	}
	return left;
}

/** The edits applied one after another, as one edit. */
export function chain(...edits: Edit[]): Edit {
	return (file) => edits.reduce((edited, edit) => edit(edited), file);
}

/**
 * Applies `edit` to the text of a task file, or gives the text unchanged when
 * the edit changes nothing, as the CLI writes only a task it changed. A file
 * whose title lacks its `#` is refused, as `loadTaskFile` says why.
 */
export function editTaskMd(text: string, edit: Edit): string {
	const loaded = loadTaskFile(text);
	if (!loaded) throw new EditRefused('its file does not start with #, so it was not rewritten.');
	const rendered = renderTaskMd(edit(loaded));
	if (rendered === renderTaskMd(loaded)) return text;
	return rendered;
}
