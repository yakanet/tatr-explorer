<script lang="ts">
	// Renders a task's body as a journal: the description, then each entry
	// appended after a `---`. The reading sheet and the editing sheet's preview
	// both show it.
	import { renderMarkdown, splitJournal, type RenderOptions } from '#lib/render/markdown.ts';

	interface Props {
		body: string;
		options: RenderOptions;
	}

	let { body, options }: Props = $props();

	const entries = $derived(splitJournal(body));
</script>

{#if entries.length === 0}
	<p class="muted">No description.</p>
{:else}
	<div class="journal">
		{#each entries as entry, index (index)}
			<div class="entry" class:first={index === 0} class:last={index === entries.length - 1}>
				<span class="bullet"></span>
				<div class="prose">{@html renderMarkdown(entry, options)}</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.journal {
		display: flex;
		flex-direction: column;
	}

	/*
	 * A bullet marks where each entry starts and a rule joins them, so the shape
	 * shows entries added over time.
	 *
	 * All bullets share one colour, because a colour with no meaning still asks
	 * to be decoded. Entries are not dated: no journal entry in tsoding/tatr
	 * carries a date.
	 */
	.entry {
		display: flex;
		gap: 1rem;
		position: relative;
		/* A bullet's centre: its top margin plus half its height. */
		--bullet-mid: calc(0.65rem + 3.5px);
	}

	/* The rule runs the height of every entry, so it reaches the end of the text
	   rather than stopping at the last bullet, which looks unfinished after a
	   long entry. It starts at the first bullet's centre, since nothing precedes
	   it. */
	.entry::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 3px;
		width: 1px;
		/* The rule takes the bullets' colour because `--border` disappears against
		   the card in dark mode. At 1px beside a 7px dot it still reads lighter. */
		background: var(--baseline);
	}

	.entry.first::before {
		top: var(--bullet-mid);
	}

	/* A single entry gets no rule, because a line beside one block reads as a
	   quotation rather than a journal. */
	.entry.first.last::before {
		display: none;
	}

	.bullet {
		flex-shrink: 0;
		width: 7px;
		height: 7px;
		margin-top: 0.65rem;
		border-radius: 50%;
		background: var(--baseline);
		/* The bullet sits above the rule, and its ring hides the rule behind it. */
		position: relative;
		z-index: 1;
		box-shadow: 0 0 0 3px var(--surface);
	}

	/* The description wraps at the width of a TASK.md line in an editor rather
	   than at the card's, to keep lines readable. */
	.prose {
		flex-grow: 1;
		max-width: 72ch;
		font-size: 0.875rem;
		line-height: 1.7;
		min-width: 0;
	}

	/* Links in the description are underlined as well as coloured, so they are
	   not told apart by hue alone. */
	.prose :global(a) {
		color: var(--accent-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.prose :global(p) {
		margin: 0 0 0.9rem;
		text-wrap: pretty;
	}

	.prose :global(pre) {
		background: var(--tint);
		border-radius: var(--radius-md);
		padding: 0.85rem 1rem;
		overflow-x: auto;
		font-size: 0.8125rem;
	}

	.prose :global(img) {
		max-width: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
</style>
