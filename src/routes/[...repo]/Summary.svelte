<script lang="ts">
	// Shows the repository in one sentence and three counts, each a link to the
	// tasks it counts.
	import type { Status } from '#lib/tql/command.ts';
	import { counts, monthName, summarise } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		/** Every task of the repository, as `summarise` requires. */
		tasks: Task[];
		/** The first month with a task, written `2026-03`, or none without dates. */
		since: string | undefined;
		/** The list's address for a query and a status, which each count links to. */
		listOf: (text: string, status: Status) => string;
	}

	let { tasks, since, listOf }: Props = $props();

	const stats = $derived(counts(tasks));
	const summary = $derived(summarise(tasks));
</script>

<section class="masthead panel">
	<div class="lead">
		<!-- The prompt names `tatr summary`, the CLI command this view stands
		     for, as the list names `tatr ls`. -->
		<p class="prompt">
			$ tatr summary <span class="since"
				>· {#if since}since {monthName(since)}{:else}no dates yet{/if}</span
			>
		</p>
		<h1>
			<span class="highlight">{summary.lead}</span>{#if summary.detail}<span class="detail"
					>, and {summary.detail}.</span
				>{:else}<span class="detail">.</span>{/if}
		</h1>
	</div>
	<!-- Each figure keeps the same tint wherever it appears, so the colour
	     identifies the count before the label does. Each links to the list
	     of exactly the tasks it counts: untagged counts every task, so its
	     list includes closed ones. -->
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

<style>
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

	/* A figure is a link without border or fill change, so it does not look
	   like a button. Hover underlines its label, and focus shows the ring. */
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
</style>
