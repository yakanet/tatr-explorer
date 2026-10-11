/**
 * The source of a folder the reader opened in the browser.
 *
 * The browser grants access to a folder on a gesture and takes it back on a
 * reload, so no URL can restore it. The gesture calls `openFolder`, and the
 * navigation that follows finds that source through `LocalFolderSource.open`.
 */
import type { Followable, Writable, WriteAnswer } from '../capabilities.ts';
import { settle } from '../settle.ts';
import { messageOf, SourceError, type Address, type Listing, type Source } from '../contract.ts';
import { fromDirectoryEntry } from './directory-entry.ts';
import {
	askToWrite,
	canWriteThrough,
	fromDirectoryHandle,
	tasksDirectoryOf,
	writeThrough
} from './directory-handle.ts';
import { listFolder, type LocalFolder, readBranch } from './folder.ts';

/** What lets a folder be walked again: a directory handle, or the entry tree of a drop. */
export type WayBack = FileSystemDirectoryHandle | FileSystemDirectoryEntry;

/** Walks a folder again through its `WayBack`, stopping at the next entry once `signal` aborts. */
export function fromWayBack(back: WayBack, signal?: AbortSignal): Promise<LocalFolder> {
	if ('kind' in back) return fromDirectoryHandle(back, signal);
	return fromDirectoryEntry(back, signal);
}

/** The path of this site that is the local folder's address, `/local`. */
export const LOCAL_PATH = 'local';

/**
 * A folder on this machine, as a source. It reads a folder the directory input
 * handed over, with no way back, so refreshing means picking it again;
 * {@link LiveFolderSource} reads one that has a way back.
 *
 * Without a folder, after a reload or once another was opened, `list` throws
 * `no-source` rather than listing nothing or reading the folder opened since.
 */
export class LocalFolderSource implements Source {
	// A fixed path: the folder's name in the URL would read as an address that
	// another machine could follow.
	static readonly address: Address = { path: LOCAL_PATH };

	/** The source of the folder last opened, or one with no folder. */
	static open(): LocalFolderSource {
		return current ?? new LocalFolderSource(null);
	}

	// The disk needs no throttling.
	readonly concurrency = Number.POSITIVE_INFINITY;
	readonly cost = {
		listing: 'from this machine',
		files: 'The folder is read where it sits: nothing is uploaded.'
	};
	readonly label: string;
	protected folder: LocalFolder | null;
	/** The message `list` throws once there is no folder. */
	#gone =
		'A folder is read where it sits, so the browser only grants access while you are ' +
		'here: a reload takes it back. Choose or drop it again to carry on.';

	/**
	 * One `blob:` URL per path, so a body rendered twice does not leak a second.
	 *
	 * Kept through a reread: an unchanged file keeps its URL, so the reading
	 * still on screen goes on linking to it. A changed file gets a new URL and
	 * the old one is revoked, as the browser refuses to read a `File` whose file
	 * changed on disk.
	 */
	#assets = new Map<string, { file: File; url: string }>();

	constructor(folder: LocalFolder | null) {
		this.folder = folder;
		this.label = folder?.name ?? 'a folder on this machine';
	}

	async list(): Promise<Listing> {
		const folder = this.held();
		return {
			entries: listFolder(folder),
			branch: (await readBranch(folder)) ?? 'working tree'
		};
	}

	/** The file's text, or null when the folder does not hold it. */
	async read(path: string): Promise<string | null> {
		const file = this.folder?.files.get(path);
		if (!file) {
			return null;
		}
		return file.text();
	}

	/** A `blob:` URL for the file, reused while the file is unchanged. */
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

	/** The folder, or a `no-source` error once there is none. */
	protected held(): LocalFolder {
		if (!this.folder) throw new SourceError('no-source', this.#gone);
		return this.folder;
	}

	/** Lets go of the folder, and revokes every URL handed out for it. */
	close(): void {
		for (const { url } of this.#assets.values()) URL.revokeObjectURL(url);
		this.#assets = new Map();
		this.folder = null;
		this.#gone = 'Another folder was opened since this one was read.';
	}
}

/** A folder with a `WayBack`, which can be read again and followed as it changes. */
class LiveFolderSource extends LocalFolderSource implements Followable {
	protected readonly back: WayBack;

	constructor(folder: LocalFolder, back: WayBack) {
		super(folder);
		this.back = back;
	}

	async reread(signal?: AbortSignal): Promise<void> {
		if (!this.folder) return;
		const folder = await fromWayBack(this.back, signal);
		// A later reading aborted this one, and its newer tree may already be in place.
		signal?.throwIfAborted();
		// Swapped, not closed: closing would revoke the URLs the reading on screen
		// links to. A folder let go of meanwhile stays let go of.
		if (this.folder) this.folder = folder;
	}

	follow(onChange: () => void): () => void {
		return followFolder(this.back, onChange);
	}
}

/**
 * A folder whose handle can write, picked or dropped on Chromium. The reader is
 * asked whether this page may edit it on the first write, so that a reader who
 * only reads is never asked.
 */
class WritableFolderSource extends LiveFolderSource implements Writable {
	declare protected readonly back: FileSystemDirectoryHandle;
	/** The reader's answer, kept once given so that a refusal is not asked again. */
	#allowed: Promise<boolean> | null = null;

	async write(path: string, text: string, expected: string): Promise<WriteAnswer> {
		const folder = this.held();
		if (!(await this.#allow())) return 'refused';
		let written: File | null;
		try {
			written = await writeThrough(this.back, path, text, expected);
		} catch (error) {
			throw new SourceError(
				'not-written',
				`The folder refused to write ${path}: ${messageOf(error)}`
			);
		}
		// A file removed since it was read has changed too, as reading again shows.
		if (!written) return 'changed';
		// The source holds what it wrote, until the next reading replaces it.
		folder.files.set(path, written);
		return 'written';
	}

	/**
	 * Asks the reader once whether this page may write. A browser that refuses to
	 * ask, as it does long after the last click, leaves the question open.
	 */
	async #allow(): Promise<boolean> {
		this.#allowed ??= askToWrite(this.back);
		try {
			return await this.#allowed;
		} catch {
			this.#allowed = null;
			throw new SourceError(
				'not-written',
				'The browser asks whether this page may edit the folder only right after a click: try again.'
			);
		}
	}
}

/** Whether two `File`s of one path, from two readings, hold the same version. */
function unchanged(before: File, after: File): boolean {
	return before.size === after.size && before.lastModified === after.lastModified;
}

/**
 * Calls `onChange` when the folder may have changed, and returns how to stop.
 * It uses `FileSystemObserver` on a handle where the browser has it, and falls
 * back on the page regaining focus, when the reader returns from the editor.
 */
function followFolder(back: WayBack, onChange: () => void): () => void {
	const Observer = globalThis.FileSystemObserver;
	if (!('kind' in back) || !Observer) return onFocus(onChange);

	// Every change counts, swap files included: reading again is cheap, and a
	// reading with no difference changes nothing on screen.
	const burst = settle(onChange);
	const observer = new Observer(burst.trigger);
	// Checked after each await, so nothing answering after the stop follows again.
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
 * The source of the folder last opened. It outlives navigations, so coming
 * back finds the folder as last read and its URLs still valid.
 */
let current: LocalFolderSource | null = null;

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

function sourceOver(folder: LocalFolder, back: WayBack | undefined): LocalFolderSource {
	if (back === undefined) {
		return new LocalFolderSource(folder);
	}
	if ('kind' in back && canWriteThrough(back)) {
		return new WritableFolderSource(folder, back);
	}
	return new LiveFolderSource(folder, back);
}
