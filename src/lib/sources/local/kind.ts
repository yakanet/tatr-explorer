/**
 * The folder the reader has open, as a source. This folder's entry, as
 * `kind.ts` is in every source folder: the file that builds the
 * {@link SourceKind} the registry holds.
 *
 * A local source is a session where a forge is an address: the browser grants
 * access on a gesture and takes it back on a reload, so nothing here could be
 * restored from a URL. The gesture opens a source on the folder, which owns it
 * from then on (its files, its way back and the `blob:` URLs it hands out), and
 * the navigation that follows finds that source here.
 */
import type { Followable } from '../capabilities.ts';
import { settle } from '../settle.ts';
import { SourceError, type Listing, type Source, type SourceKind } from '../source.ts';
import {
	fromWayBack,
	listFolder,
	type LocalFolder,
	readBranch,
	tasksDirectoryOf,
	type WayBack
} from './folder.ts';

/**
 * A folder handed over once, as files: the directory input, which gives no way
 * back to the folder they came from. Read, and nothing more; refreshing it
 * means picking it again.
 *
 * Without a folder, it is the source every reload leaves, and the source of a
 * folder let go of when another was picked: the reference still resolves, and
 * the source says there is nothing behind it, rather than listing nothing or
 * reading the folder picked since.
 *
 * What it cannot do is as telling as what it can: it is not `Cached`, because
 * reading the folder is free and a stored copy of files someone is editing
 * would be wrong before it was written, and not `Linked`, because there is no
 * page anywhere to link a file to.
 */
class FolderSnapshot implements Source {
	readonly id = LOCAL_WORD;
	// A disk has no CDN to be polite to.
	readonly concurrency = Number.POSITIVE_INFINITY;
	readonly label: string;
	protected folder: LocalFolder | null;
	/** Why there is nothing to list, once there is not. */
	#gone =
		'A folder is read where it sits, so the browser only grants access while you are ' +
		'here: a reload takes it back. Choose or drop it again to carry on.';

	/**
	 * One `blob:` per path, so a body rendered twice does not leak two.
	 *
	 * Kept through a reread, which hands over a new `File` for every file. One
	 * that did not change keeps its URL: the views go on showing a reading until
	 * the next one lands, and a body that is not rendered again still links to
	 * it, while one that is comes out as the same HTML. One that changed gets a
	 * new URL and the old one is revoked then, having led to a snapshot the
	 * browser refuses to read once its file changed on disk.
	 */
	#assets = new Map<string, { file: File; url: string }>();

	constructor(folder: LocalFolder | null) {
		this.folder = folder;
		// The folder's own name, which is all the identity it has.
		this.label = folder?.name ?? '';
	}

