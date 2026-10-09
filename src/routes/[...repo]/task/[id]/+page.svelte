<script lang="ts">
	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { openSource } from '#lib/sources/open.ts';
	import {
		renderInline,
		renderMarkdown,
		resolveAttachment,
		splitJournal
	} from '#lib/render/markdown.ts';
	import { loadTaskDescription } from '#lib/sources/load.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { formatSize } from '#lib/tatr/attachments.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	const id = $derived(page.params.id ?? '');
	const task = $derived(repo.tasks.find((candidate) => candidate.id === id));

	// Bodies are not cached, so a task opened from a cached repository fetches
	// its own prose. It costs no quota and takes about 30 ms.
	let body = $state<string | null>(null);
	let loadingBody = $state(false);

	$effect(() => {
		const current = task;
		if (!current) return;
		if (current.description !== undefined) {
			body = current.description;
			// Reachable while a fetch is in flight: a refresh replaces the task
			// with one that carries its description, and this branch is what the
			// next run takes. Without the reset the page keeps saying it is
			// reading a body it already has.
			loadingBody = false;
			return;
		}
		loadingBody = true;
		let cancelled = false;
		loadTaskDescription(ref, repo.branch, current.id).then((text) => {
			if (cancelled) return;
			body = text ?? '';
			loadingBody = false;
		});
		return () => {
			cancelled = true;
		};
	});

	const entries = $derived(body === null ? [] : splitJournal(body));

	const taskHref = (other: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id: other });

	const renderOptions = $derived({
		ref,
		branch: repo.branch,
		taskId: id,
		// An id this repository does not have — most of the ones our tasks cite
		// are upstream's — would lead a reader to `No such task`, and this task's
		// own id to the page it is written on. Resolved against the same list the
		// References panel uses, so a body links exactly what the panel lists.
		taskUrl: (other: string) =>
			other !== id && repo.tasks.some((candidate) => candidate.id === other)
				? taskHref(other)
				: null
	});
	const render = (source: string) => renderMarkdown(source, renderOptions);
	const inline = (source: string) => renderInline(source, renderOptions);

	/** Tasks this one points at, and tasks pointing back at it. */
	const attachments = $derived(task?.attachments ?? []);

	/** `null` when a path climbs out of `tasks/`, which the panel then shows inert. */
	const attachmentUrl = (name: string) =>
		task ? resolveAttachment({ ref, branch: repo.branch, taskId: task.id }, name) : null;

	// A task citing itself is neither a task it refers to nor one referring here,
	// which together would read "mutual": it has a line of its own.
	const outgoing = $derived(
		(task?.references ?? [])
			.filter((other) => other !== id)
			.map((other) => repo.tasks.find((candidate) => candidate.id === other))
			.filter((other) => other !== undefined)
	);
	const incoming = $derived(
		repo.tasks.filter((other) => other.id !== id && other.references.includes(id))
	);
	const citesItself = $derived(task?.references.includes(id) ?? false);
	const mutual = $derived(new Set(incoming.map((other) => other.id)));

	/**
	 * The file this page is a reading of, on the forge.
	 *
	 * Where a reader goes for the history, the blame and the raw markdown, none
	 * of which this viewer computes: the format holds no modification date, and
	 * asking the API for one costs a request per task.
	 */
	// Absent for a folder on this machine, which is the source saying there is no
	// page anywhere to link this file to — rather than this view knowing that.
	const fileUrl = $derived(
		openSource(ref, { branch: repo.branch })?.fileUrl?.(`tasks/${id}/TASK.md`) ?? null
	);

	const listHref = $derived(resolve('/[...repo]/list', { repo: formatRepoPath(ref) }));
</script>

<svelte:head>
	<title>{task?.title ?? id} — {repo.name}</title>
</svelte:head>

