/**
 * The controls that reopen a source when only a user gesture can, such as a
 * folder the browser forgot on reload. They live here because `sources/` stays
 * free of Svelte, keyed by `SourceId` so a new source does not compile without
 * an entry.
 */
import type { Component } from 'svelte';
import type { RepoRef } from '../repo/ref.ts';
import type { SourceId } from '../sources/open.ts';
import FolderPicker from './FolderPicker.svelte';

/**
 * A control that reopens a source, with its label, shown in the failure panel
 * in place of Try again.
 */
export interface Reopener {
	readonly control: Component<{ label?: string }>;
	readonly label: string;
}

const REOPENERS = {
	github: null,
	local: { control: FolderPicker, label: 'Choose a folder…' },
	served: null
} satisfies Record<SourceId, Reopener | null>;

/**
 * The reopener for the source of `ref`, or null when a plain retry is enough
 * (a forge, the served folder) or no source reads `ref`.
 */
export function reopenerOf(ref: RepoRef): Reopener | null {
	if (!ref.source) return null;
	return REOPENERS[ref.source];
}
