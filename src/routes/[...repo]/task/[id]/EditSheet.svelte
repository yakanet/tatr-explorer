<script lang="ts">
	// Edits a task's title and description. The page holds the draft, whose
	// status, priority and tags the properties panel edits, and decides what
	// Save and Cancel do.
	import type { RenderOptions } from '#lib/render/markdown.ts';
	import type { TaskFields } from '#lib/tatr/task-fields.ts';
	import Journal from './Journal.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		fields: TaskFields;
		/** Whether Save has something to write, and a source that writes. */
		saveable: boolean;
		saving: boolean;
		/** Whether the task changed on disk since the sheet was opened. */
		moved: boolean;
		options: RenderOptions;
		onsave: () => void;
		oncancel: () => void;
	}

	let {
		fields = $bindable(),
		saveable,
		saving,
		moved,
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
</script>

<svelte:window onkeydown={keyed} />

<article class="panel">
	<input class="title" aria-label="Title" bind:value={fields.title} />

	<MarkdownEditor bind:value={fields.description} label="Description">
		{#snippet preview()}
			<Journal body={fields.description} {options} />
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