<main>
	{#if repo.phase !== 'ready'}
		<p class="muted">Loading…</p>
	{:else if !task}
		<section class="panel">
			<h2>No such task</h2>
			<p>This repository has no task <code>{id}</code>.</p>
			<p><a href={listHref}>Back to the list</a></p>
		</section>
	{:else}
		<article class="panel">
			<div class="meta">
				<span class="status" class:closed={task.closed}>{task.status}</span>
				<span class="prio">priority {task.priority}</span>
				{#if task.created}
					<span class="muted">·</span>
					<span class="muted">
						created {task.created.toISOString().slice(0, 10)}
						{task.created.toISOString().slice(11, 16)} UTC
					</span>
				{/if}
			</div>

			<h1>{@html inline(task.title)}</h1>

			{#if task.malformed}
				<p class="warning">
					This file does not start with <code>#</code>, so the reference parser abandons its
					properties entirely. It is shown as it was read.
				</p>
			{/if}

			{#if loadingBody}
				<p class="muted">Reading the body…</p>
			{:else if entries.length === 0}
				<p class="muted">No description.</p>
			{:else}
				<div class="journal">
					{#each entries as entry, index (index)}
						<div class="entry" class:first={index === 0} class:last={index === entries.length - 1}>
							<span class="bullet"></span>
							<div class="prose">{@html render(entry)}</div>
						</div>
					{/each}
				</div>
			{/if}
		</article>

		<aside>
			<section class="panel">
				<h2>Properties</h2>
				<dl>
					{#each task.properties as [key, value] (key)}
						<dt>{key}</dt>
						<dd>{value || '—'}</dd>
					{/each}
				</dl>
				<p class="note">Any property key is shown, not just these.</p>
			</section>

			{#if outgoing.length > 0 || incoming.length > 0 || citesItself}
				<section class="panel">
					<h2>References</h2>
					<ul>
						{#each outgoing as other (other.id)}
							<li>
								<a href={taskHref(other.id)}>
									<code class="id">{other.id}</code>
									<span>{@html inline(other.title)}</span>
								</a>
								<span class="direction">{mutual.has(other.id) ? 'mutual' : 'refers to'}</span>
							</li>
						{/each}
						{#each incoming.filter((other) => !task.references.includes(other.id)) as other (other.id)}
							<li>
								<a href={taskHref(other.id)}>
									<code class="id">{other.id}</code>
									<span>{@html inline(other.title)}</span>
								</a>
								<span class="direction">refers here</span>
							</li>
						{/each}
						{#if citesItself}
							<li>
								<span class="direction">cites itself</span>
							</li>
						{/if}
					</ul>
					<p class="note">Found by scanning task text for ids.</p>
				</section>
			{/if}

			{#if attachments.length > 0}
				<section class="panel">
					<h2>Files</h2>
					<ul class="files">
						{#each attachments as file (file.path)}
							<!-- Through resolveAttachment, which refuses a path climbing out of
							     tasks/ and pins the host, exactly as a link in the body goes.
							     Opened in a new tab: these are raw files, not pages of this
							     site. -->
							{@const href = attachmentUrl(file.name)}
							<li>
								{#if href}
									<a {href} target="_blank" rel="noreferrer">{file.name}</a>
								{:else}
									<span>{file.name}</span>
								{/if}
								<span class="size mono">{formatSize(file.size)}</span>
							</li>
						{/each}
					</ul>
					<p class="note">In the task's folder, beside its <code>TASK.md</code>.</p>
				</section>
			{/if}

			{#if fileUrl}
				<section class="panel">
					<h2>Source</h2>
					<p class="file">
						<a href={fileUrl} target="_blank" rel="noopener noreferrer">TASK.md on {ref.host}</a>
					</p>
					<p class="note">Its history and its blame are there, not here.</p>
				</section>
			{/if}

			<p><a href={listHref}>← Back to the list</a></p>
		</aside>
	{/if}
</main>

<style>
	main {
		max-width: 70rem;
		display: grid;
		grid-template-columns: 1fr 18rem;
		gap: var(--card-gap);
		align-items: start;
	}

	main > p,
	main > section {
		grid-column: 1 / -1;
	}

	/* The sidebar goes under the article on a narrow screen, rather than
	   squeezing it or pushing the page sideways. */
	@media (max-width: 50rem) {
		main {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.panel {
		padding: 1.5rem 1.75rem;
	}

	aside .panel {
		padding: 1.125rem 1.25rem;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: var(--card-gap);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.6rem;
		font-size: 0.8125rem;
		margin-bottom: 0.875rem;
	}

	/* The status as the file writes it, in a pill: lilac while open, grey once
	   closed, so the word and the tint agree. */
	.status {
		display: inline-flex;
		align-items: center;
		height: 1.625rem;
		padding: 0 0.75rem;
		font-weight: 700;
		color: var(--accent-text);
		background: var(--accent-wash);
		border-radius: var(--radius-full);
	}

	.status.closed {
		color: var(--ink-2);
		background: var(--tint);
	}

	.muted {
		color: var(--muted);
	}

	h1 {
		margin: 0 0 1.5rem;
		font-size: 1.375rem;
		line-height: 1.35;
		font-weight: 700;
		letter-spacing: -0.01em;
		text-wrap: pretty;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}

	.journal {
		display: flex;
		flex-direction: column;
	}

	/*
	 * A body is a journal: the original description, then whatever was appended
	 * after it, split on `---`. The bullets mark where each entry starts and the
	 * rule joins them, so the shape says "added over time" on its own.
	 *
	 * They are deliberately all the same colour. Highlighting the last one coded
	 * nothing the reader could not already see — it is the one at the bottom —
	 * and a colour that carries no meaning still asks to be decoded. Dating them
	 * instead is not an option here: not one of the 97 journal entries in
	 * tsoding/tatr carries a date. The `## NOTE(<huid>)` headings that do are a
	 * different convention, written inside a body rather than between entries,
	 * and markdown already renders them.
	 */
	.entry {
		display: flex;
		gap: 1rem;
		position: relative;
		/* Where a bullet's centre sits: its top margin plus half its height. */
		--bullet-mid: calc(0.65rem + 3.5px);
	}

	/* The rule runs the height of every entry, so it reaches the end of the text
	   rather than stopping at the last bullet — which read as unfinished whenever
	   the last entry was long. It starts at the first bullet's centre, since
	   nothing precedes it there. */
	.entry::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 3px;
		width: 1px;
		/* The bullets' own colour: `--border` disappears against the card in dark
		   mode, being a step away from the surface it sits on. At 1px against a
		   7px dot it still reads as the lighter of the two. */
		background: var(--baseline);
	}

	.entry.first::before {
		top: var(--bullet-mid);
	}

	/* A single entry is not a sequence, so it gets no rule at all — a line down
	   the side of one block reads as a quotation, not as a journal. */
	.entry.first.last::before {
		display: none;
	}

	.bullet {
		flex-shrink: 0;
		width: 7px;
		height: 7px;
		margin-top: 0.65rem;
		border-radius: 50%;
		background: var(--baseline);
		/* Above the rule, and it paints over the piece running behind it. */
		position: relative;
		z-index: 1;
		box-shadow: 0 0 0 3px var(--surface);
	}

	/* A description is read, so it wraps at the width a line of a TASK.md has
	   in an editor rather than at the card's. */
	.prose {
		flex-grow: 1;
		max-width: 72ch;
		font-size: 0.875rem;
		line-height: 1.7;
		min-width: 0;
	}

	/* Underlined as well as coloured, so a link in running text is not told
	   apart by hue alone. */
	.prose :global(a) {
		color: var(--accent-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.prose :global(p) {
		margin: 0 0 0.9rem;
		text-wrap: pretty;
	}

	.prose :global(pre) {
		background: var(--tint);
		border-radius: var(--radius-md);
		padding: 0.85rem 1rem;
		overflow-x: auto;
		font-size: 0.8125rem;
	}

	.prose :global(img) {
		max-width: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.45rem 1rem;
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
	}

	dt {
		font-family: var(--font-mono);
		color: var(--muted);
	}

	dd {
		margin: 0;
		font-family: var(--font-mono);
	}

	ul {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	li a {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	li span {
		font-size: 0.8125rem;
		color: var(--ink-2);
		line-height: 1.4;
	}

	.files li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.files a,
	.files span:first-child {
		flex-grow: 1;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		/* File names run long and have no spaces to break at. */
		overflow-wrap: anywhere;
	}

	.size {
		flex-shrink: 0;
		font-size: 0.72rem;
		color: var(--muted);
	}

	.direction {
		font-size: 0.75rem !important;
		color: var(--muted) !important;
	}

	.file {
		margin: 0;
		font-size: 0.85rem;
	}

	.file a {
		color: var(--accent-text);
	}

	.note {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
		line-height: 1.5;
	}

	.warning {
		font-size: 0.8125rem;
		color: var(--warning);
	}
</style>
