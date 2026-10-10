/**
 * Where a loaded repository is kept between visits.
 *
 * IndexedDB rather than localStorage, for three reasons that showed up in
 * measurement rather than in principle:
 *
 * - **Size.** One 64-task repository serialises to ~45 kB, so localStorage's
 *   ~5 MB would hold about a hundred of them, but a single repository with a
 *   few thousand tasks reaches several megabytes and would fill it alone.
 * - **Blocking.** localStorage is synchronous, so parsing a multi-megabyte
 *   entry stalls the main thread at exactly the moment the page is trying to
 *   render.
 * - **Types.** IndexedDB stores structured clones, so `Date` and `Map` survive
 *   a round trip. Through JSON they do not, and the loader would have to
 *   rebuild them by hand on every read.
 *
 * Storage is unavailable in several ordinary situations (private windows,
 * embedded contexts, the prerender pass, tests), so every path degrades to an
 * in-memory store rather than failing.
 */

const DB_NAME = 'tatr';
const DB_VERSION = 1;
const STORE = 'repositories';

export interface StoredRepo<T> {
	value: T;
	/** When this view was fetched, in epoch milliseconds. */
	storedAt: number;
}

export interface RepoStore {
	read<T>(key: string): Promise<StoredRepo<T> | null>;
	write<T>(key: string, value: T, now?: number): Promise<void>;
	clear(key?: string): Promise<void>;
	/**
	 * Everything held, newest first, for the homepage's list of repositories
	 * already read.
	 *
	 * It reads the values rather than only the keys, because what a card shows
	 * (how many tasks, how many open) lives in them. That means loading the whole
	 * cache: about 45 kB per repository, from local storage, which is nothing next
	 * to the request a card would otherwise cost. A cache large enough for that to
	 * matter would want a separate index of counts.
	 */
	list<T>(): Promise<{ key: string; value: T; storedAt: number }[]>;
	/**
	 * Every key held, without the values: what the header's branch menu needs
	 * to know is only which branches are cached, and reading the values to learn
	 * it would cost as much as the whole cache weighs.
	 */
	keys(): Promise<string[]>;
}

const newestFirst = (a: { storedAt: number }, b: { storedAt: number }) => b.storedAt - a.storedAt;

/** A store that lives for the lifetime of the page. Always available. */
export function memoryStore(): RepoStore {
	const map = new Map<string, StoredRepo<unknown>>();
	return {
		async read<T>(key: string) {
			return (map.get(key) as StoredRepo<T> | undefined) ?? null;
		},
		async write<T>(key: string, value: T, now = Date.now()) {
			map.set(key, { value, storedAt: now });
		},
		async clear(key?: string) {
			if (key === undefined) map.clear();
			else map.delete(key);
		},
		async keys() {
			return [...map.keys()];
		},
		async list<T>() {
			return [...map.entries()]
				.map(([key, stored]) => ({ key, value: stored.value as T, storedAt: stored.storedAt }))
				.sort(newestFirst);
		}
	};
}

/**
 * Whether a stored row is one this version can read.
 *
 * A row written before the wrapper existed carries the value alone and has no
 * timestamp, so it is skipped rather than shown as read at the epoch.
 */
function isStored<T>(value: unknown): value is StoredRepo<T> {
	if (typeof value !== 'object' || value === null) return false;
	return typeof (value as StoredRepo<T>).storedAt === 'number';
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/**
 * Every record of a store, walked with a cursor.
 *
 * A cursor hands over the key and the value of one record together, which is
 * the whole reason to prefer it to `getAllKeys()` plus `getAll()`: those return
 * two arrays a caller has to pair by index, and the pairing only holds while
 * nothing is written between the two reads. Reading them in one transaction
 * would make that true; a cursor makes it unnecessary, and a pairing that
 * cannot come apart beats one that is only argued.
 *
 * `continue()` is called from the success handler with nothing awaited in
 * between, which is what keeps the transaction alive: it commits as soon as it
 * runs out of work, and an `await` between two steps hands it that chance.
 */
export function collect<T>(store: IDBObjectStore): Promise<{ key: IDBValidKey; value: T }[]> {
	return new Promise((resolve, reject) => {
		const rows: { key: IDBValidKey; value: T }[] = [];
		const req = store.openCursor();
		req.onsuccess = () => {
			const cursor = req.result;
			if (!cursor) {
				resolve(rows);
				return;
			}
			rows.push({ key: cursor.key, value: cursor.value as T });
			cursor.continue();
		};
		req.onerror = () => reject(req.error);
	});
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		// Firefox in private mode resolves neither; do not hang the page on it.
		req.onblocked = () => reject(new Error('IndexedDB blocked'));
	});
}

let shared: RepoStore | null = null;

/**
 * The persistent store, falling back to memory wherever IndexedDB cannot be
 * used. Failures are silent by design: the cache is an optimisation, and a
 * visitor with storage disabled should still see their repository.
 *
 * One per page. The loader and the homepage each ask for it, and a store
 * apiece would give each its own fallback: with IndexedDB unavailable, what a
 * load wrote went into a memory nobody read again, and the homepage listed
 * nothing.
 */
export function openStore(): RepoStore {
	return (shared ??= persistentStore());
}

function persistentStore(): RepoStore {
	const fallback = memoryStore();
	let db: Promise<IDBDatabase> | null = null;

	const database = async (): Promise<IDBDatabase | null> => {
		if (typeof indexedDB === 'undefined') return null;
		db ??= openDatabase();
		try {
			return await db;
		} catch {
			db = null;
			return null;
		}
	};

	/**
	 * Runs one transaction, or gives up quietly.
	 *
	 * `run` returns a promise rather than a request, so one request and a cursor
	 * walk are the same kind of thing here, the walk being the reason: it has to
	 * stay inside a single transaction, which is a property of where it runs.
	 */
	const transact = async <T>(
		mode: IDBTransactionMode,
		run: (store: IDBObjectStore) => Promise<T>
	): Promise<T | undefined> => {
		const handle = await database();
		if (!handle) return undefined;
		try {
			return await run(handle.transaction(STORE, mode).objectStore(STORE));
		} catch {
			return undefined;
		}
	};

	return {
		async read<T>(key: string) {
			const handle = await database();
			if (!handle) return fallback.read<T>(key);
			const stored = await transact('readonly', (store) => request<unknown>(store.get(key)));
			return isStored<T>(stored) ? stored : null;
		},

		async write<T>(key: string, value: T, now = Date.now()) {
			const handle = await database();
			if (!handle) return fallback.write(key, value, now);
			await transact('readwrite', (store) => request(store.put({ value, storedAt: now }, key)));
		},

		async list<T>() {
			const handle = await database();
			if (!handle) return fallback.list<T>();

			const rows = await transact('readonly', (store) => collect<unknown>(store));
			if (!rows) return [];

			// One pass rather than a filter and a map: the guard is what narrows a row
			// to the shape the mapping goes on to read.
			return rows
				.flatMap(({ key, value }) =>
					isStored<T>(value)
						? [{ key: String(key), value: value.value, storedAt: value.storedAt }]
						: []
				)
				.sort(newestFirst);
		},

		async keys() {
			const handle = await database();
			if (!handle) return fallback.keys();
			const keys = await transact('readonly', (store) => request(store.getAllKeys()));
			return (keys ?? []).map(String);
		},

		async clear(key?: string) {
			const handle = await database();
			if (!handle) return fallback.clear(key);
			await transact('readwrite', (store) =>
				request(key === undefined ? store.clear() : store.delete(key))
			);
		}
	};
}
