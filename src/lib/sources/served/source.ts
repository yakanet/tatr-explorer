/**
 * The page half of the served source, which reads the folder over the dev
 * server's routes. The server half is `folder.server.ts`, and the two share only
 * `protocol.ts`. `open.ts` registers it only when the dev server serves a
 * folder, so a build carries none of it.
 *
 * Unlike the local folder, the folder lives in the server rather than in a
 * browser grant, so it survives a reload, is followed in every browser, needs
 * no picker, and can be written to.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import type { Followable, Rereadable, Writable } from '../capabilities.ts';
import { encodePath, readJson, readText } from '../http.ts';
import { SourceError, type Address, type Listing, type Source } from '../contract.ts';
import { SERVED } from './enabled.ts';
import { CHANGED, ROUTES, tagOf } from './protocol.ts';

/** The path of this site that is the served folder's address, `/served`. */
export const SERVED_PATH = 'served';

/** A route of the dev server, which is always at the root. */
const route = (path: string) => `/${ROUTES}/${path}`;

/** Where the dev server answers one file of the folder. */
const fileRoute = (path: string) => route(`files/${encodePath(path)}`);

/** The folder the dev server serves, read over its routes. */
export class ServedSource implements Source, Rereadable, Writable {
	// A fixed path, as for the local folder: no other machine can follow it.
	static readonly address: Address = { path: SERVED_PATH };

	/**
	 * Opens the source under the served folder's name, or under `served` in a
	 * spec, which runs with no folder served.
	 */
	static open(): ServedSource {
		const name = SERVED || SERVED_PATH;
		// `import.meta.hot` exists in the dev server, not in the specs.
		const channel = import.meta.hot;
		if (!channel) return new ServedSource(name);
		return new FollowedServedSource(name, channel);
	}

	// The dev server runs on this machine and needs no throttling.
	readonly concurrency = Number.POSITIVE_INFINITY;
	readonly cost = {
		listing: 'from the dev server',
		files: 'The dev server reads the folder from the disk, and says when it changes.'
	};
	readonly label: string;
	readonly #network: typeof fetch;

	/** `network` lets a spec stand in for the dev server. */
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

	/** Has nothing to prepare: every listing is read fresh. */
	async reread(): Promise<void> {}

	/** Writes through the dev server, which compares `expected` with the disk first. */
	async write(
		path: string,
		contents: string | Blob,
		expected: string | null
	): Promise<'written' | 'changed'> {
		const response = await this.#ask(fileRoute(path), {
			method: 'PUT',
			headers: await preconditionOf(expected),
			body: contents
		});
		// A file removed since it was read has changed too, as reading again shows.
		if (response.status === 412 || response.status === 404) return 'changed';
		if (!response.ok) throw refused(response);
		return 'written';
	}

	/** Needs no answer: the dev server's routes write for its own page only. */
	async allow(): Promise<boolean> {
		return true;
	}

	/** Returns the dev server's response, whatever its status, or throws if it does not answer. */
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

/**
 * The header that has the dev server compare the disk with `expected`: the
 * version tag of its text, or `If-None-Match: *`, HTTP's "only if there is
 * none", for no file.
 */
async function preconditionOf(expected: string | null): Promise<Record<string, string>> {
	if (expected === null) return { 'if-none-match': '*' };
	return { 'if-match': await tagOf(expected) };
}

/** The error for a status other than the one expected. */
function refused(response: Response): SourceError {
	return new SourceError('network', `The dev server answered ${response.status}.`);
}

/** A `ServedSource` that follows the folder through the change events the dev server pushes. */
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
