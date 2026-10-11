/**
 * What the two halves of the served source agree on: the dev server's routes
 * and the event it pushes. Neither Node nor the browser in here, so both can
 * import it, and the listing route answers the `Listing` any source does.
 */

/** Where the dev server answers for the folder, under its root. */
export const ROUTES = '__tatr/served';

/** Pushed over Vite's dev channel when the folder moved. */
export const CHANGED = 'tatr:served-changed';
