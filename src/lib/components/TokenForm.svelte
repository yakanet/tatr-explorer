<script lang="ts">
	// Offers to read a private repository with a token the reader gives: one
	// already kept for a repository of the same owner, or one created on GitHub
	// from a page filled in for this repository, then pasted here.
	import { isAuthorizable } from '#lib/sources/capabilities.ts';
	import type { RepositoryState } from '#lib/state/repository.svelte.ts';

	interface Props {
		repo: RepositoryState;
	}

	let { repo }: Props = $props();

	const source = $derived.by(() => {
		if (!isAuthorizable(repo.source)) return null;
		return repo.source;
	});

	/** The other repositories of the owner a token is kept for, whose token may read this one too. */
	let neighbours = $state<string[]>([]);
	let token = $state('');
	/** Why the last token was not kept, until another is tried. */
	let refusal = $state<string | null>(null);
	let busy = $state(false);
	let field = $state<HTMLInputElement>();

	$effect(() => {
		const current = source;
		if (!current) return;
		let alive = true;
		current.neighbours().then((names) => {
			if (alive) neighbours = names;
		});
		return () => {
			alive = false;
		};
	});

	async function submit(given: { token: string } | { from: string }) {
		if (busy) return;
		busy = true;
		refusal = null;
		refusal = await repo.authorize(given);
		busy = false;
		if (refusal === null) return;
		token = '';
		field?.focus();
	}

	/** Submits what is pasted, so that coming back from GitHub takes one keystroke. */
	function paste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text').trim() ?? '';
		if (text === '') return;
		event.preventDefault();
		token = text;
		submit({ token: text });
	}

	function send(event: SubmitEvent) {
		event.preventDefault();
		if (token.trim() !== '') submit({ token });
	}

	/** Puts the focus in the field when the reader comes back from GitHub's tab, ready to paste. */
	function back() {
		if (document.visibilityState === 'visible' && !busy) field?.focus();
	}
</script>

<svelte:document onvisibilitychange={back} />

{#if source}
	<div class="token">
		<p>
			If it is private, give a token that reads it. It stays in this browser beside the repository,
			goes to GitHub's API and nowhere else, and is forgotten when you remove the repository from
			the home page.
		</p>
		{#if neighbours.length > 0}
			<p class="neighbours">
				The token given for another repository of this owner may read it too:
				{#each neighbours as name (name)}
					<button class="action" disabled={busy} onclick={() => submit({ from: name })}>
						{name}
					</button>
				{/each}
			</p>
		{/if}
		<ol>
			<li>
				<a href={source.tokenPage} target="_blank" rel="noopener noreferrer"
					>Create a token on GitHub</a
				>. It is filled in to read contents only; tick this repository under "Only select
				repositories", then generate it.
			</li>
			<li>Paste it here.</li>
		</ol>
		<form onsubmit={send}>
			<span class="field input-pill">
				<input
					bind:this={field}
					bind:value={token}
					onpaste={paste}
					type="password"
					aria-label="Token"
					placeholder="github_pat_..."
					autocomplete="off"
					spellcheck="false"
					disabled={busy}
				/>
			</span>
			<button class="action" disabled={busy || token.trim() === ''} aria-busy={busy}>
				Read with it
			</button>
		</form>
		{#if refusal}
			<p class="refusal" role="alert">{refusal}</p>
		{/if}
	</div>
{/if}

<style>
	.token {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	p,
	ol {
		margin: 0 0 0.75rem;
		line-height: 1.6;
	}

	ol {
		padding-left: 1.25rem;
	}

	.neighbours {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.field {
		flex: 1 1 16rem;
		display: flex;
	}

	.field input {
		flex-grow: 1;
		min-width: 0;
		min-height: var(--target);
		padding: 0 1rem;
	}

	.refusal {
		margin: 0.75rem 0 0;
		color: var(--danger);
	}
</style>
