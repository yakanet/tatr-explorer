/**
 * The name of the folder the dev server serves, or false. The plugin in
 * `folder.server.ts` defines it at compile time, and the bundler drops what a
 * false guards. Read in this module alone, so a spec can mock it.
 */
export const SERVED: string | false = __TATR_SERVED__;
