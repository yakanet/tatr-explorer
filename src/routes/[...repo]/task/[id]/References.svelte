<script lang="ts">
	// Lists the tasks a task cites and the tasks that cite it, or nothing when
	// there are none.
	import { taskHref } from '#lib/repo/hrefs.ts';
	import type { RepoRef } from '#lib/repo/ref.ts';
	import { renderInline, type RenderOptions } from '#lib/render/markdown.ts';
	import { buildGraph, referencesOf, type StarLink } from '#lib/tatr/graph.ts';
	import type { Task } from '#lib/tatr/task.ts';
	import SidePanel from './SidePanel.svelte';

	interface Props {
		task: Task;
		/** Every task of the repository, among which the citing ones are found. */
		tasks: readonly Task[];
		ref: RepoRef;
		/** How this task renders, applied to the titles listed. */
		options: RenderOptions;
	}

	let { task, tasks, ref, options }: Props = $props();

	const DIRECTION: Record<StarLink['kind'], string> = {
		out: 'refers to',
		both: 'mutual',
		in: 'refers here'
	};

	const references = $derived(referencesOf(buildGraph(tasks), task.id));
</script>

{#if references.links.length > 0 || references.self}
	<SidePanel title="References">
		<ul>
			{#each references.links as link (link.task.id)}
				<li>
					<a href={taskHref(ref, link.task.id)}>
						<code class="id">{link.task.id}</code>
						<span>{@html renderInline(link.task.title, options)}</span>
					</a>
					<span class="direction">{DIRECTION[link.kind]}</span>
				</li>
			{/each}
			{#if references.self}
				<li>
					<span class="direction">cites itself</span>
				</li>
			{/if}
		</ul>
		{#snippet note()}Found by scanning task text for ids.{/snippet}
	</SidePanel>
{/if}

<style>
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

	.direction {
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
