<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderPicker from '#lib/components/FolderPicker.svelte';
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import { formatRepoPath, parseRepoInput } from '#lib/repo/ref.ts';
	import { counted } from '#lib/plural.ts';
	import { toSuggestions, type CachedShape, type Suggestion } from '#lib/repo/recent.ts';
	import { SERVED } from '#lib/sources/served/enabled.ts';
	import { SERVED_PATH } from '#lib/sources/served/source.ts';
	import { folderAccess } from '#lib/sources/local/folder.ts';
	import { openStore } from '#lib/sources/store.ts';
	import { describeAge } from '#lib/state/repository.svelte.ts';

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

	let helping = $state(false);

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

	let suggestions = $state<Suggestion[]>([]);

	/**
	 * Reads the suggestions from the cache in the browser only, so the
	 * prerendered HTML leaves the slot empty rather than shipping a guess that
	 * would flash and be replaced.
	 */
	$effect(() => {
		let alive = true;
		openStore()
			.list<CachedShape>()
			.then((rows) => {
				if (alive) suggestions = toSuggestions(rows, formatRepoPath);
			})
			.catch(() => {
				// Storage can be unavailable, and the fallback is still worth showing.
				if (alive) suggestions = toSuggestions([], formatRepoPath);
			});
		return () => {
			alive = false;
		};
	});

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

	/** Describes a suggestion, such as "64 tasks, 23 still open", or why the fallback is offered. */
	function describe(one: Suggestion): string {
		if (one.storedAt === null) return "This viewer's own backlog";
		const tasks = counted(one.total, 'task', 'tasks');
		if (one.open === 0) return `${tasks}, all closed`;
		return `${tasks}, ${one.open} still open`;
	}
</script>

<svelte:head>
	<title>tatr explorer</title>
</svelte:head>

<!-- The landing page has no views to switch between, so `1`-`9` stay unbound.
     The other shortcuts walk and open the repositories, focus the box with `/`,
     and show the key list with `?`. -->
<Shortcuts
	onhelp={() => (helping = !helping)}
	ondismiss={() => (helping = false)}
	modal={helping}
/>

{#if helping}
	<KeyHelp views={[]} onclose={() => (helping = false)} />
{/if}

<main>
	<p class="brand"><Mark size={26} /> <span>tatr explorer</span></p>

	<h1>Explore any <code class="highlight">tasks/</code> folder.</h1>
	<p class="lead">
		Point it at any repository that follows the
		<a href="https://github.com/tsoding/tatr#task-tracker">tatr</a> layout, or at a folder on this machine.
		Nothing is uploaded: the files are read in your browser.
	</p>

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

	<!-- The served folder comes first, under its own heading, because the dev
	     server was started for it and it is neither a past reading nor a
	     suggestion. -->
	{#if SERVED}
		<section class="recent">
			<h2>Served by this dev server</h2>
			<ul>
				<li>
					<a href={resolve('/[...repo]', { repo: SERVED_PATH })} data-key-row>
						<span class="path mono">{SERVED}</span>
						<span class="about">Read from the disk, and followed as it changes</span>
						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			</ul>
		</section>
	{/if}

	{#if suggestions.length > 0}
		<section class="recent">
			<h2>
				{#if suggestions[0].storedAt === null}Try it on{:else}Already read{/if}
			</h2>
			<ul>
				{#each suggestions as one (one.path)}
					<li>
						<a href={resolve('/[...repo]', { repo: one.path })} data-key-row>
							<span class="path mono">{one.path}</span>
							<span class="about">
								{describe(one)}
								{#if one.storedAt !== null}
									<span class="age">· read {describeAge(one.storedAt)}</span>
								{/if}
							</span>
							<span class="arrow" aria-hidden="true">→</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 40rem;
		padding: clamp(3rem, 12vh, 7rem) 1.5rem 4rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0 0 1.75rem;
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 800;
	}

	h1 {
		margin: 0 0 1rem;
		font-size: clamp(1.6rem, 5vw, 2.125rem);
		font-weight: 800;
		line-height: 1.25;
		text-wrap: balance;
	}

	/* The highlight sits mid-sentence here, so it must not hang into the space
	   before it. */
	h1 code {
		margin-left: 0;
		font-size: 1em;
	}

	.lead {
		margin: 0 0 2rem;
		line-height: 1.7;
		color: var(--ink-2);
	}

	.lead a {
		color: var(--accent-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

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
		flex: 1 1 16rem;
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

	.recent {
		margin-top: 2.5rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}

	li a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.2rem 1rem;
		padding: 0.85rem 1.1rem;
		color: var(--fg);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}

	li a:hover {
		border-color: var(--accent-line);
	}

	.path {
		font-weight: 700;
		color: var(--accent-text);
		overflow-wrap: anywhere;
	}

	.about {
		grid-column: 1;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.age {
		color: var(--muted);
	}

	.arrow {
		grid-row: 1 / span 2;
		grid-column: 2;
		color: var(--muted);
	}
</style>
