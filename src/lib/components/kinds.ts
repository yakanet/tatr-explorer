/**
 * What a kind of source brings to the page that only a component can: the
 * gesture that opens one of its sources again, where a gesture is the only way
 * back (a folder the browser forgot on the reload, or handed over with no way
 * to read it again).
 *
 * Here rather than in the kind, which stays free of Svelte as everything under
 * `sources/` does. Keyed like the registry, so a kind added there and forgotten
 * here does not compile.
 */
import type { Component } from 'svelte';
import type { RepoRef } from '../repo/ref.ts';
import { kindOf, type KindId } from '../sources/open.ts';
import FolderPicker from './FolderPicker.svelte';

/**
 * A control that opens a source of its kind again, and what it says in the
 * failure panel, where it stands in for Try again.
 */
export interface Reopener {
	readonly control: Component<{ label?: string }>;
	readonly label: string;
}

const KIND_UI = {
	github: null,
	local: { control: FolderPicker, label: 'Choose a folder…' },
	served: null
} satisfies Record<KindId, Reopener | null>;

/**
 * The gesture that opens the source of `ref` again, or null where asking the
 * source again is enough (a forge, the served folder) or nothing reads `ref`.
 */
export function reopenerOf(ref: RepoRef): Reopener | null {
	const kind = kindOf(ref);
	if (!kind) return null;
	// The registry's keys are its kinds' ids, which its spec checks.
	return KIND_UI[kind.id as KindId];
}
