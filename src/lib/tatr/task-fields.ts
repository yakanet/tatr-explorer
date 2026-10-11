/** The fields a task's editing sheet holds, and the edit that writes the ones changed. */
import {
	chain,
	EditRefused,
	withBody,
	withPriority,
	withStatus,
	withTags,
	withTitle,
	type Edit,
	type TaskFile
} from './task-file.ts';
import { readPriority, readStatus, readTags } from './task-md.ts';

export interface TaskFields {
	title: string;
	status: string;
	priority: number;
	tags: string[];
	/**
	 * The body as an editor shows it: without the blank lines that open it, and
	 * with plain line feeds, which is all a `<textarea>` holds.
	 */
	description: string;
}

type Field = keyof TaskFields;

/**
 * Each field's name in a sentence, and the edit that writes its value from the
 * draft into a file whose line endings are `eol`. Typed against every field, so
 * a new one does not compile without its way to be written.
 */
const FIELDS: Record<Field, { name: string; write(draft: TaskFields, eol: string): Edit }> = {
	title: { name: 'the title', write: (draft, eol) => withTitle(draft.title + eol.slice(0, -1)) },
	status: { name: 'the status', write: (draft) => withStatus(draft.status) },
	priority: { name: 'the priority', write: (draft) => withPriority(draft.priority) },
	tags: { name: 'the tags', write: (draft) => withTags(draft.tags) },
	description: { name: 'the description', write: withDescription }
};

/** The blank lines that open a body, which separate it from the properties. */
const OPENING = /^(?:[ \t]*\r?\n)*/;

/**
 * The fields of a task file, or of a reading of one, whose properties may lack
 * the defaults the CLI assumes.
 */
export function fieldsOf(file: TaskFile): TaskFields {
	return {
		title: file.title.replace(/\r$/, ''),
		status: readStatus(file.properties),
		priority: readPriority(file.properties),
		tags: readTags(file.properties),
		description: file.body.replace(OPENING, '').replaceAll('\r\n', '\n')
	};
}

/** The fields that differ between `a` and `b`, in the order of the sheet. */
export function differing(a: TaskFields, b: TaskFields): Field[] {
	return (Object.keys(FIELDS) as Field[]).filter((field) => !same(a[field], b[field]));
}

/**
 * The edit that writes the fields of `draft` that differ from `opened`, the
 * fields the sheet was opened on, each over the file as it is on disk, so that
 * a property `tatr` or an editor changed meanwhile is kept. It refuses a file
 * in which one of those fields changed since to something else than the draft.
 */
export function withFields(opened: TaskFields, draft: TaskFields): Edit {
	const changed = differing(opened, draft);
	return (file) => {
		const now = fieldsOf(file);
		const pending = changed.filter((field) => !same(now[field], draft[field]));
		const clashing = pending.filter((field) => !same(now[field], opened[field]));
		if (clashing.length > 0) {
			throw new EditRefused(
				`${listed(clashing)} changed on disk since editing began, so nothing was written.`
			);
		}
		const eol = lineEndingOf(file);
		return chain(...pending.map((field) => FIELDS[field].write(draft, eol)))(file);
	};
}

/** The line ending of a file, read from its title, in which the parser leaves a CRLF's `\r`. */
function lineEndingOf(file: TaskFile): string {
	if (file.title.endsWith('\r')) return '\r\n';
	return '\n';
}

/** Writes the draft's description in place of the body, after the blank lines that open it. */
function withDescription(draft: TaskFields, eol: string): Edit {
	return (file) => {
		if (draft.description === '') return withBody('')(file);
		// A blank line keeps a description that starts like a property out of the block.
		const opening = OPENING.exec(file.body)![0] || eol;
		return withBody(opening + draft.description.replaceAll('\n', eol))(file);
	};
}

function same(a: TaskFields[Field], b: TaskFields[Field]): boolean {
	if (Array.isArray(a) && Array.isArray(b)) return a.join(',') === b.join(',');
	return a === b;
}

/** `the title`, `the title and the tags`, `the title, the status and the tags`. */
function listed(fields: Field[]): string {
	const list = new Intl.ListFormat('en-GB', { type: 'conjunction' });
	return list.format(fields.map((field) => FIELDS[field].name));
}
