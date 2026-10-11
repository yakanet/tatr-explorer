<script lang="ts">
	// Links to a task's TASK.md on its forge, where the reader finds its history,
	// blame and raw markdown. The viewer does not show those because the format
	// holds no modification date and the API would cost a request per task.
	import SidePanel from '#lib/components/SidePanel.svelte';

	interface Props {
		/** The file's page on the forge, or null when the source has none, such as a local folder. */
		url: string | null;
	}

	let { url }: Props = $props();
</script>

{#if url}
	<SidePanel title="Source">
		<p class="file">
			<a href={url} target="_blank" rel="noopener noreferrer">TASK.md on {new URL(url).host}</a>
		</p>
		{#snippet note()}Its history and its blame are there, not here.{/snippet}
	</SidePanel>
{/if}

<style>
	.file {
		margin: 0;
		font-size: 0.85rem;
	}

	.file a {
		color: var(--accent-text);
	}
</style>
