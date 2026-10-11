<script lang="ts">
	// The arrow that shows a kind of link, in its colour, in a card's list and in
	// the key above the cards.
	interface Props {
		kind: keyof typeof GLYPH;
		/** What the arrow means, read out and shown on hover; none where words beside it say so. */
		say?: string;
	}

	let { kind, say }: Props = $props();

	const GLYPH = { in: '←', out: '→', both: '⇄', self: '↺' } as const;
</script>

<!-- The arrow and its #if share a line: a line break between them renders as a
     space after the arrow. -->
<span class="glyph {kind}" title={say} aria-hidden={!say}>
	{GLYPH[kind]}{#if say}<span class="sr">{say}:</span>{/if}
</span>

<style>
	.glyph {
		margin-right: 0.4rem;
		font-weight: 700;
	}

	/* The `.in` arrow takes `--accent-text`, as `--link-in`, the drawing's shade,
	   is too light for text; the others read as text unchanged. */
	.in {
		color: var(--accent-text);
	}

	.out {
		color: var(--link-out);
	}

	.both,
	.self {
		color: var(--link-both);
	}
</style>
