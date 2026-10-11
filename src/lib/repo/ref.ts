/**
 * References to what the site reads: a repository on a forge, or a source at
 * one of this site's own paths. A reference round-trips through the site's
 * URLs, so every repository has one shareable address, and it names the source
 * that reads it, chosen once when the URL is read.
 */
import type { SourceId } from '../sources/open.ts';

/**
 * A repository's address on a forge: `/{owner}/{name}`, optionally prefixed
 * with a host and suffixed with `@{branch}`.
 */
export type ForgeAddress = {
	/** Forge host, e.g. `github.com`. */
	host: string;
	owner: string;
	name: string;
	/** `undefined` means the forge's default branch. */
	branch?: string;
};

/** A repository on a forge, with the source that reads it, or null on a host no source reads. */
export interface ForgeRef extends ForgeAddress {
	readonly source: SourceId | null;
}

/**
 * A source at one of this site's own paths, such as `/local`. Its URL reaches
 * nothing for anyone else, because a folder on this machine is a session, not
 * an address.
 */
export interface PathRef {
	readonly source: SourceId;
	readonly path: string;
	/** Never set: declared so that a reference with a branch is known to be a forge's. */
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
 * Whether a leading path segment is a forge host rather than an owner, by
 * looking like a domain. Account names cannot contain dots, though repository
 * names can (`sveltejs/svelte.dev`), so this is unambiguous.
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
	const address: ForgeAddress = { host, owner, name: cleaned };
	if (branch) address.branch = branch;
	return address;
}

/**
 * Parses a forge address from the `[...repo]` part of the site's URLs:
 * `owner/name` or `host/owner/name`, optionally suffixed with `@branch`, which
 * may contain slashes. A single segment is never a forge address, which leaves
 * it free for a source's path.
 */
export function parseForgePath(path: string): ForgeAddress | null {
	const trimmed = path.replace(/^\/+|\/+$/g, '');
	if (!trimmed) return null;

	const { repository, branch } = splitAtBranch(trimmed);
	const segments = repository.split('/').filter(Boolean);

	let host = DEFAULT_HOST;
	if (segments.length > 2 && isHost(segments[0])) host = segments.shift()!;
	if (segments.length !== 2) return null;

	return build(host, segments[0], segments[1], branch);
}

/** Splits a path at its first `@`, into the repository before it and the branch after it. */
function splitAtBranch(path: string): { repository: string; branch: string | undefined } {
	const at = path.indexOf('@');
	if (at === -1) return { repository: path, branch: undefined };
	return { repository: path.slice(0, at), branch: path.slice(at + 1) };
}

/**
 * Parses what a user pastes into the repository picker: a browser URL, an SSH
 * remote, or `owner/name`. A GitHub tree URL such as
 * `/owner/name/tree/dev/tasks` gives branch `dev`.
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

	const [owner, name, keyword, branch] = segments;
	// Only GitHub's `/tree/<branch>/<path>` is recognised. Branch and path cannot
	// be told apart without asking the forge, so a branch containing a slash
	// keeps only its first segment; `@branch` has no such ambiguity.
	if (keyword === 'tree') return build(host, owner, name, branch);
	return build(host, owner, name);
}

/**
 * Whether a name could be a branch under `git check-ref-format`, which saves a
 * request for a name git would refuse.
 *
 * `#` and `%` are refused too, though git allows them, because the site's URLs
 * carry the branch unencoded and read them as the end of the path and as an
 * escape.
 */
export function isBranchName(name: string): boolean {
	if (name === '' || name === '@') return false;
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x20\x7f~^:?*[\\#%]/.test(name)) return false;
	return !/\.\.|\/\/|@\{|^\/|\/$|\.$|\.lock$|(^|\/)\./.test(name);
}

/** A repository's name on its forge, `owner/name`, without host or branch. */
export function formatRepoName(address: ForgeAddress): string {
	return `${address.owner}/${address.name}`;
}

/** Renders a reference or a forge address as a path of the site's URLs. */
export function formatRepoPath(ref: ForgeAddress | PathRef): string {
	if (!isForgeRef(ref)) return ref.path;
	return `${hostPrefix(ref.host)}${formatRepoName(ref)}${branchSuffix(ref.branch)}`;
}

/** The host as the start of a path, left out for the default host. */
function hostPrefix(host: string): string {
	if (host === DEFAULT_HOST) return '';
	return `${host}/`;
}

/** The branch as the end of a path, left out for the forge's default branch. */
function branchSuffix(branch: string | undefined): string {
	if (!branch) return '';
	return `@${branch}`;
}

/** Stable identity for caching, independent of the default-branch lookup. */
export function repoKey(address: ForgeAddress): string {
	return `${address.host}/${address.owner}/${address.name}@${address.branch ?? ''}`;
}
