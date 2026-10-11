/**
 * A network that does not answer, for the specs: no forge, no dev server. It
 * fails the way the browser's own `fetch` does when nobody is there, with a
 * `TypeError` rather than a response.
 */
export const unreachable: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
