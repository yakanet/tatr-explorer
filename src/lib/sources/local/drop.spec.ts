import { describe, expect, it } from 'vitest';
import { directory, entryTree } from '#tests/support/fake-directory.ts';
import { canDropFolder, droppedFolder } from './drop.ts';

/** A dropped item as Chromium hands it over, with a handle behind it. */
function chromiumItem(handle: FileSystemHandle | null): DataTransferItem {
	return {
		getAsFileSystemHandle: async () => handle,
		webkitGetAsEntry: () => null
	} as unknown as DataTransferItem;
}

/** A dropped item as Firefox and Safari hand it over, with only an entry. */
function entryItem(entry: FileSystemEntry | null): DataTransferItem {
	return { webkitGetAsEntry: () => entry } as unknown as DataTransferItem;
}

const repository = { 'tasks/20260101-000001/TASK.md': '# a\n' };

describe('droppedFolder', () => {
	it('takes the handle Chromium gives for a dropped folder', async () => {
		const handle = directory('repo', repository);
		expect(await droppedFolder([chromiumItem(handle)])).toBe(handle);
	});

	it('takes the entry tree a drop gives elsewhere', async () => {
		const tree = entryTree('repo', repository);
		expect(await droppedFolder([entryItem(tree)])).toBe(tree);
	});

	it('looks past dropped files and items that are not files', async () => {
		const handle = directory('repo', repository);
		const file = { kind: 'file', name: 'notes.txt' } as FileSystemHandle;
		expect(
			await droppedFolder([chromiumItem(null), chromiumItem(file), chromiumItem(handle)])
		).toBe(handle);
	});

	it('finds no folder in a drop of files', async () => {
		const file = { isDirectory: false, name: 'notes.txt' } as FileSystemEntry;
		expect(await droppedFolder([entryItem(file), entryItem(null)])).toBeNull();
		expect(await droppedFolder([])).toBeNull();
	});

	it('asks for each item before its first await, while the browser still holds the list', () => {
		let asked = false;
		const item = {
			getAsFileSystemHandle: async () => {
				asked = true;
				return null;
			},
			webkitGetAsEntry: () => null
		} as unknown as DataTransferItem;
		void droppedFolder([item]);
		expect(asked).toBe(true);
	});
});

describe('canDropFolder', () => {
	it('says no where the browser has no drop items, as in Node', () => {
		expect(canDropFolder()).toBe(false);
	});
});
