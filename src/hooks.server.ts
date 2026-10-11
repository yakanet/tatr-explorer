import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Preloads the webfont along with the scripts and styles SvelteKit preloads.
 * Otherwise the browser finds the font only after parsing the stylesheet, and
 * lays the text out twice. It runs at build time, so the preload link is baked
 * into the prerendered homepage and into `404.html`, the shell every other
 * route is served from.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { preload: ({ type }) => type === 'js' || type === 'css' || type === 'font' });
