<script lang="ts">
	// Opens a folder on the reader's machine, by whichever door the browser has.
	//
	// Three of them, and what separates them is what they hand back rather than
	// what they ask. A dropped folder or `showDirectoryPicker` gives a handle,
	// which can be walked again, so a refresh is a real reread; the directory
	// input gives a flat list, once. Dropping is the widest door (the legacy
	// entry API behind it exists where the picker does not), so a browser without
	// the picker still has one way to a folder it can reread.
	//
	// Whichever answered, the reader clicked or dropped: they have no interest in
	// which API it was.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		canDropFolder,
		folderAccess,
		fromDirectoryEntry,
		fromDirectoryHandle,
		fromFileList,
		type LocalFolder
	} from '#lib/sources/local/folder.ts';
	import { openFolder } from '#lib/sources/local/kind.ts';

	let { label = 'Open a folder…' }: { label?: string } = $props();

	let input = $state<HTMLInputElement | null>(null);
	let error = $state<string | null>(null);
	/**
	 * Whether a folder is being dragged over the window.
	 *
	 * Counted rather than set, because `dragleave` fires on the way into every
	 * child element and a boolean would flicker off under the cursor. Leaving
	 * the window is the one `dragleave` with no `relatedTarget`, which is what
	 * resets the count rather than decrementing it.
	 */
	let over = $state(0);

	/** A dragged text selection or link is not an offer of a folder. */
	const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

	/** The picker is Chromium only, and must be called from a real click. */
	const hasPicker = folderAccess() === 'picker';
	const droppable = canDropFolder();

	async function opened(folder: LocalFolder | null, handle?: FileSystemDirectoryHandle) {
		if (!folder) {
			error = 'That folder could not be read.';
			return;
		}
		error = null;
		openFolder(folder, handle);
		await goto(resolve('/[...repo]', { repo: 'local' }), { refreshAll: true });
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
		over = event.relatedTarget === null ? 0 : Math.max(0, over - 1);
	}

	/**
	 * Answering `dragover` is what makes a drop possible; not answering it is
	 * also what makes the browser *navigate* to the dropped folder, leaving the
	 * page. So the whole window answers, whether or not the offer is showing.
	 */
	function hovered(event: DragEvent) {
		if (droppable && carriesFiles(event)) event.preventDefault();
	}

	async function dropped(event: DragEvent) {
		if (!droppable) return;
		event.preventDefault();
		over = 0;

		// Read out of the transfer before anything is awaited: the item list is
		// emptied when this event's turn ends, so awaiting first finds nothing.
		const items = [...(event.dataTransfer?.items ?? [])];
		const asHandles = items.some((item) => typeof item.getAsFileSystemHandle === 'function');
		const pending = asHandles
			? items.map((item) => item.getAsFileSystemHandle!())
			: items.map((item) => item.webkitGetAsEntry());

		try {
			// Anything falsy: the API is specified to answer null for an item that
			// is not a file, and Chrome answers `undefined` for one a script made.
			// Either way there is no folder in it.
			const folder = (await Promise.all(pending)).find(
				(one): one is FileSystemDirectoryHandle | FileSystemDirectoryEntry =>
					!!one && ('kind' in one ? one.kind === 'directory' : one.isDirectory)
			);
			if (!folder) {
				error = 'Drop a folder, not a file.';
				return;
			}

			if ('kind' in folder) await opened(await fromDirectoryHandle(folder), folder);
			else await opened(await fromDirectoryEntry(folder));
		} catch {
			// A rejection here is what silence looks like: without this the reader
			// drops a folder, nothing happens, and nothing says why.
			error = 'That folder could not be read.';
		}
	}
</script>

<!-- The target is the window, not a rectangle beside the button. A dashed box
     is decoration while nobody is dragging, and too small a thing to aim at the
     moment somebody is; this way it is the largest target the page can offer
     and costs no pixels until it is wanted. -->
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
		/* Nothing inside it may take the drag events: a child would answer
		   `dragleave` on the way in and the veil would blink. */
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

	/* Present for the browsers without a picker, and never the thing clicked:
	   a file input cannot be styled, and the button above it can. */
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
