<script lang="ts">
	import { NOTHING_PENDING, press, type Pending } from '#lib/keys.ts';

	let {
		onview,
		onbranch,
		onhelp,
		ondismiss,
		modal = false
	}: {
		/**
		 * Switches to the view at this position in the nav. Absent where there is
		 * no nav, as on the homepage, where `1`-`9` then do nothing.
		 */
		onview?: (index: number) => void;
		/** `b`: absent where there is no branch to choose, as for a folder or on the homepage. */
		onbranch?: () => void;
		onhelp: () => void;
		/** Escape, which the layout uses to close whatever it has open. */
		ondismiss: () => void;
		/**
		 * True while something modal is open. Navigation then does nothing,
		 * because moving the focus would take it out of a dialog that claims
		 * `aria-modal`. This is simpler than trapping the focus.
		 */
		modal?: boolean;
	} = $props();

	let pending = $state<Pending>(NOTHING_PENDING);

	/**
	 * The elements `j`/`k` walk, in document order. Views mark them with
	 * `data-key-row` rather than registering them, so one implementation serves
	 * every view, and Enter works because a marked row is a link.
	 */
	const rows = () => [...document.querySelectorAll<HTMLElement>('[data-key-row]')];

	/**
	 * The index of the row holding the focus, or -1 when the focus is elsewhere.
	 *
	 * The focus may be on a marked element or inside it. It may also sit beside
	 * one: a list row marks its title link, while its tag buttons live in
	 * another cell. `closest` cannot find that row, since no ancestor of a tag
	 * carries the mark, so this walks up to the first ancestor holding a mark.
	 */
	function current(items: HTMLElement[]): number {
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return -1;

		const inside = items.findIndex((item) => item === active || item.contains(active));
		if (inside !== -1) return inside;

		for (let node = active.parentElement; node; node = node.parentElement) {
			const marks = node.querySelectorAll<HTMLElement>('[data-key-row]');
			if (marks.length === 0) continue;
			if (marks.length === 1) return items.indexOf(marks[0]);
			// An ancestor holding several marks is the whole list, so the focus is
			// beside the list rather than in a row.
			return -1;
		}
		return -1;
	}

	/**
	 * Moves the focus and marks it with `data-key-focus`, which the views style.
	 * `:focus-visible` is not enough, because browsers do not reliably match it
	 * for a focus moved by script, and `j`/`k` are useless without a visible
	 * focus.
	 */
	function focus(item: HTMLElement | undefined) {
		if (!item) return;

		for (const marked of document.querySelectorAll('[data-key-focus]')) {
			marked.removeAttribute('data-key-focus');
		}
		item.setAttribute('data-key-focus', '');
		item.focus();
		// `nearest` scrolls only when needed, so walking a visible list keeps the
		// page still.
		item.scrollIntoView({ block: 'nearest' });
	}

	/** Removes the focus mark from the element that loses the focus. */
	function onfocusout(event: FocusEvent) {
		if (event.target instanceof HTMLElement) event.target.removeAttribute('data-key-focus');
	}

	function move(step: number) {
		const items = rows();
		if (items.length === 0) return;

		let at = current(items);
		// Coming from outside the list, `j` lands on the first row (-1 + 1) and
		// `k` on the last, as if from one past the end.
		if (at === -1 && step < 0) at = items.length;
		focus(items[Math.min(items.length - 1, Math.max(0, at + step))]);
	}

	function jump(to: 'first' | 'last') {
		const items = rows();
		if (to === 'first') focus(items[0]);
		else focus(items[items.length - 1]);
	}

	/**
	 * Whether the keystroke's target is a field being typed into, so that `j` in
	 * the query box types a letter. Escape still leaves the field.
	 */
	function isTyping(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
	}

	function onkeydown(event: KeyboardEvent) {
		// A modified key belongs to the browser or the operating system.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (isTyping(event.target)) {
			if (event.key !== 'Escape') return;
			// The query box handles Escape itself while its menu is open, and says
			// so by consuming the event.
			if (event.defaultPrevented) return;
			(event.target as HTMLElement).blur();
			ondismiss();
			return;
		}

		const pressed = press(event.key, pending);
		pending = pressed.pending;
		if (!pressed.action) return;

		const action = pressed.action;
		// Behind a modal panel, only `?` and Escape still act.
		if (modal && action.kind !== 'help' && action.kind !== 'dismiss') return;
		if (action.kind === 'search') {
			const box = document.querySelector<HTMLElement>('[data-key-search]');
			if (!box) return;
			event.preventDefault();
			box.focus();
			return;
		}

		event.preventDefault();
		switch (action.kind) {
			case 'next':
				move(1);
				break;
			case 'previous':
				move(-1);
				break;
			case 'first':
				jump('first');
				break;
			case 'last':
				jump('last');
				break;
			case 'help':
				onhelp();
				break;
			case 'dismiss':
				ondismiss();
				break;
			case 'view':
				onview?.(action.index);
				break;
			case 'branch':
				onbranch?.();
				break;
		}
	}
</script>

<svelte:window {onkeydown} {onfocusout} />
