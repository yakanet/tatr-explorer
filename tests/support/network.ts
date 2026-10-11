/** A `fetch` that reaches nobody, rejecting with a `TypeError` as the browser's does. */
export const unreachable: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
