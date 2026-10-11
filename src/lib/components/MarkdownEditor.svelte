<script lang="ts">
	// Edits Markdown with its syntax highlighted and a toolbar, and shows it
	// rendered on Preview. The editor loads the first time this appears, so a
	// reader who never edits never downloads it; should it fail to load, a plain
	// textarea stands in, so the text can still be edited. An image pasted or
	// dropped is handed to `onimage`, and its link goes in at the cursor.
	import { onMount, type Snippet } from 'svelte';
	import type { Button } from './markdown-editor.ts';

	interface Props {
		value: string;
		/** The field's name for a screen reader. */
		label: string;
		/** What Preview shows: the text rendered as the page will. */
		preview: Snippet;
		/**
		 * Keeps an image pasted or dropped, and returns its link; absent where
		 * images cannot be added.
		 */
		onimage?: (file: File) => string;
	}

	let { value = $bindable(), label, preview, onimage }: Props = $props();

	const id = $props.id();
	let container = $state<HTMLElement>();
	/** The toolbar's buttons, which come with the editor and define its elements. */
	let buttons = $state.raw<Button[]>([]);
	let failed = $state(false);
	let previewing = $state(false);

	/** Links the images pasted or dropped on the field; anything else is the browser's to handle. */
	function received(event: Event & { currentTarget: HTMLElement }, files: FileList | undefined) {
		const images = [...(files ?? [])].filter((file) => file.type.startsWith('image/'));
		const field = event.currentTarget.querySelector('textarea');
		if (!onimage || images.length === 0 || !field) return;
		event.preventDefault();
		field.focus();
		const links = images.map((image) => onimage(image)).join('\n');
		// The command keeps the editor's undo history, as the toolbar's insertions do.
		document.execCommand('insertText', false, links);
	}

	/** Lets files be dropped on the field, which the browser would otherwise open. */
	function dragged(event: DragEvent) {
		if (onimage && event.dataTransfer?.types.includes('Files')) event.preventDefault();
	}

	onMount(() => {
		let remove: (() => void) | undefined;
		let gone = false;
		import('./markdown-editor.ts')
			.then(({ BUTTONS, mountEditor }) => {
				if (gone || !container) return;
				remove = mountEditor(container, { value, id, label }, (text) => (value = text));
				buttons = BUTTONS;
			})
			.catch(() => (failed = true));
		return () => {
			gone = true;
			remove?.();
		};
	});
</script>

<div class="frame">
	<div class="bar">
		<div class="segmented quiet" role="radiogroup" aria-label="{label} view">
			<label
				><input type="radio" name="{id}-view" value={false} bind:group={previewing} />Write</label
			>
			<label
				><input type="radio" name="{id}-view" value={true} bind:group={previewing} />Preview</label
			>
		</div>
		{#if buttons.length > 0 && !previewing}
			<markdown-toolbar for={id} class="toolbar">
				{#each buttons as button (button.tag)}
					<svelte:element
						this={button.tag}
						class:group={button.group}
						aria-label={button.label}
						title={button.label}
					>
						<svg viewBox={button.icon.viewBox} width="1em" height="1em" aria-hidden="true"
							>{@html button.icon.body}</svg
						>
					</svelte:element>
				{/each}
			</markdown-toolbar>
		{/if}
	</div>

	<!-- Hidden rather than unmounted on Preview, so the editor keeps its undo history. -->
	<div
		class="field"
		role="group"
		hidden={previewing}
		onpaste={(event) => received(event, event.clipboardData?.files)}
		ondrop={(event) => received(event, event.dataTransfer?.files)}
		ondragover={dragged}
	>
		{#if failed}
			<textarea class="fallback" aria-label={label} bind:value></textarea>
		{:else}
			<div class="editor" bind:this={container}></div>
		{/if}
	</div>
	{#if previewing}
		<div class="preview">{@render preview()}</div>
	{/if}
</div>

<style>
	.frame {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		overflow: hidden;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		padding: 0.25rem 0.375rem;
		background: var(--tint);
		border-bottom: 1px solid var(--border);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
	}

	.toolbar > :global(*) {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		font-size: 1rem;
		color: var(--muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.toolbar > :global(.group) {
		margin-left: 0.5rem;
	}

	.toolbar > :global(*:hover) {
		color: var(--fg);
		background: var(--surface);
	}

	.editor,
	.fallback,
	.preview {
		min-height: 18rem;
	}

	.fallback {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 0.75rem;
		font: inherit;
		font-family: var(--font-mono);
		color: var(--fg);
		background: none;
		border: none;
	}

	.preview {
		padding: 0.75rem 1rem;
	}
</style>
