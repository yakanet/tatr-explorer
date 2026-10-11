<script lang="ts">
	// Shows a task's status, priority, creation date and title, then its
	// description and the entries appended to it.
	import {
		renderInline,
		renderMarkdown,
		splitJournal,
		type RenderOptions
	} from '#lib/render/markdown.ts';
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		task: Task;
		/** The description, or null until it is read. */
		body: string | null;
		loadingBody: boolean;
		/** How this task's title and description render. */
		options: RenderOptions;
	}

	let { task, body, loadingBody, options }: Props = $props();

	const entries = $derived.by(() => {
		if (body === null) return [];
		return splitJournal(body);
	});

	/** Formats an instant to the minute, as `2026-10-11 17:28`, in UTC like the ids. */
	function formatMinute(date: Date): string {
		return date.toISOString().slice(0, 16).replace('T', ' ');
	}
</script>

<article class="panel">
	<div class="meta">
		<span class="status" class:closed={task.closed}>{task.status}</span>
		<span class="prio">priority {task.priority}</span>
		{#if task.created}
			<span class="muted">·</span>
			<span class="muted">
				created {formatMinute(task.created)} UTC
			</span>
		{/if}
	</div>

	<h1>{@html renderInline(task.title, options)}</h1>

	{#if task.malformed}
		<p class="warning">
			This file does not start with <code>#</code>, so the reference parser abandons its properties
			entirely. It is shown as it was read.
		</p>
	{/if}

	{#if loadingBody}
		<p class="muted">Reading the body…</p>
	{:else if entries.length === 0}
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
</article>

<style>
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.6rem;
		font-size: 0.8125rem;
		margin-bottom: 0.875rem;
	}

	/* The status pill takes the accent while open and grey once closed, so the
	   tint agrees with the word. */
	.status {
		display: inline-flex;
		align-items: center;
		height: 1.625rem;
		padding: 0 0.75rem;
		font-weight: 700;
		color: var(--accent-text);
		background: var(--accent-wash);
		border-radius: var(--radius-full);
	}

	.status.closed {
		color: var(--ink-2);
		background: var(--tint);
	}

	.panel {
		padding: 1.5rem 1.75rem;
	}

	h1 {
		margin: 0 0 1.5rem;
		font-size: 1.375rem;
		line-height: 1.35;
		font-weight: 700;
		letter-spacing: -0.01em;
		text-wrap: pretty;
	}

	.journal {
		display: flex;
		flex-direction: column;
	}

	/*
	 * A body is a journal: the description, then each entry appended after a
	 * `---`. A bullet marks where each entry starts and a rule joins them, so the
	 * shape shows entries added over time.
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

	.warning {
		font-size: 0.8125rem;
		color: var(--warning);
	}
</style>
