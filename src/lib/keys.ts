/**
 * The keyboard map, kept apart from the listener that feeds it.
 *
 * Deciding what a keystroke means is a pure function of the key and whatever
 * half-finished sequence preceded it, so it is worth asserting rather than
 * driving a browser to find out. The listener's own job (ignoring keys typed
 * into a field, ignoring modified keys) is the part that needs a DOM.
 *
 * The bindings are the ones a reader of this format already has in their
 * fingers: `j`/`k` and `g g` from vi, `/` and `?` from less, `1`-`9` from
 * anything with tabs, `b` for branch. Arrows do whatever their vi twin does, so
 * nothing here has to be learned to be usable.
 */

export type Action =
	/** Move the focus one navigable item along. */
	| { kind: 'next' }
	| { kind: 'previous' }
	/** Jump to the ends of the same list. */
	| { kind: 'first' }
	| { kind: 'last' }
	/** Put the caret in the query box. */
	| { kind: 'search' }
	| { kind: 'help' }
	/** Escape: close whatever is open, or give up the focus. */
	| { kind: 'dismiss' }
	/** Switch view by position in the nav, counted from zero. */
	| { kind: 'view'; index: number }
	/** Open the header's field for reading another branch. */
	| { kind: 'branch' };

/**
 * What a partly-typed sequence leaves behind. Only `g` starts one, so this is a
 * single slot rather than a buffer: `g g` is the whole of the grammar.
 */
export interface Pending {
	sequence: 'g' | null;
}

export const NOTHING_PENDING: Pending = { sequence: null };

export interface Pressed {
	action: Action | null;
	pending: Pending;
}

const SIMPLE: Record<string, Action> = {
	j: { kind: 'next' },
	ArrowDown: { kind: 'next' },
	k: { kind: 'previous' },
	ArrowUp: { kind: 'previous' },
	G: { kind: 'last' },
	Home: { kind: 'first' },
	End: { kind: 'last' },
	'/': { kind: 'search' },
	'?': { kind: 'help' },
	b: { kind: 'branch' },
	Escape: { kind: 'dismiss' }
};

/**
 * Reads one keystroke.
 *
 * Anything unrecognised clears a pending sequence rather than holding it: `g x`
 * has to be inert, or a stray key would leave `g` armed and turn the reader's
 * next `g` into a jump they did not ask for.
 */
export function press(key: string, pending: Pending = NOTHING_PENDING): Pressed {
	if (pending.sequence === 'g') {
		return key === 'g'
			? { action: { kind: 'first' }, pending: NOTHING_PENDING }
			: { action: null, pending: NOTHING_PENDING };
	}

	if (key === 'g') return { action: null, pending: { sequence: 'g' } };

	const simple = SIMPLE[key];
	if (simple) return { action: simple, pending: NOTHING_PENDING };

	if (/^[1-9]$/.test(key)) {
		return { action: { kind: 'view', index: Number(key) - 1 }, pending: NOTHING_PENDING };
	}

	return { action: null, pending: NOTHING_PENDING };
}

interface Binding {
	keys: string;
	does: string;
	/**
	 * The action that only some pages offer: a nav to switch between, a branch
	 * to choose. The help panel leaves the binding out elsewhere rather than
	 * advertise a key that is inert there.
	 */
	needs?: Extract<Action['kind'], 'view' | 'branch'>;
}

/**
 * Every binding, for the help panel. Ordered as it should be read, not as the
 * table above happens to be written.
 */
export const BINDINGS: readonly Binding[] = [
	{ keys: 'j / k', does: 'move down and up' },
	{ keys: '↓ / ↑', does: 'the same' },
	{ keys: 'g g', does: 'jump to the first' },
	{ keys: 'G', does: 'jump to the last' },
	{ keys: 'Enter', does: 'open what is focused' },
	{ keys: '/', does: 'search' },
	{ keys: '1 … 9', does: 'switch view', needs: 'view' },
	{ keys: 'b', does: 'read another branch', needs: 'branch' },
	{ keys: '?', does: 'this list' },
	{ keys: 'Esc', does: 'close, or leave the box' }
];
