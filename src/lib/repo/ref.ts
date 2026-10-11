/**
 * A reference to what the site reads: a repository on a forge, or a source
 * that lives at one of this site's own paths.
 *
 * References round-trip through the site's own URLs, so that every repository
 * gets a unique, shareable address. A reference names the source that reads
 * it, by its key in the registry, which decides it once, as the URL is read.
 */
import type { SourceId } from '../sources/open.ts';

/**
 * Where a repository is on a forge: `/{owner}/{name}`, optionally prefixed with
 * a forge host and suffixed with `@{branch}`, on any host.
 */
export type ForgeAddress = {
	/** Forge host, e.g. `github.com`. */
	host: string;
	owner: string;
	name: string;
	/** `undefined` means "whatever the forge reports as the default branch". */
	branch?: string;
};

/** A repository on a forge, and the source that reads it: none on a host nothing reads. */
export interface ForgeRef extends ForgeAddress {
	readonly source: SourceId | null;
}

/**
 * A source that lives at one of this site's own paths, `/local`, and nowhere
 * else: no URL anyone else follows reaches it (a folder on this machine is a
 * session, not an address).
 */
export interface PathRef {
	readonly source: SourceId;
	readonly path: string;
	/** Never one: declared so that a reference with a branch is known to be a forge's. */
	readonly branch?: undefined;
}

export type RepoRef = ForgeRef | PathRef;

export const DEFAULT_HOST = 'github.com';

/** Whether a reference, or an address, is a forge's rather than a path of this site. */
export function isForgeRef<T extends ForgeAddress>(ref: T | PathRef): ref is T {
	return 'host' in ref;
}

/** GitHub allows these characters in owner and repository names. */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * A leading path segment is a forge host rather than an owner when it looks like
 * a domain. This is unambiguous because forge account names cannot contain dots,
 * even though repository names can (e.g. `sveltejs/svelte.dev`).
 */
function isHost(segment: string): boolean {
	return segment.includes('.') && !segment.startsWith('.') && !segment.endsWith('.');
}

function cleanName(name: string): string {
	return name.replace(/\.git$/, '');
}

function build(host: string, owner: string, name: string, branch?: string): ForgeAddress | null {
	const cleaned = cleanName(name);
	if (!SEGMENT.test(owner) || !SEGMENT.test(cleaned)) return null;
	return branch ? { host, owner, name: cleaned, branch } : { host, owner, name: cleaned };
}

/**
 * Parses a forge address out of the `[...repo]` portion of one of our own URLs.
 *
 * Accepts `owner/name`, `host/owner/name`, and either form suffixed with
 * `@branch`. Branch names may contain slashes. One segment is never a forge
 * address, which needs an owner too: that is what leaves a path of this site
 * free to be a source's.
 */
export function parseForgePath(path: string): ForgeAddress | null {
	const trimmed = path.replace(/^\/+|\/+$/g, '');
	if (!trimmed) return null;

	const at = trimmed.indexOf('@');
	const branch = at === -1 ? undefined : trimmed.slice(at + 1) || undefined;
	const segments = (at === -1 ? trimmed : trimmed.slice(0, at)).split('/').filter(Boolean);

	const host = segments.length > 2 && isHost(segments[0]) ? segments.shift()! : DEFAULT_HOST;
	if (segments.length !== 2) return null;

	return build(host, segments[0], segments[1], branch);
}

/**
 * Parses whatever a user pastes into the repository picker: a browser URL, an
 * SSH remote, or the bare `owner/name` shorthand.
 *
 * A GitHub tree URL carries its branch, so `/owner/name/tree/dev/tasks` resolves
 * to branch `dev`.
 */
export function parseRepoInput(input: string): ForgeAddress | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		let url: URL;
		try {
			url = new URL(trimmed);
		} catch {
			return null;
		}
		return fromHostAndPath(url.hostname, url.pathname);
	}

	// `git@host:owner/name.git`, excluding anything that looks like a URL scheme.
	const ssh = /^(?:[\w.-]+@)?([\w.-]+\.[\w.-]+):(?!\/)(.+)$/.exec(trimmed);
	if (ssh) return fromHostAndPath(ssh[1], ssh[2]);

	return parseForgePath(trimmed);
}

function fromHostAndPath(host: string, path: string): ForgeAddress | null {
	const segments = path
		.replace(/^\/+|\/+$/g, '')
		.split('/')
		.filter(Boolean);
	if (segments.length < 2) return null;

	const [owner, name, keyword, ...rest] = segments;
	// GitHub spells a branch view `/tree/<branch>/<path>`; GitLab (`/-/tree/`) and
	// Gitea (`/src/branch/`) spell it otherwise, which a second forge will have to
	// teach this. Branch and path are not separable there without asking the
	// forge, so we take the first segment: a pasted URL for a slash-containing
	// branch loses its tail. Our own `@branch` syntax has no such ambiguity.
	const branch = keyword === 'tree' && rest.length > 0 ? rest[0] : undefined;

	return build(host, owner, name, branch);
}

/**
 * Whether a name could be a branch, by the rules `git check-ref-format` applies:
 * a name git would refuse cannot exist, and refusing it here saves the request
 * that would only say so.
 *
 * Two characters are refused on our own account, for now. `#` and `%` are legal
 * in git, but our URLs carry the branch unencoded, reading the first as the end
 * of the path and the second as an escape. Encoding the branch where a URL is
 * built would lift this, and fix the same gap in the homepage's field, which
 * accepts `owner/name@branch` unchecked.
 */
export function isBranchName(name: string): boolean {
	if (name === '' || name === '@') return false;
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x20\x7f~^:?*[\\#%]/.test(name)) return false;
	return !/\.\.|\/\/|@\{|^\/|\/$|\.$|\.lock$|(^|\/)\./.test(name);
}

/** `owner/name`: how a repository is named on its forge, host and branch aside. */
export function formatRepoName(address: ForgeAddress): string {
	return `${address.owner}/${address.name}`;
}

/** Renders a reference, or a forge address, back into the path of our own URLs. */
export function formatRepoPath(ref: ForgeAddress | PathRef): string {
	if (!isForgeRef(ref)) return ref.path;
	const prefix = ref.host === DEFAULT_HOST ? '' : `${ref.host}/`;
	const suffix = ref.branch ? `@${ref.branch}` : '';
	return `${prefix}${formatRepoName(ref)}${suffix}`;
}

/** Stable identity for caching, independent of the default-branch lookup. */
export function repoKey(address: ForgeAddress): string {
	return `${address.host}/${address.owner}/${address.name}@${address.branch ?? ''}`;
}
