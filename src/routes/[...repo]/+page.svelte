<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { renderInline } from '#lib/render/markdown.ts';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { searchFor, type Status } from '#lib/state/query.svelte.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import {
		byMonth,
		byPriority,
		byTag,
		counts,
		monthName,
		summarise,
		topByPriority
	} from '#lib/tatr/stats.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// The dashboard is the whole repository at a glance. Filtering happens in the
	// list; a chart that filtered itself would leave the reader on a picture to
	// interpret instead of on the tasks they asked for.
	const all = $derived(repo.tasks);
	const stats = $derived(counts(all));
	const summary = $derived(summarise(all));

	// Priority and tags describe what is left to do, so they count open tasks
	// only, as `tatr ls` does. Clicking one then lands on those same tasks
	// rather than on a list padded with everything already finished.
	const openTasks = $derived(repo.open);
	const priorities = $derived(byPriority(openTasks));
	const tags = $derived(byTag(openTasks));
	const top = $derived(topByPriority(openTasks, 8));

	// The calendar is history, so it keeps both series and is not a filter.
	const months = $derived(byMonth(all));

	const maxPriority = $derived(Math.max(1, ...priorities.map((bucket) => bucket.count)));
	const maxTag = $derived(Math.max(1, ...tags.map((bucket) => bucket.count)));
	const maxMonth = $derived(Math.max(1, ...months.map((bucket) => bucket.open + bucket.closed)));

	/** The list showing exactly what a figure counted; the layout reads the query from it. */
	const listOf = (text: string, status: Status) =>
		resolve('/[...repo]/list', { repo: formatRepoPath(ref) }) + searchFor(text, status);

	/**
	 * Clicking a bar means "show me those tasks", so it opens the filtered list —
	 * open only, matching what the bar counted, whatever status was chosen
	 * before.
	 */
	const pick = (term: string) => goto(listOf(term, 'open'));

	const inline = (title: string, taskId: string) =>
		renderInline(title, { ref, branch: repo.branch, taskId });
	const taskHref = (id: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
	const monthLabel = (month: string) =>
		['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
			Number(month.slice(5, 7)) - 1
		];
</script>

<svelte:head>
	<title>{repo.name} — overview</title>
</svelte:head>

<main>
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<section class="masthead panel">
			<div class="lead">
				<!-- The command this view stands for, as the list's stands for
				     `tatr ls`: the overview is what `tatr summary` would say. -->
				<p class="prompt">
					$ tatr summary <span class="since"
						>— {months.length > 0 ? `since ${monthName(months[0].month)}` : 'no dates yet'}</span
					>
				</p>
				<h1>
					<span class="highlight">{summary.lead}</span>{#if summary.detail}<span class="detail"
							>, and {summary.detail}.</span
						>{:else}<span class="detail">.</span>{/if}
				</h1>
			</div>
			<!-- Each figure keeps one tint wherever it appears, so the colour
			     says which count it is before the label does. Each opens the list
			     on exactly the tasks it counts, the same number at the top of it:
			     untagged is counted over every task, so it brings the closed ones. -->
			<ul class="figures">
				<li class="closed">
					<a href={listOf('', 'closed')}><strong>{stats.closed}</strong> <span>closed</span></a>
				</li>
				<li class="untagged">
					<a href={listOf('not tagged', 'all')}
						><strong>{stats.untagged}</strong> <span>untagged</span></a
					>
				</li>
				<li class="total">
					<a href={listOf('', 'all')}><strong>{stats.total}</strong> <span>in total</span></a>
				</li>
			</ul>
		</section>

		<div class="charts">
			<section class="panel">
				<header>
					<h2>open by priority</h2>
					<span class="hint">— higher is more urgent</span>
				</header>
				{#if priorities.length === 0}
					<p class="empty">Nothing open.</p>
				{:else}
					<ul class="bars">
						{#each priorities as bucket (bucket.priority)}
							{@const term = `priority eq ${bucket.priority}`}
							<li>
								<button class="row" data-key-row onclick={() => pick(term)}>
									<span class="label mono">{bucket.priority}</span>
									<span class="track">
										<span class="fill" style:width="{(bucket.count / maxPriority) * 100}%"></span>
									</span>
									<span class="value mono">{bucket.count}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="panel">
				<header>
					<h2>open by tag</h2>
					<span class="hint">— click to see them</span>
				</header>
				{#if tags.length === 0}
					<p class="empty">No open task carries a tag.</p>
				{:else}
					<ul class="bars">
						{#each tags as bucket (bucket.tag)}
							{@const term = `:${bucket.tag}`}
							<li>
								<button
									class="row"
									data-key-row
									onclick={() => pick(term)}
									title={repo.tags.descriptions.get(bucket.tag) ?? ''}
								>
									<span class="label wide"
										><span class="tag" data-hue={tagHue(bucket.tag)}>{bucket.tag}</span></span
									>
									<span class="track">
										<span class="fill" style:width="{(bucket.count / maxTag) * 100}%"></span>
									</span>
									<span class="value mono">{bucket.count}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<section class="panel">
			<header>
				<h2>created per month</h2>
				<span class="hint">— every task ever</span>
				<span class="legend">
					<span class="chip"><span class="key open"></span>still open</span>
					<span class="chip"><span class="key closed"></span>since closed</span>
				</span>
			</header>
			{#if months.length === 0}
				<p class="empty">No tasks yet.</p>
			{:else}
				<div class="months">
					{#each months as bucket (bucket.month)}
						{@const total = bucket.open + bucket.closed}
						<div class="month" title="{bucket.month}: {bucket.open} open, {bucket.closed} closed">
							<div class="stack">
								<!-- The column is bottom-anchored, so the first segment drawn sits on
								     top and is the one carrying the rounded data end. A month with
								     nothing keeps its slot as a short pill, so quiet reads as quiet
								     rather than as missing. -->
								{#if bucket.closed > 0}
									<div class="seg closed" style:height="{(bucket.closed / maxMonth) * 100}%"></div>
								{/if}
								{#if bucket.open > 0}
									<div class="seg open" style:height="{(bucket.open / maxMonth) * 100}%"></div>
								{/if}
								{#if total === 0}
									<div class="seg none"></div>
								{/if}
							</div>
							<span class="tick mono">{monthLabel(bucket.month)}</span>
							<span class="n mono" class:zero={total === 0}>{total || ''}</span>
						</div>
					{/each}
				</div>
				<p class="hint source">dates come from the folder names</p>
			{/if}
		</section>

		{#if top.length > 0}
			<section class="panel leaders">
				<header>
					<h2><span class="cmd">$ tatr ls</span> highest priority, still open</h2>
				</header>
				<ul class="tasks">
					{#each top as task (task.id)}
						<li>
							<span class="prio">{task.priority}</span>
							<a class="title" href={taskHref(task.id)} data-key-row
								>{@html inline(task.title, task.id)}</a
							>
							{#each task.tags as tag (tag)}
								<button class="tag" data-hue={tagHue(tag)} onclick={() => pick(`:${tag}`)}
									>{tag}</button
								>
							{/each}
							<code class="id">{task.id}</code>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		display: flex;
		flex-direction: column;
		gap: var(--card-gap);
	}

	/* What a card holds sits this far in; the hero and the leaderboard set their
	   own below, which is why this rule comes first. */
	.panel {
		padding: 1.5rem 1.625rem;
	}

	/* The hero: the one sentence the page exists to say, and three counts. */
	.masthead {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1.5rem 2rem;
		padding: 1.75rem 1.9rem;
	}

	.lead {
		flex: 1 1 26rem;
		min-width: 0;
	}

	.prompt {
		margin: 0 0 0.75rem;
		color: var(--muted);
	}

	.since {
		color: var(--ink-2);
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		line-height: 1.3;
		font-weight: 800;
		text-wrap: pretty;
		max-width: 36ch;
	}

	.detail {
		color: var(--fg);
	}

	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A link that does not look like a button: no border, no fill change. It
	   says so on hover by underlining its label, and on focus by the ring. */
	.figures a {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 5.75rem;
		padding: 0.75rem;
		font-size: 0.75rem;
		color: var(--ink-2);
		border-radius: var(--radius-lg);
	}

	.figures a:hover span {
		color: var(--fg);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.figures .closed a {
		background: var(--tint-mint);
	}

	.figures .untagged a {
		background: var(--tint-sky);
	}

	.figures .total a {
		background: var(--tint-lilac);
	}

	.figures strong {
		font-size: 1.75rem;
		font-weight: 800;
		line-height: 1.2;
		color: var(--fg);
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: var(--card-gap);
	}

	.panel header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
		margin-bottom: 1rem;
	}

	h2 {
		margin: 0;
		font-size: 0.875rem;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.source {
		margin: 0.75rem 0 0;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-left: auto;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.1rem 0.65rem 0.1rem 0.4rem;
		border-radius: var(--radius-full);
		background: var(--tint);
	}

	.key {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-full);
		display: inline-block;
	}

	.key.open,
	.seg.open {
		background: var(--series-open);
	}

	.key.closed,
	.seg.closed {
		background: var(--series-closed);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.bars {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: 2rem;
		padding: 0 0.35rem;
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
	}

	.row:hover {
		background: var(--tint);
	}

	.label {
		width: 3ch;
		text-align: right;
		color: var(--ink-2);
		flex-shrink: 0;
	}

	.label.wide {
		width: 9ch;
	}

	/* A pill on a pill: the empty part of the bar is drawn, so a short bar
	   still reads as a share of something. */
	.track {
		flex-grow: 1;
		display: block;
		height: 12px;
		border-radius: var(--radius-full);
		background: var(--track);
	}

	.fill {
		display: block;
		height: 100%;
		min-width: 12px;
		background: var(--series-open);
		border-radius: var(--radius-full);
	}

	.value {
		width: 3ch;
		font-weight: 700;
	}

	.months {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		height: 132px;
	}

	.month {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		height: 100%;
	}

	.stack {
		flex-grow: 1;
		width: 100%;
		max-width: 22px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		/* The gap shows the card behind, so the two series never touch. */
		gap: 3px;
		margin: 0 auto;
	}

	/* A column is a pill standing up: round where the data ends and at the
	   foot, and cut square where two segments meet. */
	.seg {
		min-height: 3px;
	}

	.seg:first-child {
		border-top-left-radius: 11px;
		border-top-right-radius: 11px;
	}

	.seg:last-child {
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
	}

	.seg.none {
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--track);
	}

	.tick {
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.n {
		font-size: 0.8125rem;
		color: var(--muted);
		min-height: 1.2rem;
	}

	.n.zero {
		color: transparent;
	}

	.leaders {
		padding: 1.5rem 1.125rem 0.75rem;
	}

	.leaders header {
		padding: 0 0.5rem;
	}

	.cmd {
		font-weight: 400;
		color: var(--muted);
		margin-right: 0.35rem;
	}

	.tasks {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tasks li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: var(--target);
		padding: 0 0.5rem;
		border-radius: var(--radius-md);
	}

	.tasks li:hover {
		background: var(--tint);
	}

	.title {
		flex-grow: 1;
		min-width: 0;
		color: inherit;
	}

	.title:hover {
		color: var(--accent-text);
	}

	.tag {
		cursor: pointer;
	}

	.tag:hover {
		color: var(--fg);
	}
</style>
