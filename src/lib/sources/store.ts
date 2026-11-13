/**
 * Where a loaded repository is kept between visits.
 *
 * IndexedDB rather than localStorage: a repository of a few thousand tasks
 * reaches several megabytes and alone would fill localStorage's ~5 MB;
 * localStorage is synchronous, so parsing such an entry blocks rendering; and
 * IndexedDB stores structured clones, so `Date` and `Map` come back intact.
 *
 * It also keeps the token a reader gave for a private repository, beside that
 * repository's readings, so that removing the repository forgets both at once.
 *
 * Storage is unavailable in private windows, embedded contexts, the prerender
 * pass and tests, so every path falls back to memory rather than failing.
 */

const DB_NAME = 'tatr';
const DB_VERSION = 2;
const STORE = 'repositories';
/** The tokens, by the key of their repository whatever its branch. */
const TOKENS = 'tokens';

/** A token a reader gave to read a private repository, and the account it belongs to. */
export interface Token {
	value: string;
	login: string;
}

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
	 * Every entry, newest first, for the homepage's list of repositories already
	 * read. It loads the values, where a card's counts live: about 45 kB per
	 * repository, far cheaper than the request a card would otherwise make.
	 */
	list<T>(): Promise<{ key: string; value: T; storedAt: number }[]>;
	/**
	 * Every key, without the values: the header's branch menu only needs to know
	 * which branches are cached.
	 */
	keys(): Promise<string[]>;
	/** The token kept for `repository`, a `repositoryKey`, or null for none. */
	token(repository: string): Promise<Token | null>;
	/** The repositories a token is kept for, without the tokens. */
	tokenKeys(): Promise<string[]>;
	keepToken(repository: string, token: Token): Promise<void>;
	/**
	 * Forgets the reading under `key`, and the token of `repository` once no
	 * reading of it is left, in one transaction, so that a token never outlives
	 * the last card that shows it.
	 */
	forget(key: string, repository: string): Promise<void>;
}

const newestFirst = (a: { storedAt: number }, b: { storedAt: number }) => b.storedAt - a.storedAt;

/** A store that lives for the lifetime of the page. Always available. */
export function memoryStore(): RepoStore {
	const map = new Map<string, StoredRepo<unknown>>();
	const tokens = new Map<string, Token>();
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
		},
		async token(repository: string) {
			return tokens.get(repository) ?? null;
		},
		async tokenKeys() {
			return [...tokens.keys()];
		},
		async keepToken(repository: string, token: Token) {
			tokens.set(repository, token);
		},
		async forget(key: string, repository: string) {
			map.delete(key);
			if (!holdsReadingOf(map.keys(), repository)) tokens.delete(repository);
		}
	};
}

/** Whether a key among `keys` is a reading of `repository`, whose keys all start with it. */
function holdsReadingOf(keys: Iterable<IDBValidKey>, repository: string): boolean {
	for (const key of keys) {
		if (String(key).startsWith(repository)) return true;
	}
	return false;
}

/**
 * Whether a stored row is a `StoredRepo`. A row stored as a bare value has no
 * `storedAt`, so it is skipped rather than shown as read at the epoch.
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
 * A cursor gives each key with its value, where `getAllKeys()` and `getAll()`
 * return two arrays that pair up only if nothing is written between the two
 * reads. `continue()` is called from the success handler with nothing awaited,
 * because the transaction commits as soon as it has no pending request.
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

/**
 * Opens the database, or gives null when another tab blocks its upgrade by
 * holding an older version open. It closes again when a newer version of the
 * site asks to upgrade it, which a connection left open would block, and
 * `onclosed` hears it.
 */
function openDatabase(onclosed: () => void): Promise<IDBDatabase | null> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			for (const name of [STORE, TOKENS]) {
				if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
			}
		};
		req.onsuccess = () => {
			const handle = req.result;
			handle.onversionchange = () => {
				handle.close();
				onclosed();
			};
			resolve(handle);
		};
		req.onerror = () => reject(req.error);
		// Firefox in private mode fires neither success nor error, and the page must
		// not hang. A blocked upgrade stays pending, and every later open would
		// queue behind it without an answer, so its null is kept for the page.
		req.onblocked = () => resolve(null);
	});
}

