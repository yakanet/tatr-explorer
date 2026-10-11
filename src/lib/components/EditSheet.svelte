<script lang="ts">
	// Edits a task's title and description, or a new task's, with the files
	// pasted or dropped into it. The page holds the sheet, whose status,
	// priority and tags the properties panel edits, and decides what Save and
	// Cancel do.
	import { onDestroy } from 'svelte';
	import type { RenderOptions } from '#lib/render/markdown.ts';
	import type { Sheet } from '#lib/state/sheet.svelte.ts';
	import Journal from './Journal.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		sheet: Sheet;
		/** Whether Save has something to write, and a source that writes. */
		saveable: boolean;
		saving: boolean;
		/** Whether the task changed on disk since the sheet was opened. */
		moved?: boolean;
		/** The title Save writes when the field is left empty, shown in it. */
		untitled?: string;
		options: RenderOptions;
		onsave: () => void;
		oncancel: () => void;
	}

	let {
		sheet,
		saveable,
		saving,
		moved = false,
		untitled,
		options,
		onsave,
		oncancel
	}: Props = $props();

	/** Saves on Cmd-S or Ctrl-S, which would otherwise save the page itself. */
	function keyed(event: KeyboardEvent) {
		if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		if (saveable) onsave();
	}

	// The sheet is shown for as long as it is open, so its files go with it.
	onDestroy(() => sheet.close());
</script>

<svelte:window onkeydown={keyed} />

<article class="panel">
	<input class="title" aria-label="Title" placeholder={untitled} bind:value={sheet.draft.title} />

	<MarkdownEditor bind:value={sheet.draft.description} label="Description" onfile={sheet.attach}>
		{#snippet preview()}
			<Journal body={sheet.draft.description} options={sheet.preview(options)} />
		{/snippet}
	</MarkdownEditor>

	{#if moved}
		<p class="moved">
			This task changed on disk since editing began. Saving writes only what you changed, and
			refuses a field changed there too.
		</p>
	{/if}

	<div class="actions">
		<button
			type="button"
			class="action primary"
			disabled={!saveable || saving}
			aria-busy={saving}
			onclick={onsave}
		>
			Save
		</button>
		<button type="button" class="action" onclick={oncancel}>Cancel</button>
	</div>
</article>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem 1.75rem;
	}

	/* The title field reads as the heading it edits. */
	.title {
		padding: 0.35rem 0.6rem;
		margin-inline: -0.6rem;
		font: inherit;
		font-size: 1.375rem;
		line-height: 1.35;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--fg);
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
	}

	.title:hover,
	.title:focus {
		border-color: var(--border);
	}

	.moved {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--warning);
	}

	.actions {
		display: flex;
		gap: 0.75rem;
	}
</style>
