/**
 * A reference to a repository that holds a `tasks/` folder.
 *
 * References round-trip through the site's own URLs, so that every repository
 * gets a unique, shareable address: `/{owner}/{name}`, optionally prefixed with
 * a forge host and suffixed with `@{branch}`.
 */
export type RepoRef = {
	/** Forge host, e.g. `github.com`. */
	host: string;
	owner: string;
	name: string;
	/** `undefined` means "whatever the forge reports as the default branch". */
	branch?: string;
};

export const DEFAULT_HOST = 'github.com';

/**
 * The host of a folder on the reader's own machine.
 *
 * Not a host at all, which is the point: it marks a reference that no URL can
 * resolve. A local folder is a session rather than an address — the browser
 * gives access to it on a gesture and takes it back on a reload — so our own
 * URL carries the marker and nothing else, and the folder itself is held in
 * memory for as long as the reader stays.
 */
export const LOCAL_HOST = 'local';

/** A reference to whichever folder the reader has open, named once picked. */
export function localRef(name = ''): RepoRef {
	return { host: LOCAL_HOST, owner: '', name };
}

export function isLocal(ref: RepoRef): boolean {
	return ref.host === LOCAL_HOST;
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

function build(host: string, owner: string, name: string, branch?: string): RepoRef | null {
	const cleaned = cleanName(name);
	if (!SEGMENT.test(owner) || !SEGMENT.test(cleaned)) return null;
	return branch ? { host, owner, name: cleaned, branch } : { host, owner, name: cleaned };
}

/**
 * Parses the `[...repo]` portion of one of our own URLs.
 *
 * Accepts `owner/name`, `host/owner/name`, and either form suffixed with
 * `@branch`. Branch names may contain slashes.
 */
export function parseRepoPath(path: string): RepoRef | null {
	const trimmed = path.replace(/^\/+|\/+$/g, '');
	if (!trimmed) return null;
	// One segment is never a repository on a forge, which needs an owner too, so
	// the word is free to mean the folder the reader has open.
	if (trimmed === LOCAL_HOST) return localRef();

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
export function parseRepoInput(input: string): RepoRef | null {
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

	return parseRepoPath(trimmed);
}

function fromHostAndPath(host: string, path: string): RepoRef | null {
	const segments = path
		.replace(/^\/+|\/+$/g, '')
		.split('/')
		.filter(Boolean);
	if (segments.length < 2) return null;

	const [owner, name, keyword, ...rest] = segments;
	// GitHub, GitLab and Gitea all spell a branch view `/tree/<branch>/<path>`.
	// Branch and path are not separable there without asking the forge, so we take
	// the first segment: a pasted URL for a slash-containing branch loses its tail.
	// Our own `@branch` syntax has no such ambiguity.
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

/** Renders a reference back into the path form used by our own URLs. */
export function formatRepoPath(ref: RepoRef): string {
	// The folder's name is deliberately not in the URL: it would read as an
	// address, and nobody else's machine can follow it.
	if (isLocal(ref)) return LOCAL_HOST;
	const prefix = ref.host === DEFAULT_HOST ? '' : `${ref.host}/`;
	const suffix = ref.branch ? `@${ref.branch}` : '';
	return `${prefix}${ref.owner}/${ref.name}${suffix}`;
}

/** Stable identity for caching, independent of the default-branch lookup. */
export function repoKey(ref: RepoRef): string {
	return `${ref.host}/${ref.owner}/${ref.name}@${ref.branch ?? ''}`;
}

/**
 * How a reference reads on screen: `owner/name`, or a folder's own name.
 *
 * A local folder has no owner to qualify it, so its name stands alone — and
 * before one is picked there is nothing to name at all.
 */
export function describeRef(ref: RepoRef): string {
	if (isLocal(ref)) return ref.name || 'a folder on this machine';
	return `${ref.owner}/${ref.name}`;
}