let shared: RepoStore | null = null;

/**
 * The persistent store, falling back to memory wherever IndexedDB cannot be
 * used. Failures are silent: the cache is an optimisation, and a visitor
 * without storage should still see their repository.
 *
 * One per page, so that the loader and the homepage share one memory fallback
 * when IndexedDB is unavailable.
 */
export function openStore(): RepoStore {
	return (shared ??= persistentStore());
}

function persistentStore(): RepoStore {
	const fallback = memoryStore();
	let db: Promise<IDBDatabase | null> | null = null;

	const database = async (): Promise<IDBDatabase | null> => {
		if (typeof indexedDB === 'undefined') return null;
		// Once a newer version took the database over, this page's own version can
		// no longer open it, so it keeps to memory.
		db ??= openDatabase(() => {
			db = Promise.resolve(null);
		});
		try {
			return await db;
		} catch {
			db = null;
			return null;
		}
	};

	/**
	 * Runs one transaction, or gives up quietly. `run` returns a promise rather
	 * than a request, so that a cursor walk, which must stay inside one
	 * transaction, runs here like a single request.
	 */
	const transact = async <T>(
		mode: IDBTransactionMode,
		run: (store: IDBObjectStore) => Promise<T>,
		name = STORE
	): Promise<T | undefined> => {
		const handle = await database();
		if (!handle) return undefined;
		try {
			return await run(handle.transaction(name, mode).objectStore(name));
		} catch {
			return undefined;
		}
	};

	return {
		async read<T>(key: string) {
			const handle = await database();
			if (!handle) return fallback.read<T>(key);
			const stored = await transact('readonly', (store) => request<unknown>(store.get(key)));
			if (isStored<T>(stored)) return stored;
			return null;
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

			// `flatMap` rather than a filter and a map, so the guard's narrowing reaches the mapping.
			return rows
				.flatMap(({ key, value }) => {
					if (!isStored<T>(value)) return [];
					return [{ key: String(key), value: value.value, storedAt: value.storedAt }];
				})
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
			await transact('readwrite', (store) => {
				if (key === undefined) return request(store.clear());
				return request(store.delete(key));
			});
		},

		async token(repository: string) {
			const handle = await database();
			if (!handle) return fallback.token(repository);
			const token = await transact(
				'readonly',
				(store) => request<Token | undefined>(store.get(repository)),
				TOKENS
			);
			return token ?? null;
		},

		async tokenKeys() {
			const handle = await database();
			if (!handle) return fallback.tokenKeys();
			const keys = await transact('readonly', (store) => request(store.getAllKeys()), TOKENS);
			return (keys ?? []).map(String);
		},

		async keepToken(repository: string, token: Token) {
			const handle = await database();
			if (!handle) return fallback.keepToken(repository, token);
			await transact('readwrite', (store) => request(store.put(token, repository)), TOKENS);
		},

		async forget(key: string, repository: string) {
			const handle = await database();
			if (!handle) return fallback.forget(key, repository);
			try {
				await forgetIn(handle.transaction([STORE, TOKENS], 'readwrite'), key, repository);
			} catch {
				// As every write here: the cache is an optimisation, and failing is quiet.
			}
		}
	};
}

/**
 * Deletes the reading under `key`, then the token of `repository` when the
 * readings left hold none of it, within `transaction`, and resolves once it
 * commits. The next request is made from the previous one's success handler, as
 * the transaction commits as soon as it has none pending.
 */
function forgetIn(transaction: IDBTransaction, key: string, repository: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const readings = transaction.objectStore(STORE);
		readings.delete(key).onsuccess = () => {
			const left = readings.getAllKeys();
			left.onsuccess = () => {
				if (!holdsReadingOf(left.result, repository))
					transaction.objectStore(TOKENS).delete(repository);
			};
		};
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
