/**
 * The folder the dev server serves, as a source. This folder's entry, as
 * `kind.ts` is in every source folder: the file that builds the
 * {@link SourceKind} the registry holds.
 *
 * The page half. The other is `folder.server.ts`, which reads the folder from
 * the disk; they meet only through `protocol.ts`. Registered only when the dev
 * server serves a folder (see `open.ts`), so a build carries none of this.
 *
 * What sets it apart from the local folder is where the folder lives: in the
 * server, not in a grant the browser takes back on a reload. So it survives
 * one, follows the folder in every browser, needs no picker, and writes a task
 * file back with no permission to ask for.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import type { Followable, Rereadable, Writable } from '../capabilities.ts';
import { encodePath, readJson, readText } from '../http.ts';
import { SourceError, type Listing, type Source, type SourceKind } from '../source.ts';
import { CHANGED, ROUTES, tagOf } from './protocol.ts';

/** The kind's id, and the word that is its address. */
export const SERVED_WORD = 'served';

/** A route of the dev server, which is always at the root. */
const route = (path: string) => `/${ROUTES}/${path}`;

/** Where the dev server answers one file of the folder. */
const fileRoute = (path: string) => route(`files/${encodePath(path)}`);

/**
 * The folder the dev server serves, read over its routes.
 *
 * Not `Cached`: reading it is free, and a stored copy of files someone is
 * editing would be wrong before it was written.
 */
export class ServedSource implements Source, Rereadable, Writable {
	readonly id = SERVED_WORD;
	// The dev server is this machine.
	readonly concurrency = Number.POSITIVE_INFINITY;
	readonly label: string;
	readonly #network: typeof fetch;

	/** `network` is what a spec substitutes for the dev server. */
	constructor(label: string, network: typeof fetch = fetch) {
		this.label = label;
		this.#network = network;
	}

	async list(signal?: AbortSignal): Promise<Listing> {
		const response = await this.#ask(route('listing'), { signal });
		if (!response.ok) throw refused(response);
		return (await readJson(response, 'The dev server')) as Listing;
	}

	read(path: string, signal?: AbortSignal): Promise<string | null> {
		return readText(this.#network, fileRoute(path), signal);
	}

	assetUrl(path: string): string {
		return fileRoute(path);
	}

	/** Every listing is a fresh one, so there is nothing to make ready. */
	async reread(): Promise<void> {}

	/** Through the dev server, which compares `expected` with the disk before it writes. */
	async write(path: string, text: string, expected: string): Promise<'written' | 'changed'> {
		const response = await this.#ask(fileRoute(path), {
			method: 'PUT',
			headers: { 'if-match': await tagOf(expected) },
			body: text
		});
		// Gone since it was read is changed too: reading again finds it so.
		if (response.status === 412 || response.status === 404) return 'changed';
		if (!response.ok) throw refused(response);
		return 'written';
	}

	/** The dev server's answer, whatever it is, or the failure of its silence. */
	async #ask(url: string, init: RequestInit): Promise<Response> {
		// Called unbound: the browser's own `fetch` refuses any `this` but the window.
		const network = this.#network;
		try {
			return await network(url, init);
		} catch {
			throw new SourceError('network', 'The dev server did not answer.');
		}
	}
}

/** What an answer other than the one asked for says. */
function refused(response: Response): SourceError {
	return new SourceError('network', `The dev server answered ${response.status}.`);
}

/** The same folder, followed as it changes: the dev server pushes word of it. */
export class FollowedServedSource extends ServedSource implements Followable {
	readonly #channel: ViteHotContext;

	constructor(label: string, channel: ViteHotContext, network: typeof fetch = fetch) {
		super(label, network);
		this.#channel = channel;
	}

	follow(onChange: () => void): () => void {
		this.#channel.on(CHANGED, onChange);
		return () => this.#channel.off(CHANGED, onChange);
	}
}

/**
 * The kind, for the folder of that name: the dev server knows it when it
 * starts, and the page has nowhere else to learn it before the first reading.
 */
export function servedKind(name: string): SourceKind {
	return {
		id: SERVED_WORD,

		// A word, as for a folder opened in the browser: no URL anyone else follows
		// reaches it, though it survives a reload.
		address: { word: SERVED_WORD },

		describe: () => 'the folder the dev server serves',

		branches: false,

		cost: {
			listing: 'from the dev server',
			files: 'The dev server reads the folder from the disk, and says when it changes.'
		},

		open(): Source {
			// The dev channel is there whenever the dev server is, which is the only
			// place this kind is registered; the specs open it without one.
			const channel = import.meta.hot;
			if (!channel) return new ServedSource(name);
			return new FollowedServedSource(name, channel);
		}
	};
}
