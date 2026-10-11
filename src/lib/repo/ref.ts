/**
 * A reference to a repository that holds a `tasks/` folder.
 *
 * References round-trip through the site's own URLs, so that every repository
 * gets a unique, shareable address. Two shapes, and this file knows no source
 * by name:
 *
 * - a forge address, `/{owner}/{name}`, optionally prefixed with a forge host
 *   and suffixed with `@{branch}`, on any host, so that one on a host nothing
 *   reads still opens a page that says so;
 * - a word, for a source no URL anyone else follows can reach (a folder on
 *   this machine is a session, not an address). The source that owns the word
 *   says so in the registry, which is where the word is recognised.
 */

export type RepoRef = {
	/** Forge host, e.g. `github.com`, or the word of a source that has one. */
	host: string;
	/** Empty for a word, which has no owner to qualify it. */
	owner: string;
	name: string;
	/** `undefined` means "whatever the forge reports as the default branch". */
	branch?: string;
};

export const DEFAULT_HOST = 'github.com';

/** The reference a word stands for: the word, and nothing else. */
export function wordRef(word: string): RepoRef {
	return { host: word, owner: '', name: '' };
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
 * Parses a forge address out of the `[...repo]` portion of one of our own URLs.
 *
 * Accepts `owner/name`, `host/owner/name`, and either form suffixed with
 * `@branch`. Branch names may contain slashes. One segment is never a forge
 * address, which needs an owner too: that is what leaves a word free to be a
 * source's.
 */
export function parseForgePath(path: string): RepoRef | null {
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

	return parseForgePath(trimmed);
}

function fromHostAndPath(host: string, path: string): RepoRef | null {
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
export function formatRepoName(ref: RepoRef): string {
	return `${ref.owner}/${ref.name}`;
}

/** Renders a reference back into the path form used by our own URLs. */
export function formatRepoPath(ref: RepoRef): string {
	// A word is the whole address: a folder's name, say, would read as one, and
	// nobody else's machine can follow it.
	if (!ref.owner) return ref.host;
	const prefix = ref.host === DEFAULT_HOST ? '' : `${ref.host}/`;
	const suffix = ref.branch ? `@${ref.branch}` : '';
	return `${prefix}${formatRepoName(ref)}${suffix}`;
}

/** Stable identity for caching, independent of the default-branch lookup. */
export function repoKey(ref: RepoRef): string {
	return `${ref.host}/${ref.owner}/${ref.name}@${ref.branch ?? ''}`;
}
