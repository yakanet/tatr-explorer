/** `one` when `count` is exactly one, `many` otherwise. */
export function plural(count: number, one: string, many: string): string {
	if (count === 1) return one;
	return many;
}

/** `count` followed by the word that agrees with it, such as `3 tasks`. */
export function counted(count: number, one: string, many: string): string {
	return `${count} ${plural(count, one, many)}`;
}
