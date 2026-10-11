// A script rather than a module, as a module cannot declare a module by pattern.

/** One icon of an Iconify set, which `src/lib/icons.server.ts` resolves at build time. */
declare module 'virtual:icons/*.svg' {
	const icon: { viewBox: string; body: string };
	export default icon;
}
