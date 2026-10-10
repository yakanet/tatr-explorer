<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { onBranch } from '../repo/branch.ts';
	import { branchesOf } from '../repo/recent.ts';
	import { formatRepoPath, isBranchName, type RepoRef } from '../repo/ref.ts';
	import { openStore } from '../sources/store.ts';

	let {
		ref,
		open = $bindable(false)
	}: {
		/** A repository on a forge: a folder has no branch to choose. */
		ref: RepoRef;
		/** Bound, so that `b` can open the menu from the keyboard layer. */
		open?: boolean;
	} = $props();

	let root = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let toggle = $state<HTMLButtonElement | null>(null);

	// Whichever way the reader left — a link, the field, Back — the menu was
	// about the page they left.
	afterNavigate(() => {
		open = false;
	});

	/**
	 * Gives the focus back to the address the menu was opened from. The focus
	 * moves first, so leaving the field for the address does not count as
	 * leaving the menu.
	 */
	function close() {
		toggle?.focus();
		open = false;
	}

	/**
	 * `HEAD` means the default branch, as it does to git, which refuses it as a
	 * branch name — so no branch can be hidden behind it.
	 */
	function submit(event: SubmitEvent) {
		event.preventDefault();
		const name = input?.value.trim() ?? '';
		if (name === '') return;
		const branch = name === 'HEAD' ? undefined : name;
		if (branch !== undefined && !isBranchName(branch)) {
			input?.setCustomValidity('Git allows no branch of that name.');
			input?.reportValidity();
			return;
		}
		if (branch === ref.branch) close();
		else goto(onBranch(ref, branch));
	}

	/** Escape is owned here, so the focus returns to the address rather than the page. */
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		event.preventDefault();
		close();
	}

	const outside = (target: EventTarget | null) => target instanceof Node && !root?.contains(target);

	/**
	 * Tabbing out closes the menu. A focus that goes nowhere does not: Safari
	 * focuses no link on a click, and closing then would take the link away
	 * before the click lands. A click elsewhere is `onpointerdown`'s to handle.
	 */
	function onfocusout(event: FocusEvent) {
		if (outside(event.relatedTarget)) open = false;
	}

	function onpointerdown(event: PointerEvent) {
		if (outside(event.target)) open = false;
	}
</script>

<svelte:window {onpointerdown} />

<!-- A container catching what its button, field and links let bubble up, not a
     control of its own: hence no role to give it. -->
<div class="branch" role="presentation" bind:this={root} {onkeydown} {onfocusout}>
	<button
		class="address"
		bind:this={toggle}
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="branch-menu"
		title="Read another branch (b)"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
			><path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path
				d="M18 9a9 9 0 0 1-9 9"
			/></svg
		>
		{formatRepoPath(ref)}
	</button>

	{#if open}
		<!-- Focusable, so a click on its text keeps the focus inside it. -->
		<div class="menu" id="branch-menu" tabindex="-1">
			<form class="field input-pill" onsubmit={submit}>
				<span class="at">@</span>
				<input
					bind:this={input}
					oninput={() => input?.setCustomValidity('')}
					{@attach (node) => node.focus()}
					placeholder="branch name"
					aria-label="Branch"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
				/>
			</form>
			<ul>
				<li>
					<a href={onBranch(ref, undefined)} aria-current={ref.branch ? undefined : 'page'}
						><span class="name">HEAD</span> <span class="detail">the default branch</span></a
					>
				</li>
				<!-- The cache is read as the menu opens rather than with the page,
				     since most readers never open it; storage can be unavailable,
				     and typing a name still works then. -->
				{#await openStore()
					.keys()
					.catch(() => []) then keys}
					{#each branchesOf(ref, keys) as branch (branch)}
						<li>
							<a
								href={onBranch(ref, branch)}
								aria-current={branch === ref.branch ? 'page' : undefined}
								><span class="name">{branch}</span></a
							>
						</li>
					{/each}
				{/await}
			</ul>
			<p class="note">A branch read before comes from the cache. Any other costs one request.</p>
		</div>
	{/if}
</div>

<style>
	.branch {
		position: relative;
	}

	/* The address as the header always showed it, with a branch glyph to say
	   what clicking it does. Pulled into its own padding, so the text stays
	   where the plain label stood. */
	.address {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: var(--target);
		margin-left: -0.6rem;
		padding: 0 0.6rem;
		font-family: var(--font-mono);
		font-size: inherit;
		color: var(--ink-2);
		background: none;
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
	}

	.address:hover,
	.address[aria-expanded='true'] {
		color: var(--fg);
		background: var(--tint);
	}

	.address svg {
		width: 0.95rem;
		height: 0.95rem;
		color: var(--muted);
	}

	.menu {
		width: 20rem;
		max-width: 90vw;
		white-space: normal;
		outline: none;
	}

	.field {
		display: flex;
		align-items: center;
		margin-bottom: 0.35rem;
		padding: 0 0.85rem;
		box-shadow: none;
	}

	.at {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--muted);
	}

	input {
		flex-grow: 1;
		min-width: 0;
		padding: 0.55rem 0 0.55rem 0.15rem;
	}

	li a:hover {
		background: var(--tint);
	}

	li a[aria-current='page'] {
		background: var(--accent-wash);
	}

	.name {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--accent-text);
		overflow-wrap: anywhere;
	}

	.detail {
		color: var(--ink-2);
	}

	.note {
		margin: 0.35rem 0 0;
		padding: 0.5rem 0.75rem 0.15rem;
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