	async list(): Promise<Listing> {
		const folder = this.folder;
		if (!folder) throw new SourceError('no-source', this.#gone);
		return {
			entries: listFolder(folder),
			branch: (await readBranch(folder)) ?? 'working tree'
		};
	}

	/** One file, the way a fetch of a raw URL would read it. */
	async read(path: string): Promise<string | null> {
		const file = this.folder?.files.get(path);
		if (!file) return null;
		return file.text();
	}

	/**
	 * A URL for one file of the folder, which is what a forge answers with a raw
	 * endpoint: an image in a task's body, or a file in its Files panel.
	 *
	 * `blob:` URLs live until revoked, so they are made once per version of a
	 * file and dropped with the source that made them.
	 */
	assetUrl(path: string): string | null {
		const file = this.folder?.files.get(path);
		if (!file) return null;
		const known = this.#assets.get(path);
		if (known && unchanged(known.file, file)) return known.url;
		if (known) URL.revokeObjectURL(known.url);
		const url = URL.createObjectURL(file);
		this.#assets.set(path, { file, url });
		return url;
	}

	/** Lets go of the folder, and revokes every URL handed out for it. */
	close(): void {
		for (const { url } of this.#assets.values()) URL.revokeObjectURL(url);
		this.#assets = new Map();
		this.folder = null;
		this.#gone = 'Another folder was opened since this one was read.';
	}
}

/**
 * A folder with a way back to it, the picker's handle or the entry tree of a
 * drop: read again on demand, and followed as it changes.
 */
class LiveFolder extends FolderSnapshot implements Followable {
	readonly #back: WayBack;

	constructor(folder: LocalFolder, back: WayBack) {
		super(folder);
		this.#back = back;
	}

	async reread(): Promise<void> {
		if (!this.folder) return;
		const folder = await fromWayBack(this.#back);
		// The folder alone: closing it would revoke what the reading on screen
		// links to. Unless it was let go of meanwhile, which a reread must not undo.
		if (this.folder) this.folder = folder;
	}

	follow(onChange: () => void): () => void {
		return followFolder(this.#back, onChange);
	}
}

/** One file read twice, which a reread hands over as two objects. */
function unchanged(before: File, after: File): boolean {
	return before.size === after.size && before.lastModified === after.lastModified;
}

/**
 * Calls `onChange` when the folder may have changed, and returns how to stop.
 *
 * The system says so where it can: `FileSystemObserver` reports a change under
 * a handle, on Chromium. Elsewhere, and should observing fail, the cue is the
 * page regaining focus, which is the moment the reader comes back from the
 * editor.
 */
function followFolder(back: WayBack, onChange: () => void): () => void {
	const Observer = globalThis.FileSystemObserver;
	if (!('kind' in back) || !Observer) return onFocus(onChange);

	// Any change at all, an editor's swap file included: reading again costs a
	// few milliseconds, and a reading that moves nothing leaves the badges be.
	const burst = settle(onChange);
	const observer = new Observer(burst.trigger);
	// Kept, so that an `observe` answering after the stop does not revive it.
	let stopped = false;
	let unfocus: (() => void) | undefined;
	tasksDirectoryOf(back)
		.then((tasks) => {
			if (tasks && !stopped) return observer.observe(tasks, { recursive: true });
		})
		.catch(() => {
			if (!stopped) unfocus = onFocus(onChange);
		});

	return () => {
		stopped = true;
		burst.cancel();
		observer.disconnect();
		unfocus?.();
	};
}

function onFocus(onChange: () => void): () => void {
	window.addEventListener('focus', onChange);
	return () => window.removeEventListener('focus', onChange);
}

/**
 * The source of the folder last handed over, until another replaces it. Every
 * reading of that folder is a reading of this source, so coming back to it
 * finds the folder as it was last read, and the URLs it handed out still good.
 */
let current: FolderSnapshot | null = null;

/** Opens a source on a folder a gesture handed over, letting go of the last one. */
export function openFolder(folder: LocalFolder, back?: WayBack): void {
	closeFolder();
	current = sourceOver(folder, back);
}

/** Lets go of the folder, and of every URL its source handed out. */
export function closeFolder(): void {
	current?.close();
	current = null;
}

/** A source of the class the way back allows: read again and followed only by one. */
function sourceOver(folder: LocalFolder, back: WayBack | undefined): FolderSnapshot {
	if (back === undefined) return new FolderSnapshot(folder);
	return new LiveFolder(folder, back);
}

/** The local folder's address, and all of it. */
export const LOCAL_WORD = 'local';

export const localKind: SourceKind = {
	id: LOCAL_WORD,

	// One word, and nothing else: the folder's name would read as an address,
	// and nobody else's machine can follow it.
	address: { word: LOCAL_WORD },

	describe: () => 'a folder on this machine',

	// A working tree is on whatever branch is checked out, which `.git/HEAD` says.
	branches: false,

	cost: {
		listing: 'from this machine',
		files: 'The folder is read where it sits: nothing is uploaded.'
	},

	// With nothing handed over, the source every reload leaves.
	open: () => current ?? new FolderSnapshot(null)
};
