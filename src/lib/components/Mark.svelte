<script lang="ts">
	// The logo, inline rather than an <img>, so it takes the accent from the
	// theme it is drawn in and needs no request of its own. It always sits beside
	// the name in text, so it is hidden from screen readers rather than labelled:
	// a label would have them read the name twice.
	let { size = 22 }: { size?: number } = $props();
</script>

<svg
	viewBox="0 0 32 32"
	width={size}
	height={size}
	aria-hidden="true"
	fill="none"
	stroke="currentColor"
	stroke-width="3.2"
	stroke-linecap="round"
>
	<path d="M6 8h20" />
	<path d="M6 16h14" />
	<path d="M6 24h6" />
	<circle cx="24" cy="24" r="4" />
</svg>

<style>
	svg {
		display: block;
		flex-shrink: 0;
		/* A drawing has no baseline, so a row aligning on one would take this
		   element's bottom edge for the whole line's — the text beside it then
		   hangs wherever that edge happens to fall. Sitting out of the baseline
		   group leaves the text to define it, and centring lands the artwork on
		   the cap height of the word next to it. */
		align-self: center;
		color: var(--accent);
	}
</style>
