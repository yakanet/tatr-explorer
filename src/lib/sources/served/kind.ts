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
 * one, follows the folder in every browser, and needs no picker.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { isServed } from '../../repo/ref.ts';
import type { Followable, Rereadable } from '../capabilities.ts';
import { encodePath, readText } from '../http.ts';
import { SourceError, type Listing, type Source, type SourceKind } from '../source.ts';
import { CHANGED, ROUTES } from './protocol.ts';

/** The kind's id. */
const NAME = 'served';

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
export class ServedSource implements Source, Rereadable {
	readonly id = NAME;
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
		// Called unbound: the browser's own `fetch` refuses any `this` but the window.
		const network = this.#network;
		let response: Response;
		try {
			response = await network(route('listing'), { signal });
		} catch {
			throw new SourceError('network', 'The dev server did not answer.');
		}
		if (!response.ok) {
			throw new SourceError('network', `The dev server answered ${response.status}.`);
		}
		return (await response.json()) as Listing;
	}

	read(path: string, signal?: AbortSignal): Promise<string | null> {
		return readText(this.#network, fileRoute(path), signal);
	}

	assetUrl(path: string): string {
		return fileRoute(path);
	}

	/** Every listing is a fresh one, so there is nothing to make ready. */
	async reread(): Promise<void> {}
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
		id: NAME,

		claims: (ref) => isServed(ref),

		open(): Source {
			// The dev channel is there whenever the dev server is, which is the only
			// place this kind is registered; the specs open it without one.
			const channel = import.meta.hot;
			if (!channel) return new ServedSource(name);
			return new FollowedServedSource(name, channel);
		}
	};
}
