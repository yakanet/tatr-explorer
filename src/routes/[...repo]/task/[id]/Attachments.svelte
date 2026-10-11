<script lang="ts">
	// Lists the files in a task's folder beside its TASK.md, with their sizes, or
	// nothing when there are none.
	import { resolveAttachment, type RenderOptions } from '#lib/render/markdown.ts';
	import { formatSize, type Attachment } from '#lib/tatr/attachments.ts';
	import SidePanel from '#lib/components/SidePanel.svelte';

	interface Props {
		attachments: Attachment[];
		/** This task's, for the address each file loads from. */
		options: RenderOptions;
	}

	let { attachments, options }: Props = $props();
</script>

{#if attachments.length > 0}
	<SidePanel title="Files">
		<ul class="files">
			{#each attachments as file (file.path)}
				<!-- The URL comes from resolveAttachment, which refuses a path
				     climbing out of tasks/ and pins the host, as for a link in the
				     body. It opens in a new tab because it is a raw file, not a page
				     of this site. -->
				{@const href = resolveAttachment(options, file.name)}
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
		{#snippet note()}In the task's folder, beside its <code>TASK.md</code>.{/snippet}
	</SidePanel>
{/if}

<style>
	.files {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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

	.files a {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.files span:first-child {
		color: var(--ink-2);
		line-height: 1.4;
	}

	.size {
		flex-shrink: 0;
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--muted);
	}
</style>
