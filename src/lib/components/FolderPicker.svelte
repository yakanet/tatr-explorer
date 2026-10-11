<script lang="ts">
	// Opens a folder on the reader's machine, through whichever API the browser
	// has. `showDirectoryPicker` gives a handle, and a drop gives a handle on
	// Chromium or an entry tree elsewhere: both can be walked again, so a refresh
	// rereads the folder and the reading can follow it. The directory input gives
	// a flat list, once. The entry API behind a drop exists where the picker does
	// not, so a browser without the picker can still open a folder it rereads.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		canDropFolder,
		folderAccess,
		fromDirectoryHandle,
		fromFileList,
		fromWayBack,
		type LocalFolder,
		type WayBack
	} from '#lib/sources/local/folder.ts';
	import { LOCAL_PATH, openFolder } from '#lib/sources/local/source.ts';

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

	async function pick() {
		if (!hasPicker) {
			input?.click();
			return;
		}
		try {
			const handle = await window.showDirectoryPicker!({ mode: 'read' });
			await opened(await fromDirectoryHandle(handle), handle);
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

	/** Reads each dropped item as a handle where the browser has them, or as an entry. */
	function handlesOrEntries(items: DataTransferItem[]) {
		if (items.some((item) => typeof item.getAsFileSystemHandle === 'function')) {
			return items.map((item) => item.getAsFileSystemHandle!());
		}
		return items.map((item) => item.webkitGetAsEntry());
	}

	/** Whether a dropped handle or entry is a folder. */
	function isFolder(one: FileSystemHandle | FileSystemEntry) {
		if ('kind' in one) return one.kind === 'directory';
		return one.isDirectory;
	}

	async function dropped(event: DragEvent) {
		if (!droppable) return;
		event.preventDefault();
		over = 0;

		// Read the items before any await, because the browser empties the list
		// once this handler returns.
		const items = [...(event.dataTransfer?.items ?? [])];
		const pending = handlesOrEntries(items);

		try {
			// The spec answers null for an item that is not a file, and Chrome
			// answers `undefined` for one a script made, so any falsy value is skipped.
			const folder = (await Promise.all(pending)).find(
				(one): one is WayBack => !!one && isFolder(one)
			);
			if (!folder) {
				error = 'Drop a folder, not a file.';
				return;
			}

			await opened(await fromWayBack(folder), folder);
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
