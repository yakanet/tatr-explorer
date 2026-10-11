/**
 * What the two halves of the served source share: the routes, the change event
 * and the version tag of a file. It uses only what both Node and the browser
 * have, so both can import it.
 */

/** Where the dev server answers for the folder, under its root. */
export const ROUTES = '__tatr/served';

/** Pushed over Vite's dev channel when the folder moved. */
export const CHANGED = 'tatr:served-changed';

/**
 * The version tag of a file's text, which a write sends in `If-Match`. A digest,
 * as an edit can keep both the size and the date. Of the text rather than the
 * bytes, because the page holds text: the server decodes the file as the
 * browser does, so a byte order mark the browser drops still compares equal.
 */
export async function tagOf(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return `"${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}"`;
}
