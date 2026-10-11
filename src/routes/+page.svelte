<script lang="ts">
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import RepositoryCard from './RepositoryCard.svelte';
	import RepositoryList from './RepositoryList.svelte';
	import SourcePicker from './SourcePicker.svelte';
	import Suggestions from './Suggestions.svelte';
	import { SERVED } from '#lib/sources/served/enabled.ts';
	import { SERVED_PATH } from '#lib/sources/served/source.ts';

	let helping = $state(false);
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

	<SourcePicker />

	<!-- The served folder comes first, under its own heading, because the dev
	     server was started for it and it is neither a past reading nor a
	     suggestion. -->
	{#if SERVED}
		<RepositoryList heading="Served by this dev server">
			<RepositoryCard path={SERVED_PATH} label={SERVED}>
				Read from the disk, and followed as it changes
			</RepositoryCard>
		</RepositoryList>
	{/if}

	<Suggestions />
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
</style>
