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
import { isServed } from '../../repo/ref.ts';
import { encodePath, readText } from '../http.ts';
import { ListingError, type Listing, type Source, type SourceKind } from '../source.ts';
import { CHANGED, ROUTES } from './protocol.ts';

/** The kind's id, which its failures name too, where a forge's name its lister. */
const NAME = 'served';

/** A route of the dev server, which is always at the root. */
const route = (path: string) => `/${ROUTES}/${path}`;

/**
 * The kind, for the folder of that name: the dev server knows it when it
 * starts, and the page has nowhere else to learn it before the first reading.
 */
export function servedKind(name: string): SourceKind {
	return {
		id: NAME,

		claims: (ref) => isServed(ref),

		open(_ref, options = {}): Source {
			const doFetch = options.fetchImpl ?? fetch;
			const fileUrl = (path: string) => route(`files/${encodePath(path)}`);

			const source: Source = {
				id: NAME,
				label: name,
				// Reading it is free, and a stored copy of files someone is editing
				// would be wrong before it was written.
				cacheKey: null,
				// The dev server is this machine.
				concurrency: Number.POSITIVE_INFINITY,
				// Every listing is a fresh one, so there is nothing to make ready.
				repeatable: true,

				async list(signal) {
					let response: Response;
					try {
						response = await doFetch(route('listing'), { signal });
					} catch {
						throw new ListingError('network', NAME, 'The dev server did not answer.');
					}
					if (!response.ok) {
						throw new ListingError('network', NAME, `The dev server answered ${response.status}.`);
					}
					return (await response.json()) as Listing;
				},

				read: (path, signal) => readText(doFetch, fileUrl(path), signal),

				assetUrl: fileUrl
			};

			// The dev channel, which exists in the dev server only: and so does this
			// source.
			const hot = import.meta.hot;
			if (hot) {
				source.follow = (onChange) => {
					hot.on(CHANGED, onChange);
					return () => hot.off(CHANGED, onChange);
				};
			}
			return source;
		}
	};
}
