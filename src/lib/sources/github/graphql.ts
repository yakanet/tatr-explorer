/**
 * Reads a private repository's task files through GitHub's GraphQL API, all in
 * one request. The CDN refuses a request that carries a token, and the REST API
 * would spend one request per file.
 */
import type { ForgeAddress } from '../../repo/ref.ts';
import { readJson } from '../http.ts';
import { API, askGitHub } from './github-api.ts';

/**
 * Every file in `tasks/` and in each folder under it, with its text: a task's
 * `TASK.md`, its attachments, and `tasks/tags`. GraphQL cannot recurse, so a
 * file nested deeper is not read, and none the loader reads is.
 */
const QUERY = `query($owner: String!, $name: String!, $tasks: String!) {
	repository(owner: $owner, name: $name) {
		object(expression: $tasks) {
			... on Tree { entries { name object { ...text ... on Tree { entries { name object { ...text } } } } } }
		}
	}
}
fragment text on Blob { text isBinary isTruncated }`;

interface Blob {
	text?: string | null;
	isBinary?: boolean;
	isTruncated?: boolean;
	entries?: Entry[];
}

interface Entry {
	name: string;
	object: Blob | null;
}

interface Answer {
	data?: { repository?: { object?: { entries?: Entry[] } | null } | null } | null;
}

/**
 * The text of the files under `tasks/` at `branch`, by path from the repository
 * root. A file it could not read in full, binary or truncated, is left out, to
 * be read on its own; so is everything when GitHub answers without the tree.
 */
export async function readTaskTexts(
	ref: ForgeAddress,
	branch: string,
	token: string,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<Map<string, string>> {
	const variables = { owner: ref.owner, name: ref.name, tasks: `${branch}:tasks` };
	const response = await askGitHub(network, `${API}/graphql`, {
		signal,
		token,
		accept: 'application/json',
		body: JSON.stringify({ query: QUERY, variables })
	});
	const texts = new Map<string, string>();
	if (!response) return texts;

	const answer = (await readJson(response, 'GitHub')) as Answer;
	for (const entry of answer.data?.repository?.object?.entries ?? []) {
		const folder = `tasks/${entry.name}`;
		keep(texts, folder, entry.object);
		for (const inner of entry.object?.entries ?? []) {
			keep(texts, `${folder}/${inner.name}`, inner.object);
		}
	}
	return texts;
}

function keep(texts: Map<string, string>, path: string, blob: Blob | null): void {
	if (!blob || typeof blob.text !== 'string' || blob.isBinary || blob.isTruncated) return;
	texts.set(path, blob.text);
}
