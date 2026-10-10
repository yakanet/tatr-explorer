/**
 * Renders a task's markdown for display.
 *
 * The source is a `TASK.md` from an arbitrary third-party repository, so it is
 * hostile input. Rather than rendering raw HTML and scrubbing it afterwards,
 * this never lets HTML in at all: markdown-it runs with `html: false`, so any
 * markup in the source is escaped into text, and its link validator refuses
 * `javascript:` and `data:` URLs outright. There is nothing left to sanitise,
 * which is a stronger position than sanitising well.
 *
 * Relative links still have to be rewritten. A task refers to its attachments
 * as `./screenshot.png`, which means nothing once the markdown leaves the
 * repository, so they are resolved against the task's own folder on the CDN.
 */
import MarkdownIt, { type StateCore, type Token } from 'markdown-it';
import type { RepoRef } from '../repo/ref.ts';
import { openSource } from '../sources/open.ts';
import { scanHuidSpans } from '../tatr/huid.ts';

export interface RenderOptions {
	ref: RepoRef;
	branch: string;
	/** The task whose folder relative links resolve against. */
	taskId: string;
	/**
	 * Where a task id written in a body points, or `null` for an id that leads
	 * nowhere: one this repository does not have, or this task's own.
	 *
	 * Handed in rather than built here: the href has to carry the `BASE_PATH`
	 * the deployed site is served under, which is `$app/paths`' business, and
	 * this is a plain module under unit test. Every page that renders a body
	 * already holds the same builder for its own links.
	 */
	taskUrl?: (id: string) => string | null;
}

/** Only the repository's own CDN may load an image, so a task cannot beacon readers. */
const IMAGE_HOST = 'https://raw.githubusercontent.com/';

/** True for a link that points inside the repository rather than out of it. */
function isRelative(url: string): boolean {
	return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//') && !url.startsWith('#');
}

/**
 * Resolves a repository-relative path against a task folder, refusing anything
 * that climbs out of it.
 */
export function resolveAttachment(options: RenderOptions, url: string): string | null {
	const segments = `tasks/${options.taskId}/${url}`.split('/');
	const stack: string[] = [];

	for (const segment of segments) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			if (stack.length === 0) return null;
			stack.pop();
			continue;
		}
		stack.push(segment);
	}

	const path = stack.join('/');
	// Anything outside tasks/ is not an attachment of this repository's tasks.
	if (!path.startsWith('tasks/')) return null;
	// Only the source knows how one of its files becomes a URL: a raw endpoint
	// for a forge, a `blob:` for a file already in memory.
	return openSource(options.ref, { branch: options.branch })?.assetUrl(path) ?? null;
}

/**
 * Marks a link this module made, so the rule that rewrites the source's links
 * leaves it alone: a task page's href has no scheme either, and would otherwise
 * be resolved as an attachment and end up pointing into the raw files.
 *
 * `markup` is where markdown-it's own linkify records the same thing.
 */
const TASK_LINK = 'tatr_task_id';

/**
 * Turns a task id written in a body into a link to that task's page.
 *
 * Bodies cite each other by id constantly, and the reason for a reference is in
 * the sentence holding it, so that is where the link belongs, rather than only
 * in the References panel beside it.
 *
 * Done as markdown-it's own linkify is done: a core rule that splits `text`
 * tokens once the inline parse is over. Which is what makes an id inside a code
 * span stay literal without asking (a code span is not a text token), and what
 * makes an id inside an existing link need stepping over, or the anchor nests.
 */
function linkTaskIds(
	md: InstanceType<typeof MarkdownIt>,
	taskUrl: (id: string) => string | null
): void {
	md.core.ruler.push('tatr_task_ids', (state) => {
		// A title is rendered inline into a row that is itself a link, and an
		// anchor inside an anchor is taken apart by the browser, along with the
		// row link the keyboard follows. Titles keep their ids as text.
		if (state.inlineMode) return;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;
			token.children = withTaskLinks(state, token.children, taskUrl);
		}
	});
}

