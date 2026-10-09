<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderPicker from '#lib/components/FolderPicker.svelte';
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import { formatRepoPath, parseRepoInput } from '#lib/repo/ref.ts';
	import { toSuggestions, type CachedShape, type Suggestion } from '#lib/repo/recent.ts';
	import { folderAccess } from '#lib/sources/local/folder.ts';
	import { openStore } from '#lib/sources/store.ts';
	import { describeAge } from '#lib/state/repository.svelte.ts';

	/** The two ways in, in the order the tabs read. */
	const WHERE = [
		{ id: 'remote', name: 'A repository' },
		{ id: 'local', name: 'A folder' }
	] as const;

	let where = $state<(typeof WHERE)[number]['id']>('remote');
	/**
	 * Read once, in the browser: the local panel only ever renders after a click,
	 * so the prerendered HTML never carries an answer to correct.
	 */
	const access = folderAccess();
	let input = $state('');
	let error = $state<string | null>(null);

	let helping = $state(false);

	/** Arrow keys move between tabs, which is what makes them tabs. */
	function move(event: KeyboardEvent) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (step === 0) return;
		event.preventDefault();
		const at = WHERE.findIndex((option) => option.id === where);
		const next = WHERE[(at + step + WHERE.length) % WHERE.length];
		where = next.id;
		// The focus follows the selection, as it does in a tab list.
		document.getElementById(`tab-${next.id}`)?.focus();
	}
	let suggestions = $state<Suggestion[]>([]);

	/**
	 * The cache decides what to offer, so this runs in the browser only — the
	 * page is prerendered, and the static HTML ships with nothing in this slot
	 * rather than with a guess that would flash and be replaced.
	 */
	$effect(() => {
		let alive = true;
		openStore()
			.list<CachedShape>()
			.then((rows) => {
				if (alive) suggestions = toSuggestions(rows, formatRepoPath);
			})
			.catch(() => {
				// Storage can be unavailable; the fallback is still worth showing.
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

	/** "64 tasks, 23 still open", or what the reference repository is. */
	function describe(one: Suggestion): string {
		if (one.storedAt === null) return 'The reference implementation';
		const tasks = `${one.total} ${one.total === 1 ? 'task' : 'tasks'}`;
		return one.open === 0 ? `${tasks}, all closed` : `${tasks}, ${one.open} still open`;
	}
</script>

<svelte:head>
	<title>tatr explorer</title>
</svelte:head>

<!-- The page a reader arrives on was the only one without a keyboard. There is
     no nav here to switch between, so `1`-`9` stay unwired rather than being
     given something invented for them; what is left is walking the
     repositories, opening one, `/` for the box, and `?` for the list. -->
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
		<a href="https://github.com/tsoding/tatr">tatr</a> layout, or at a folder on this machine. Nothing
		is uploaded — the files are read in your browser.
	</p>

	<!-- Two ways in, one at a time: each needs a line of explanation, and stacked
	     they read as one crowded instruction rather than a choice. -->
	<div class="segmented tabs" role="tablist" aria-label="Where the tasks are">
		{#each WHERE as option (option.id)}
			<button
				type="button"
				role="tab"
				id="tab-{option.id}"
				aria-selected={where === option.id}
				aria-controls="panel-{option.id}"
				tabindex={where === option.id ? 0 : -1}
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

			<!-- The parser takes all four, and nothing on screen admitted it. -->
			<p class="accepts">
				Accepts <code>owner/name</code>, a full URL, an SSH remote, or
				<code>owner/name@branch</code>.
			</p>

			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	{:else}
		<!-- The one repository a public URL cannot reach is the one being worked in. -->
		<div role="tabpanel" id="panel-local" aria-labelledby="tab-local">
			{#if access === 'none'}
				<p class="accepts">
					This browser cannot open a folder: it has neither the File System Access API nor directory
					selection. A repository still works.
				</p>
			{:else}
				<div class="local">
					<FolderPicker />
					<span class="hint">private, unpushed, offline — whatever is checked out right now</span>
				</div>
				<!-- What the browser is about to ask depends on which door it has, and
				     a surprise dialog reads as a warning about this site. -->
				{#if access === 'picker'}
					<p class="accepts">
						Your browser will ask for access to that one folder, and <strong>Refresh</strong> will reread
						it. Nothing is uploaded: there is no server to upload to.
					</p>
				{:else}
					<p class="accepts">
						Picking a folder makes your browser count its files first — choose just the
						<code>tasks/</code> folder to keep that number small, or drop the folder here instead. Nothing
						is uploaded: there is no server to upload to.
					</p>
				{/if}
			{/if}
		</div>
	{/if}

	{#if suggestions.length > 0}
		<section class="recent">
			<h2>{suggestions[0].storedAt === null ? 'Try it on' : 'Already read'}</h2>
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

	<p class="scheme">
		Every repository gets its own address:
		<code>/tsoding/tatr?q=:bug</code>
	</p>
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

	/* Mid-sentence, so it does not hang into the space before it. */
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

	.accepts,
	.scheme {
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

	.scheme {
		margin-top: 2rem;
	}
</style>
