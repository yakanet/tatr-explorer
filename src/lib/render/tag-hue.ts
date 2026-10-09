/**
 * Which of the four tints a tag is drawn on.
 *
 * Decided by the name alone, never by rank, count or the current filter: a
 * colour that followed the data would repaint a tag the moment another one was
 * added, and the reader would lose the one thing a hue is for, recognising a
 * tag at a glance from one page to the next. The same name gets the same hue in
 * every repository.
 *
 * FNV-1a over the UTF-8 bytes, because it is a few lines, has no dependency and
 * spreads short words well enough; four buckets mean collisions, which is
 * acceptable because the name is always printed — the hue helps the eye, it
 * never carries the meaning on its own.
 */
export type TagHue = 1 | 2 | 3 | 4;

export function tagHue(name: string): TagHue {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(name)) {
		hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
	}
	return ((hash % 4) + 1) as TagHue;
}
