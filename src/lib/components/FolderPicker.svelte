<script lang="ts">
	// Opens a folder on the reader's machine, through whichever API the browser
	// has: `showDirectoryPicker`, the directory input, or a drop.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { canDropFolder, droppedFolder } from '#lib/sources/local/drop.ts';
	import { folderAccess, fromFileList, type LocalFolder } from '#lib/sources/local/folder.ts';
	import { fromWayBack, LOCAL_PATH, openFolder, type WayBack } from '#lib/sources/local/source.ts';

	interface Props {
		label?: string;
	}

	let { label = 'Open a folder…' }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let error = $state<string | null>(null);
	/**
	 * Non-zero while files are dragged over the window. A count rather than a
	 * boolean, because `dragleave` fires on entering every child element and a
	 * boolean would flicker.
	 */
	let over = $state(0);

	/** Whether a drag carries files, unlike a dragged text selection or link. */
	const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

	/** The picker is Chromium only, and must be called from a real click. */
	const hasPicker = folderAccess() === 'picker';
	const droppable = canDropFolder();

	async function opened(folder: LocalFolder | null, back?: WayBack) {
		if (!folder) {
			error = 'That folder could not be read.';
			return;
		}
		error = null;
		openFolder(folder, back);
		await goto(resolve('/[...repo]', { repo: LOCAL_PATH }), { refreshAll: true });
	}

	/** Opens a folder that has a way back, so a refresh rereads it. */
	async function openBack(back: WayBack) {
		await opened(await fromWayBack(back), back);
	}

	async function pick() {
		if (!hasPicker) {
			input?.click();
			return;
		}
		try {
			await openBack(await window.showDirectoryPicker!({ mode: 'read' }));
		} catch (thrown) {
			// Cancelling the dialog throws, and cancelling is not an error.
			if (thrown instanceof DOMException && thrown.name === 'AbortError') return;
			error = 'That folder could not be read.';
		}
	}

	function chosen(event: Event) {
		const files = (event.currentTarget as HTMLInputElement).files;
		const folder = files && fromFileList(files);
		if (!folder) {
			error = 'Choose a folder, not files inside one.';
			return;
		}
		opened(folder);
	}

	function entered(event: DragEvent) {
		if (!droppable || !carriesFiles(event)) return;
		over += 1;
	}

	function left(event: DragEvent) {
		if (!droppable) return;
		// No related target means the pointer left the window, not an element.
		if (event.relatedTarget === null) over = 0;
		else over = Math.max(0, over - 1);
	}

	/**
	 * Accepts a file drag anywhere in the window. Without `preventDefault` on
	 * `dragover` the drop is refused, and the browser navigates to the dropped
	 * folder, leaving the page.
	 */
	function hovered(event: DragEvent) {
		if (droppable && carriesFiles(event)) event.preventDefault();
	}

	async function dropped(event: DragEvent) {
		if (!droppable) return;
		event.preventDefault();
		over = 0;

		try {
			const folder = await droppedFolder(event.dataTransfer?.items ?? []);
			if (!folder) {
				error = 'Drop a folder, not a file.';
				return;
			}

			await openBack(folder);
		} catch {
			// Without this, a rejected drop would do nothing and say nothing.
			error = 'That folder could not be read.';
		}
	}
</script>

<!-- The drop target is the whole window rather than a box beside the button:
     the largest target, taking no space until a drag starts. -->
<svelte:window ondragenter={entered} ondragleave={left} ondragover={hovered} ondrop={dropped} />

<span class="offer">
	<button type="button" class="action" onclick={pick}>{label}</button>
	{#if droppable}
		<span class="hint">or drop one anywhere</span>
	{/if}
</span>

{#if over > 0}
	<div class="veil">
		<p>
			<strong>Drop a folder to open it</strong>
			<span>nothing is uploaded: it is read where it sits</span>
		</p>
	</div>
{/if}

<input
	bind:this={input}
	type="file"
	webkitdirectory
	multiple
	tabindex="-1"
	aria-hidden="true"
	onchange={chosen}
/>

{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	.offer {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}

	.veil {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		/* Its children must not take drag events, or entering one would fire
		   `dragleave` and the veil would blink. */
		pointer-events: none;
	}

	.veil p {
		display: grid;
		gap: 0.4rem;
		justify-items: center;
		margin: 0;
		padding: 3rem 4rem;
		text-align: center;
		border: 2px dashed var(--accent);
		border-radius: var(--radius-xl);
		background: var(--surface);
		box-shadow: var(--shadow-menu);
	}

	.veil strong {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
	}

	.veil span {
		font-size: 0.875rem;
		color: var(--ink-2);
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--muted);
	}

	/* The fallback for browsers without a picker, clicked through the button
	   because a file input cannot be styled. */
	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.error {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}
</style>
