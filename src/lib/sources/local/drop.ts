/**
 * A folder dropped on the page: a directory handle on Chromium, the legacy entry
 * tree elsewhere.
 */
import type { WayBack } from './source.ts';

/**
 * Whether a folder can be dropped on the page. A drop is the only way a browser
 * without `showDirectoryPicker` gets a folder it can reread.
 */
export function canDropFolder(): boolean {
	if (typeof DataTransferItem === 'undefined') return false;
	const item = DataTransferItem.prototype;
	return 'getAsFileSystemHandle' in item || 'webkitGetAsEntry' in item;
}

/**
 * Reads the dropped items and resolves to the folder among them, or null when
 * none is a folder. The items are read before the first await, because the
 * browser empties the list once the drop handler returns, so the handler calls
 * this before awaiting anything else.
 */
export async function droppedFolder(items: Iterable<DataTransferItem>): Promise<WayBack | null> {
	const pending = handlesOrEntries([...items]);
	// The spec answers null for an item that is not a file, and Chrome answers
	// `undefined` for one a script made, so any falsy value is skipped.
	const found = (await Promise.all(pending)).find((one): one is WayBack => !!one && isFolder(one));
	return found ?? null;
}

/** Reads each item as a handle where the browser has them, or as an entry. */
function handlesOrEntries(items: DataTransferItem[]) {
	if (items.some((item) => typeof item.getAsFileSystemHandle === 'function')) {
		return items.map((item) => item.getAsFileSystemHandle!());
	}
	return items.map((item) => item.webkitGetAsEntry());
}

/** Whether a dropped handle or entry is a folder. */
function isFolder(one: FileSystemHandle | FileSystemEntry): boolean {
	if ('kind' in one) return one.kind === 'directory';
	return one.isDirectory;
}
