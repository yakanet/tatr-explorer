/**
 * Which of the four tints a tag is drawn on, decided by its name alone.
 *
 * A hue that followed rank, count or the filter would repaint a tag whenever
 * another was added, while a hue exists to recognise a tag at a glance, in
 * every repository. FNV-1a over the UTF-8 bytes is short, needs no dependency
 * and spreads short words well. Four buckets collide, which is acceptable
 * because the tag's name is always printed beside its hue.
 */
export type TagHue = 1 | 2 | 3 | 4;

export function tagHue(name: string): TagHue {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(name)) {
		hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
	}
	return ((hash % 4) + 1) as TagHue;
}
