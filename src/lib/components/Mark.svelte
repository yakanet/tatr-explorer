<script lang="ts">
	// The logo, inline rather than an <img> so it takes the theme's accent and
	// costs no request. It is hidden from screen readers because the name always
	// sits beside it in text, and a label would be read twice.
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
		/* An SVG has no baseline, so a baseline-aligned row would use its bottom
		   edge. Centring it leaves the baseline to the text beside it. */
		align-self: center;
		color: var(--accent);
	}
</style>
