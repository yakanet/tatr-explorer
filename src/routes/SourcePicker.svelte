<script lang="ts">
	// Offers the two ways in: a repository, typed or pasted, and a folder on this
	// machine.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderPicker from '#lib/components/FolderPicker.svelte';
	import { formatRepoPath, parseRepoInput } from '#lib/repo/ref.ts';
	import { folderAccess } from '#lib/sources/local/folder.ts';

	/** The two places a reader can open tasks from, in tab order. */
	const WHERE = [
		{ id: 'remote', name: 'A repository' },
		{ id: 'local', name: 'A folder' }
	] as const;

	let where = $state<(typeof WHERE)[number]['id']>('remote');
	/**
	 * The folder access this browser offers, read once. The prerendered HTML
	 * never shows a wrong answer, because the local panel renders only after a
	 * click.
	 */
	const access = folderAccess();
	let input = $state('');
	let error = $state<string | null>(null);

	/** The step an arrow key takes along the tabs, or 0 for any other key. */
	function stepOf(key: string) {
		if (key === 'ArrowRight') return 1;
		if (key === 'ArrowLeft') return -1;
		return 0;
	}

	/** Moves between tabs with the arrow keys, as the ARIA tab pattern expects. */
	function move(event: KeyboardEvent) {
		const step = stepOf(event.key);
		if (step === 0) return;
		event.preventDefault();
		const at = WHERE.findIndex((option) => option.id === where);
		const next = WHERE[(at + step + WHERE.length) % WHERE.length];
		where = next.id;
		// The focus follows the selection, as it does in a tab list.
		document.getElementById(`tab-${next.id}`)?.focus();
	}

	/** Puts only the selected tab in the tab order, since the arrow keys move between tabs. */
	function tabindexOf(id: string) {
		if (where === id) return 0;
		return -1;
	}

	function open(event: SubmitEvent) {
		event.preventDefault();
		const ref = parseRepoInput(input);
		if (!ref) {
			error = 'Expected owner/name, or the URL of a repository.';
			return;
		}
		error = null;
		goto(resolve('/[...repo]', { repo: formatRepoPath(ref) }));
	}
</script>

<!-- The two ways in are tabs, shown one at a time, because each needs a line
     of explanation and stacked they read as one crowded instruction. -->
<div class="segmented tabs" role="tablist" aria-label="Where the tasks are">
	{#each WHERE as option (option.id)}
		<button
			type="button"
			role="tab"
			id="tab-{option.id}"
			aria-selected={where === option.id}
			aria-controls="panel-{option.id}"
			tabindex={tabindexOf(option.id)}
			onclick={() => (where = option.id)}
			onkeydown={move}
		>
			{option.name}
		</button>
	{/each}
</div>

{#if where === 'remote'}
	<div role="tabpanel" id="panel-remote" aria-labelledby="tab-remote">
		<form onsubmit={open}>
			<span class="field input-pill">
				<svg
					class="glyph"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4.3-4.3" /></svg
				>
				<input
					bind:value={input}
					placeholder="owner/name"
					aria-label="Repository"
					data-key-search
					autocapitalize="off"
					autocorrect="off"
					autocomplete="off"
					spellcheck="false"
				/>
			</span>
			<button type="submit" class="action primary">Open</button>
		</form>

		<!-- The line lists the four forms the parser accepts. It names GitHub
		     because the parser reads a remote on any host but only GitHub is
		     supported. -->
		<p class="accepts">
			Accepts <code>owner/name</code>, a GitHub URL or SSH remote, or
			<code>owner/name@branch</code>.
		</p>

		{#if error}
			<p class="error">{error}</p>
		{/if}
	</div>
{:else}
	<!-- A folder covers the repository a public URL cannot reach: the one being
	     worked in. -->
	<div role="tabpanel" id="panel-local" aria-labelledby="tab-local">
		{#if access === 'none'}
			<p class="accepts">
				This browser cannot open a folder: it has neither the File System Access API nor directory
				selection. A repository still works.
			</p>
		{:else}
			<div class="local">
				<FolderPicker />
				<span class="hint">private, unpushed, offline: whatever is checked out right now</span>
			</div>
			<!-- The text announces what the browser will ask, which depends on its
			     folder access, because an unexpected dialog reads as a warning
			     about this site. -->
			{#if access === 'picker'}
				<p class="accepts">
					Your browser will ask for access to that one folder, and <strong>Refresh</strong> will reread
					it. Nothing is uploaded: there is no server to upload to.
				</p>
			{:else}
				<p class="accepts">
					Picking a folder makes your browser count its files first. Choose just the
					<code>tasks/</code> folder to keep that number small, or drop the folder here instead. Nothing
					is uploaded: there is no server to upload to.
				</p>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.tabs {
		margin-bottom: 1rem;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.field {
		position: relative;
		flex: 1 1 16.125rem;
		display: flex;
		align-items: center;
	}

	.glyph {
		width: 1rem;
		height: 1rem;
		margin: 0 0.5rem 0 1rem;
		color: var(--muted);
	}

	.field input {
		flex-grow: 1;
		min-width: 0;
		min-height: var(--target);
		padding: 0 1rem 0 0;
	}

	.accepts {
		margin: 0.75rem 0 0;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--muted);
	}

	.local {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.local .hint {
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.error {
		margin: 0.75rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}
</style>
