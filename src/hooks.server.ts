import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Preloads the webfont along with the scripts and styles SvelteKit preloads by
 * default.
 *
 * The face is only discovered once the stylesheet is parsed, so without this
 * the text is laid out in the fallback and then again in JetBrains Mono. There
 * is no server to run this afterwards: it runs at build time, when the homepage
 * is prerendered and `404.html`, the shell every other route is served from, is
 * written, and the link stays in both.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { preload: ({ type }) => type === 'js' || type === 'css' || type === 'font' });
