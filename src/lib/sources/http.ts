/**
 * Reading over HTTP, as the sources that have a server do: a forge's API and
 * CDN, and the dev server serving a folder.
 */
import { SourceError } from './contract.ts';

/** Encodes a path one segment at a time, so the slashes between them survive. */
export function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * One file as text, or null when it cannot be read: refused, missing, or the
 * network not answering. A read that threw would take the whole load down; one
 * task that cannot be read is listed as skipped instead.
 */
export async function readText(
	network: typeof fetch,
	url: string,
	signal?: AbortSignal
): Promise<string | null> {
	try {
		const response = await network(url, { signal });
		if (!response.ok) {
			return null;
		}
		return await response.text();
	} catch {
		return null;
	}
}

/**
 * A response's body as JSON, or a failure the page can explain: an answer that
 * does not parse is a malformed one, where the bare `SyntaxError` would show the
 * reader the parser's own words.
 */
export async function readJson(response: Response, who: string): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new SourceError('malformed', `${who} answered with something that is not JSON.`);
	}
}
