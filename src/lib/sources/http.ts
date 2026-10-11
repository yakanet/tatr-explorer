/** Helpers for the sources read over HTTP: a forge's API and CDN, and the dev server. */
import { SourceError } from './contract.ts';

/** Encodes a path one segment at a time, so the slashes between them survive. */
export function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

/** One file as text, or null when it is refused, missing, or the network fails. */
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
 * A response's body as JSON. A body that does not parse throws a `malformed`
 * `SourceError`, so the reader sees a sentence rather than the parser's words.
 */
export async function readJson(response: Response, who: string): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new SourceError('malformed', `${who} answered with something that is not JSON.`);
	}
}
