/**
 * Parses and extends the optional `tasks/tags` file, which describes each tag,
 * as `src/tatr.c` reads it:
 *
 *     <tag-name> [,] <tag-description>
 *
 * The separator is any run of whitespace and commas, so upstream's `tql,, Tatr
 * Query Language` describes the tag `tql` as `Tatr Query Language`.
 */

/** Where the file lives, from the repository root. */
export const TAGS_FILE = 'tasks/tags';

export interface TagDescriptions {
	descriptions: Map<string, string>;
	/** Tags defined more than once. The reference implementation warns and keeps the last. */
	redefined: string[];
}

export function parseTagsFile(source: string): TagDescriptions {
	const descriptions = new Map<string, string>();
	const redefined: string[] = [];

	for (const rawLine of source.split('\n')) {
		const line = rawLine.trim();
		if (line.length === 0) continue;

		let i = 0;
		while (i < line.length && !/[\s,]/.test(line[i])) i += 1;
		const tag = line.slice(0, i);
		while (i < line.length && /[\s,]/.test(line[i])) i += 1;

		if (descriptions.has(tag)) redefined.push(tag);
		descriptions.set(tag, line.slice(i).trimEnd());
	}

	return { descriptions, redefined };
}

/**
 * The tags file with one line appended per tag of `described`, as
 * `<tag> , <description>`, which `parseTagsFile` reads back. `text` is null for
 * a repository that has none. The lines there stay byte for byte, a line feed
 * ending the last one when it lacks it.
 */
export function describedTagsFile(
	text: string | null,
	described: ReadonlyMap<string, string>
): string {
	let extended = text ?? '';
	if (extended !== '' && !extended.endsWith('\n')) extended += '\n';
	for (const [tag, description] of described) extended += `${tag} , ${description}\n`;
	return extended;
}
