import type { Source } from '#lib/sources/contract.ts';

/** `source`, narrowed to the capability `is` checks, or a throw when it lacks it. */
export function having<T>(
	source: Source,
	is: (source: Source) => source is Source & T
): Source & T {
	if (!is(source)) throw new Error(`${source.label} lacks what ${is.name} asks for`);
	return source;
}
