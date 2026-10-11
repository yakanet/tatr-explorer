/**
 * How the contract every source runs builds the local folder's sources, for
 * the specs: nothing in the application imports this file.
 *
 * One per door a browser offers to a folder: they hand over different things,
 * and each must read as a source.
 */
import { afterEach } from 'vitest';
import { localRef } from '../../repo/ref.ts';
import type { Subject } from '../contract.spec.ts';
import type { Source } from '../source.ts';
import { directory, entryTree, fileList } from './fake-directory.ts';
import {
	fromDirectoryEntry,
	fromDirectoryHandle,
	fromFileList,
	type LocalFolder,
	type WayBack
} from './folder.ts';
import { closeFolder, localKind, openFolder } from './kind.ts';

/** What a door hands over for a folder: the folder, and a way back to it when it has one. */
type Door = (tree: Record<string, string>) => Promise<[LocalFolder, WayBack?]>;

function through(name: string, door: Door): Subject {
	return {
		name,
		async holding(tree) {
			openFolder(...(await door(tree)));
			return localKind.open(localRef());
		},
		broken: forgotten
	};
}

/** Nothing open: where every reload leaves a folder, the browser taking its grant back. */
function forgotten(): Source {
	closeFolder();
	return localKind.open(localRef());
}

export function subjects(): Subject[] {
	afterEach(() => closeFolder());
	return [
		through('a folder handed over by a directory input', async (tree) => [
			fromFileList(fileList('my-project', tree))!
		]),
		through('a folder picked, with a handle to it', async (tree) => {
			const handle = directory('my-project', tree);
			return [await fromDirectoryHandle(handle), handle];
		}),
		through('a folder dropped, with its entry tree', async (tree) => {
			const entry = entryTree('my-project', tree);
			return [await fromDirectoryEntry(entry), entry];
		})
	];
}
