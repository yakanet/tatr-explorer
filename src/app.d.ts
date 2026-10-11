// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Window {
		/**
		 * File System Access, which the DOM library does not declare yet: it is
		 * Chromium only, so every call site has to check for it anyway.
		 */
		showDirectoryPicker?(options?: {
			mode?: 'read' | 'readwrite';
			id?: string;
		}): Promise<FileSystemDirectoryHandle>;
	}

	/**
	 * File System Observer (Chrome and Edge 133 and later), undeclared for the
	 * same reason: what reports a change under a folder's handle. Declared as
	 * possibly absent, which is what a page has to assume of it.
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

	interface DataTransferItem {
		/**
		 * File System Access again, and undeclared for the same reason: a dropped
		 * folder arrives as a handle on Chromium and as a legacy entry elsewhere.
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
