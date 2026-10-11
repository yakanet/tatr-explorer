/**
 * The name of the folder the dev server serves, or false.
 *
 * Read here and nowhere else, so that a spec can say which, and here rather
 * than in the served source's folder, as parsing a reference needs it too. The
 * value is pasted in at compile time by the plugin in
 * `sources/served/folder.server.ts`, and the bundler folds a false away with
 * whatever it guards.
 */
export const SERVED: string | false = __TATR_SERVED__;
