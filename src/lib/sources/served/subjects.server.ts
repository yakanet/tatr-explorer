/**
 * How the contract every source runs builds the served folder's sources, for
 * the specs: nothing in the application imports this file.
 */
import { servedRef } from '../../repo/ref.ts';
import type { Subject } from '../contract.spec.ts';
import type { Source } from '../source.ts';
import { scratchFolder, serving, writeTree } from './disk-tree.server.ts';
import { servedKind } from './kind.ts';

/** A dev server that has stopped. */
export const unreachable = (async () => {
	throw new TypeError('Failed to fetch');
}) as typeof fetch;

function openOver(fetchImpl: typeof fetch): Source {
	return servedKind('my-project').open(servedRef(), { fetchImpl });
}

export function subjects(): Subject[] {
	const scratch = scratchFolder();
	return [
		{
			name: 'a folder the dev server serves',
			async holding(tree) {
				await writeTree(scratch(), tree);
				return openOver(await serving(scratch()));
			},
			broken: () => openOver(unreachable),
			// The folder is on the disk, where a change to the tree has to be written.
			sync: (tree) => writeTree(scratch(), tree)
		}
	];
}
