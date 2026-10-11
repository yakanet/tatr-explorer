<script lang="ts">
	// Lists the open tasks with the highest priority, in the order `tatr ls`
	// gives them.
	import { taskHref } from '#lib/repo/hrefs.ts';
	import type { RepoRef } from '#lib/repo/ref.ts';
	import { renderTitle, type RenderOptions } from '#lib/render/markdown.ts';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { topByPriority } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		/** The open tasks, as `tatr ls` lists them. */
		open: Task[];
		ref: RepoRef;
		assetUrl: RenderOptions['assetUrl'];
		/** Called with a tag's term, which the page opens the list on. */
		onpick: (term: string) => void;
	}

	let { open, ref, assetUrl, onpick }: Props = $props();

	const top = $derived(topByPriority(open, 8));
</script>

{#if top.length > 0}
	<section class="panel leaders">
		<header>
			<h2><span class="cmd">$ tatr ls</span> highest priority, still open</h2>
		</header>
		<ul class="tasks">
			{#each top as task (task.id)}
				<li>
					<span class="prio">{task.priority}</span>
					<a class="title" href={taskHref(ref, task.id)} data-key-row
						>{@html renderTitle(task, assetUrl)}</a
					>
					{#each task.tags as tag (tag)}
						<button class="tag" data-hue={tagHue(tag)} onclick={() => onpick(`:${tag}`)}
							>{tag}</button
						>
					{/each}
					<code class="id">{task.id}</code>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.leaders {
		padding: 1.5rem 1.125rem 0.75rem;
	}

	.leaders header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
		margin-bottom: 1rem;
		padding: 0 0.5rem;
	}

	h2 {
		margin: 0;
		font-size: 0.875rem;
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
		margin: 0;
		padding: 0;
		list-style: none;
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
</style>
