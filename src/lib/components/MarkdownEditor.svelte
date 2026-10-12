<script lang="ts">
	// Edits Markdown with its syntax highlighted and a toolbar, and shows it
	// rendered on Preview. The editor loads the first time this appears, so a
	// reader who never edits never downloads it; should it fail to load, a plain
	// textarea stands in, so the text can still be edited. A file pasted or
	// dropped is handed to `onfile`, and its link goes in at the cursor.
	import { onMount, type Snippet } from 'svelte';
	import type { Button } from './markdown-editor.ts';

	interface Props {
		value: string;
		/** The field's name for a screen reader. */
		label: string;
		/** What Preview shows: the text rendered as the page will. */
		preview: Snippet;
		/**
		 * Keeps a file pasted or dropped, and returns its link; absent where files
		 * cannot be added.
		 */
		onfile?: (file: File) => string;
	}

	let { value = $bindable(), label, preview, onfile }: Props = $props();

	const id = $props.id();
	let container = $state<HTMLElement>();
	/** The toolbar's buttons, which come with the editor and define its elements. */
	let buttons = $state.raw<Button[]>([]);
	let failed = $state(false);
	let previewing = $state(false);
	/** True while files are dragged over the field, which then says it takes them. */
	let dropping = $state(false);

	/** Links the files pasted or dropped on the field; pasted text is the browser's to handle. */
	function received(event: Event & { currentTarget: HTMLElement }, files: FileList | undefined) {
		dropping = false;
		const field = event.currentTarget.querySelector('textarea');
		if (!onfile || !files?.length || !field) return;
		event.preventDefault();
		field.focus();
		const links = [...files].map((file) => onfile(file)).join('\n');
		// The command keeps the editor's undo history, as the toolbar's insertions do.
		document.execCommand('insertText', false, onOwnLines(field, links));
	}

	/** `links` with the line feeds that keep them off the text around the selection. */
	function onOwnLines(field: HTMLTextAreaElement, links: string): string {
		const before = field.value.slice(0, field.selectionStart);
		const after = field.value.slice(field.selectionEnd);
		return (
			lineFeedUnless(!before || before.endsWith('\n')) +
			links +
			lineFeedUnless(!after || after.startsWith('\n'))
		);
	}

	function lineFeedUnless(atLineEdge: boolean): string {
		if (atLineEdge) return '';
		return '\n';
	}

	/** Clears the outline once the drag leaves the field, not when it moves onto a child of it. */
	function left(event: DragEvent & { currentTarget: HTMLElement }) {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dropping = false;
	}

	/** Lets files be dropped on the field, which the browser would otherwise open. */
	function dragged(event: DragEvent) {
		dropping = Boolean(onfile && event.dataTransfer?.types.includes('Files'));
		if (dropping) event.preventDefault();
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
		class:dropping
		role="group"
		hidden={previewing}
		onpaste={(event) => received(event, event.clipboardData?.files)}
		ondrop={(event) => received(event, event.dataTransfer?.files)}
		ondragover={dragged}
		ondragleave={left}
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

	/* A file dragged over the field is outlined in the accent, as it will be taken. */
	.field.dropping {
		outline: 2px dashed var(--accent);
		outline-offset: -4px;
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
