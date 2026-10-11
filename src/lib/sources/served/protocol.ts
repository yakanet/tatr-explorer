/**
 * What the two halves of the served source agree on: the dev server's routes,
 * the event it pushes and how a version of a file is named. Neither Node nor
 * the browser in here, only what both have, so both can import it, and the
 * listing route answers the `Listing` any source does.
 */

/** Where the dev server answers for the folder, under its root. */
export const ROUTES = '__tatr/served';

/** Pushed over Vite's dev channel when the folder moved. */
export const CHANGED = 'tatr:served-changed';

/**
 * The version of a file's text, which a write names as the one it replaces, in
 * `If-Match`: a digest rather than a size and a date, which an edit can keep
 * both of. Of the text rather than the bytes, which is what the page holds:
 * the server decodes the file as the browser did, so a byte order mark, which
 * the browser drops, compares equal on both sides.
 */
export async function tagOf(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return `"${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}"`;
}
