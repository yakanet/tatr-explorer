/**
 * Reading files over HTTP, as the sources that have a server do: a forge's CDN,
 * and the dev server serving a folder.
 */

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
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	}
}
