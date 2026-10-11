<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { onBranch } from '../repo/branch.ts';
	import { branchesOf } from '../repo/recent.ts';
	import { formatRepoPath, isBranchName, type ForgeRef } from '../repo/ref.ts';
	import { openStore } from '../sources/store.ts';

	let {
		ref,
		open = $bindable(false)
	}: {
		/** A repository on a forge: a folder has no branch to choose. */
		ref: ForgeRef;
		/** Bound, so that `b` can open the menu from the keyboard layer. */
		open?: boolean;
	} = $props();

	let root = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let toggle = $state<HTMLButtonElement | null>(null);

	// Any navigation closes the menu, which was about the page left behind.
	afterNavigate(() => {
		open = false;
	});

	/**
	 * Closes the menu and gives the focus back to the address. The focus moves
	 * first, so leaving the field for the address does not count as leaving the
	 * menu.
	 */
	function close() {
		toggle?.focus();
		open = false;
	}

	/**
	 * Opens the branch typed. `HEAD` means the default branch, as in git, which
	 * refuses it as a branch name.
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

	/** Handles Escape here, so the focus returns to the address rather than the page. */
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		event.preventDefault();
		close();
	}

	const outside = (target: EventTarget | null) => target instanceof Node && !root?.contains(target);

	/**
	 * Closes the menu when the focus moves to an element outside it. A focus
	 * going nowhere is ignored, because Safari focuses no link on a click, and
	 * closing would remove the link before the click lands.
	 */
	function onfocusout(event: FocusEvent) {
		if (outside(event.relatedTarget)) open = false;
	}

	function onpointerdown(event: PointerEvent) {
		if (outside(event.target)) open = false;
	}
</script>

<svelte:window {onpointerdown} />

<!-- A container for the events its children bubble up, not a control, so it
     has no role. -->
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
				<!-- The cache is read when the menu opens, since most readers never
				     open it. Typing a name still works when storage is unavailable. -->
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

	/* A branch glyph says what clicking the address does. The negative margin
	   cancels the padding, so the text stays aligned with the header. */
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
