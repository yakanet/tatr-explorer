/**
 * Renders a task's markdown for display.
 *
 * A `TASK.md` comes from an arbitrary repository, so it is hostile input.
 * markdown-it runs with `html: false`, which escapes any markup into text, and
 * its link validator refuses `javascript:` and `data:` URLs, so no HTML is left
 * to sanitise. Relative links, such as `./screenshot.png`, are resolved against
 * the task's own folder, wherever its source serves it.
 */
import MarkdownIt, { type StateCore, type Token } from 'markdown-it';
import { scanHuidSpans } from '../tatr/huid.ts';
import type { Task } from '../tatr/task.ts';

export interface RenderOptions {
	/**
	 * The URL a repository file loads from, or `null` when there is none: a raw
	 * endpoint for a forge, a `blob:` for a file in memory. Passed in because
	 * only the reading's source knows it.
	 */
	assetUrl: (path: string) => string | null;
	/** The task whose folder relative links resolve against. */
	taskId: string;
	/**
	 * The page a task id in a body links to, or `null` for an id this repository
	 * does not have, or for this task's own. Passed in because the href carries
	 * the `BASE_PATH`, which `$app/paths` resolves and this plain module cannot.
	 */
	taskUrl?: (id: string) => string | null;
}

/** The only host an absolute image may load from, so a task cannot track its readers. */
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
	const path = attachmentPath(options.taskId, url);
	if (path === null) return null;
	return options.assetUrl(path);
}

/**
 * The path from the repository root that a relative link of task `taskId`
 * names, or null for one outside `tasks/`. An empty id, a new task's, leaves
 * the link in `tasks/` itself.
 */
export function attachmentPath(taskId: string, url: string): string | null {
	const segments = `tasks/${taskId}/${url}`.split('/');
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
	return path;
}

/**
 * The `markup` of a task link this module made, as markdown-it's linkify marks
 * its own. The link rewriter skips it, because a task page's href has no
 * scheme and would otherwise be resolved as an attachment.
 */
const TASK_LINK = 'tatr_task_id';

/**
 * Links each task id written in a body to that task's page, in the sentence
 * that gives the reason for the reference.
 *
 * Like markdown-it's linkify, a core rule splits `text` tokens after the inline
 * parse. An id in a code span therefore stays literal, since a code span is not
 * a text token, and an id inside an existing link is skipped so that anchors do
 * not nest.
 */
function linkTaskIds(
	md: InstanceType<typeof MarkdownIt>,
	taskUrl: (id: string) => string | null
): void {
	md.core.ruler.push('tatr_task_ids', (state) => {
		// A title renders inline inside a row that is itself a link, and the
		// browser breaks a nested anchor apart, row link included, so ids in a
		// title stay text.
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

/** Splits a text token at each id that resolves, or returns it untouched. */
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
		// An id with no page, such as one citing another repository's task,
		// stays text.
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
		html: false,
		linkify: false,
		breaks: false,
		typographer: false
	});

	const defaultLinkOpen =
		md.renderer.rules.link_open ??
		((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

	md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		// A task link already points at this site. A document cannot forge the
		// marker, since only the parser sets `markup`.
		if (token.markup === TASK_LINK) return defaultLinkOpen(tokens, idx, opts, env, self);

		const href = String(token.attrGet('href') ?? '');

		if (isRelative(href)) {
			const resolved = resolveAttachment(options, href);
			if (resolved) token.attrSet('href', resolved);
			else token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'href');
		} else {
			// An external page opens in a new tab, without access to this one.
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

/**
 * The paths from the repository root that the relative links and images of
 * `source` name, as the renderer resolves them for task `taskId`.
 */
export function linkedPaths(source: string, taskId: string): Set<string> {
	const paths = new Set<string>();
	const assetUrl = (path: string) => {
		paths.add(path);
		return null;
	};
	renderMarkdown(source, { taskId, assetUrl });
	return paths;
}

/** Renders markdown to HTML, with attachment links resolved. */
export function renderMarkdown(source: string, options: RenderOptions): string {
	return createRenderer(options).render(source);
}

/**
 * Renders one line without a paragraph, for titles, which often carry inline
 * code (`` `tatr ls` relative paths are broken ``).
 */
export function renderInline(source: string, options: RenderOptions): string {
	return createRenderer(options).renderInline(source);
}

/** Renders a task's title, its relative paths resolved against its own folder. */
export function renderTitle(
	task: Pick<Task, 'id' | 'title'>,
	assetUrl: RenderOptions['assetUrl']
): string {
	return renderInline(task.title, { assetUrl, taskId: task.id });
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
