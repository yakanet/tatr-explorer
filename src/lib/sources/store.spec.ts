import { describe, expect, it } from 'vitest';
import { collect, memoryStore, openStore } from './store.ts';

describe('memoryStore', () => {
	it('round-trips a value with its timestamp', async () => {
		const store = memoryStore();
		await store.write('k', { hello: 'world' }, 1_234);
		const stored = await store.read<{ hello: string }>('k');
		expect(stored?.value).toEqual({ hello: 'world' });
		expect(stored?.storedAt).toBe(1_234);
	});

	it('misses on an unknown key', async () => {
		expect(await memoryStore().read('nope')).toBeNull();
	});

	it('never expires, so quota is only spent on request', async () => {
		const store = memoryStore();
		await store.write('k', 1, 0);
		expect((await store.read<number>('k'))?.value).toBe(1);
	});

	it('keeps Date and Map intact, which JSON would not', async () => {
		const store = memoryStore();
		const value = { when: new Date('2026-08-26T20:08:47Z'), tags: new Map([['bug', 'a bug']]) };
		await store.write('k', value);
		const stored = await store.read<typeof value>('k');
		expect(stored?.value.when).toBeInstanceOf(Date);
		expect(stored?.value.tags.get('bug')).toBe('a bug');
	});

	it('clears one key without touching the others', async () => {
		const store = memoryStore();
		await store.write('a', 1);
		await store.write('b', 2);
		await store.clear('a');
		expect(await store.read('a')).toBeNull();
		expect((await store.read<number>('b'))?.value).toBe(2);
	});

	it('lists what it holds, newest first, for the homepage', async () => {
		const store = memoryStore();
		await store.write('older', 1, 10);
		await store.write('newer', 2, 20);
		expect(await store.list<number>()).toEqual([
			{ key: 'newer', value: 2, storedAt: 20 },
			{ key: 'older', value: 1, storedAt: 10 }
		]);
	});

	it('lists its keys alone, for a caller that needs no value', async () => {
		const store = memoryStore();
		await store.write('a', 1);
		await store.write('b', 2);
		expect((await store.keys()).sort()).toEqual(['a', 'b']);
	});

	it('clears everything', async () => {
		const store = memoryStore();
		await store.write('a', 1);
		await store.write('b', 2);
		await store.clear();
		expect(await store.read('a')).toBeNull();
		expect(await store.read('b')).toBeNull();
	});
});

describe('openStore', () => {
	it('degrades to memory where IndexedDB does not exist, rather than throwing', async () => {
		// This suite runs under node, so there is no IndexedDB here — which is the
		// same situation as a private window or the prerender pass.
		expect(typeof indexedDB).toBe('undefined');
		const store = openStore();
		await store.write('k', { ok: true });
		expect((await store.read<{ ok: boolean }>('k'))?.value).toEqual({ ok: true });
		await store.clear();
		expect(await store.read('k')).toBeNull();
	});

	it('is one store per page, so what a load writes the homepage can list', async () => {
		await openStore().write('k', { ok: true });
		expect((await openStore().list()).map((row) => row.key)).toEqual(['k']);
		await openStore().clear();
	});
});

/**
 * A cursor over fixed records, standing in for the one IndexedDB opens.
 *
 * There is no IndexedDB under node, and the walk is ours rather than the
 * platform's: what is worth pinning down is that it accumulates in order,
 * stops on the null cursor, and asks for the next record from inside the
 * handler — a step deferred to a microtask would let the transaction commit
 * underneath it.
 */
function fakeStore(records: { key: IDBValidKey; value: unknown }[]): IDBObjectStore {
	const req: Partial<IDBRequest> & { result: unknown } = { result: null, error: null };
	let at = 0;

	const step = () => {
		req.result =
			at < records.length
				? {
						key: records[at].key,
						value: records[at].value,
						continue: () => {
							at += 1;
							step();
						}
					}
				: null;
		req.onsuccess?.call(req as IDBRequest, new Event('success'));
	};

	return {
		openCursor: () => {
			// The handler is attached after this returns, as it is with the real API.
			queueMicrotask(step);
			return req as IDBRequest<IDBCursorWithValue | null>;
		}
	} as unknown as IDBObjectStore;
}

describe('collect', () => {
	it('pairs every key with its own value, the two never being apart', async () => {
		const rows = await collect(
			fakeStore([
				{ key: 'a', value: { storedAt: 2 } },
				{ key: 'b', value: { storedAt: 1 } }
			])
		);
		expect(rows).toEqual([
			{ key: 'a', value: { storedAt: 2 } },
			{ key: 'b', value: { storedAt: 1 } }
		]);
	});

	it('resolves empty on an empty store rather than hanging', async () => {
		expect(await collect(fakeStore([]))).toEqual([]);
	});

	it('rejects rather than resolving half a store', async () => {
		const store = {
			openCursor: () => {
				const req = { result: null, error: new Error('gone') } as unknown as IDBRequest;
				queueMicrotask(() => req.onerror?.call(req, new Event('error')));
				return req;
			}
		} as unknown as IDBObjectStore;
		await expect(collect(store)).rejects.toThrow('gone');
	});
});
