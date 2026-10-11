/**
 * The folder the reader has open, as a source. This folder's entry, as
 * `kind.ts` is in every source folder: the file that builds the
 * {@link SourceKind} the registry holds.
 *
 * A local source is a session where a forge is an address: the browser grants
 * access on a gesture and takes it back on a reload, so nothing here could be
 * restored from a URL. Hence state that belongs to the module rather than to
 * storage, and hence this file, which holds for a folder what a forge keeps in
 * its chain of listers and its URL shapes: the source itself.
 */
import { isLocal } from '../../repo/ref.ts';
import { NoSourceError, type Source, type SourceKind } from '../source.ts';
import { fromDirectoryHandle, listFolder, type LocalFolder, readBranch } from './folder.ts';

/**
 * The folder, and the handle it arrived with when it had one.
 *
 * Keeping the handle is what lets a refresh reread the folder where the API
 * provides one; without it, refreshing means picking again.
 */
let opened: LocalFolder | null = null;
let openedHandle: FileSystemDirectoryHandle | null = null;
/**
 * One `blob:` per path, so a body rendered twice does not leak two.
 *
 * Kept through a reread, which hands over a new `File` for every file. One that
 * did not change keeps its URL: the views go on showing a reading until the
 * next one lands, and a body that is not rendered again still links to it,
 * while one that is comes out as the same HTML. One that changed gets a new
 * URL and the old one is revoked then, having led to a snapshot the browser
 * refuses to read once its file changed on disk.
 */
let assets = new Map<string, { file: File; url: string }>();

export function openFolder(folder: LocalFolder, handle?: FileSystemDirectoryHandle): void {
	closeFolder();
	opened = folder;
	openedHandle = handle ?? null;
}

function openedFolder(): LocalFolder | null {
	return opened;
}

/** Whether a refresh can reread the folder, or has to ask for it again. */
function canReread(): boolean {
	return openedHandle !== null;
}

/** Rereads the folder from its handle, for the refresh control. */
async function reread(): Promise<void> {
	// The folder alone: closing it would revoke what the reading on screen links to.
	if (openedHandle) opened = await fromDirectoryHandle(openedHandle);
}

export function closeFolder(): void {
	for (const { url } of assets.values()) URL.revokeObjectURL(url);
	assets = new Map();
	opened = null;
	openedHandle = null;
}

/**
 * A URL for one file of the folder, which is what a forge answers with a raw
 * endpoint: an image in a task's body, or a file in its Files panel.
 *
 * `blob:` URLs live until revoked, so they are made once per version of a file
 * and dropped with the folder they came from.
 */
function assetUrl(path: string): string | null {
	const file = opened?.files.get(path);
	if (!file) return null;
	const known = assets.get(path);
	if (known && unchanged(known.file, file)) return known.url;
	if (known) URL.revokeObjectURL(known.url);
	const url = URL.createObjectURL(file);
	assets.set(path, { file, url });
	return url;
}

/** One file read twice, which a reread hands over as two objects. */
function unchanged(before: File, after: File): boolean {
	return before.size === after.size && before.lastModified === after.lastModified;
}

/**
 * The folder the reader has open, as a source. This folder's entry, as
 * `kind.ts` is in every source folder: the file that builds the
 * {@link SourceKind} the registry holds.
 *
 * What it does not have is as telling as what it does: no cache key, because
 * reading the folder is free and a stored copy of files someone is editing
 * would be wrong before it was written; no `fileUrl`, because there is no page
 * anywhere to link a file to. Both were branches in the loader and in a view
 * before this interface existed.
 */
export const localKind: SourceKind = {
	id: 'local',

	claims: (ref) => isLocal(ref),

	open(): Source {
		return {
			id: 'local',
			label: openedFolder()?.name ?? '',
			cacheKey: null,
			// A disk has no CDN to be polite to.
			concurrency: Number.POSITIVE_INFINITY,
			// Only where a handle was kept: a directory input hands over files and
			// no way back to the folder they came from.
			repeatable: canReread(),
			refresh: reread,

			async list() {
				const open = openedFolder();
				if (!open) {
					throw new NoSourceError('No folder is open. The browser forgets one on every reload.');
				}
				return {
					entries: listFolder(open),
					branch: (await readBranch(open)) ?? 'working tree'
				};
			},

			read: (path) => readFile(path),
			assetUrl
		};
	}
};

/** Reads one file, the way a fetch of a raw URL would. */
async function readFile(path: string): Promise<string | null> {
	const file = opened?.files.get(path);
	return file ? file.text() : null;
}