/** The children of one inline token, with the ids among them linked. */
function withTaskLinks(
	state: StateCore,
	children: Token[],
	taskUrl: (id: string) => string | null
): Token[] {
	const out: Token[] = [];
	/** Depth rather than a flag: a link's own text can hold emphasis and images. */
	let inLink = 0;

	for (const child of children) {
		if (child.type === 'link_open') inLink += 1;
		else if (child.type === 'link_close') inLink -= 1;

		if (inLink > 0 || child.type !== 'text') out.push(child);
		else out.push(...splitTaskIds(state, child, taskUrl));
	}

	return out;
}

/** One text token, cut at each id that resolves, or handed back untouched. */
function splitTaskIds(
	state: StateCore,
	token: Token,
	taskUrl: (id: string) => string | null
): Token[] {
	const out: Token[] = [];
	let cursor = 0;

	const text = (content: string) => {
		const piece = new state.Token('text', '', 0);
		piece.content = content;
		return piece;
	};

	for (const span of scanHuidSpans(token.content)) {
		const url = taskUrl(span.id);
		// Ids that lead nowhere are most of them: our own tasks cite upstream's,
		// which this repository does not have. Left as the text they were.
		if (!url) continue;

		const before = token.content.slice(cursor, span.start);
		if (before) out.push(text(before));

		const open = new state.Token('link_open', 'a', 1);
		open.attrs = [['href', url]];
		open.markup = TASK_LINK;

		out.push(open, text(span.id), new state.Token('link_close', 'a', -1));
		cursor = span.end;
	}

	if (out.length === 0) return [token];

	const after = token.content.slice(cursor);
	if (after) out.push(text(after));
	return out;
}

function createRenderer(options: RenderOptions): InstanceType<typeof MarkdownIt> {
	const md = new MarkdownIt({
		html: false, // escape any markup in the source
		linkify: false, // only explicit links become links
		breaks: false,
		typographer: false
	});

	const defaultLinkOpen =
		md.renderer.rules.link_open ??
		((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

	md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		// Already pointing at a page of this site, and no source can claim this
		// marker: `markup` is the parser's, not the document's.
		if (token.markup === TASK_LINK) return defaultLinkOpen(tokens, idx, opts, env, self);

		const href = String(token.attrGet('href') ?? '');

		if (isRelative(href)) {
			const resolved = resolveAttachment(options, href);
			if (resolved) token.attrSet('href', resolved);
			else token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'href');
		} else {
			// External destinations open away from the page and cannot reach back.
			token.attrSet('rel', 'noopener noreferrer');
			token.attrSet('target', '_blank');
		}
		return defaultLinkOpen(tokens, idx, opts, env, self);
	};

	md.renderer.rules.image = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		const src = String(token.attrGet('src') ?? '');

		if (isRelative(src)) {
			const resolved = resolveAttachment(options, src);
			if (resolved) token.attrSet('src', resolved);
			else token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'src');
		} else if (!src.startsWith(IMAGE_HOST)) {
			token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'src');
		}
		return self.renderToken(tokens, idx, opts);
	};

	if (options.taskUrl) linkTaskIds(md, options.taskUrl);

	return md;
}

/** Renders markdown to HTML, with attachment links resolved. */
export function renderMarkdown(source: string, options: RenderOptions): string {
	return createRenderer(options).render(source);
}

/**
 * Renders a single line without wrapping it in a paragraph, for titles, which
 * routinely carry inline code in this format (`` `tatr ls` relative paths are
 * broken ``). Showing the backticks raw would be showing the file, not the task.
 */
export function renderInline(source: string, options: RenderOptions): string {
	return createRenderer(options).renderInline(source);
}

/**
 * Splits a description on its `---` separators. Task bodies are written as an
 * append-only journal, so each block is one entry, oldest first.
 */
export function splitJournal(description: string): string[] {
	return description
		.split(/^\s*---\s*$/m)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}
