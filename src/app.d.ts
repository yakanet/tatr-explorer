// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Window {
		/**
		 * File System Access, which the DOM library does not declare. Optional, as
		 * it is Chromium only.
		 */
		showDirectoryPicker?(options?: {
			mode?: 'read' | 'readwrite';
			id?: string;
		}): Promise<FileSystemDirectoryHandle>;
	}

	/**
	 * File System Observer, which reports changes under a handle (Chrome and Edge
	 * 133 and later). The DOM library does not declare it, and it may be absent.
	 */
	var FileSystemObserver:
		(new (callback: (records: FileSystemChangeRecord[]) => void) => FileSystemObserver) | undefined;

	interface FileSystemObserver {
		observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
		disconnect(): void;
	}

	interface FileSystemChangeRecord {
		readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
		/** Where the change happened, as path segments from the observed handle. */
		readonly relativePathComponents: readonly string[];
	}

	/**
	 * The name of the folder the dev server serves, or false, defined at compile
	 * time by the plugin in `src/lib/sources/served/folder.server.ts`.
	 */
	const __TATR_SERVED__: string | false;

	interface DataTransferItem {
		/**
		 * File System Access, which the DOM library does not declare: Chromium hands
		 * a dropped folder over as a handle.
		 */
		getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
