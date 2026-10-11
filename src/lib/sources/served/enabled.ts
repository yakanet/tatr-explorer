/**
 * The name of the folder the dev server serves, or false.
 *
 * Read here and nowhere else, so that a spec can say which. The value is pasted
 * in at compile time by the plugin in `folder.server.ts`, and the bundler
 * folds a false away with whatever it guards: the kind is registered only when
 * a folder is served, and a build carries none of it.
 */
export const SERVED: string | false = __TATR_SERVED__;
