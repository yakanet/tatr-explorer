import { describe, expect, it } from 'vitest';
import { parseRepoPath } from '../repo/ref.ts';
import { renderInline, renderMarkdown, resolveAttachment, splitJournal } from './markdown.ts';

const options = {
	ref: parseRepoPath('tsoding/tatr')!,
	branch: 'main',
	taskId: '20260826-200847'
};

const render = (source: string) => renderMarkdown(source, options);

describe('rendering', () => {
	it('renders ordinary prose', () => {
		expect(render('Hello **world**')).toContain('<strong>world</strong>');
	});

	it('renders lists and code blocks', () => {
		expect(render('- one\n- two')).toContain('<li>one</li>');
		expect(render('```\ncc -o nob nob.c\n```')).toContain('<code>');
	});

	it('renders inline code, which task titles rely on', () => {
		expect(render('the `tatr ls` command')).toContain('<code>tatr ls</code>');
	});
});

describe('hostile input', () => {
	// The source is a file from an arbitrary repository. Each of these is a real
	// way to get script execution through a markdown renderer. None can work here
	// because HTML never enters: the parser escapes it into text.
	//
	// So the assertion is not "the word script is absent" - it does appear, inertly,
	// as `&lt;script&gt;`. It is that no *active* markup survives.
	const ACTIVE_TAG = /<(script|iframe|svg|body|style|form|object|embed|link|meta)\b/i;
	const DANGEROUS_URL = /(?:href|src)\s*=\s*"(?:javascript|data|vbscript):/i;

	/** The tags actually rendered, as opposed to escaped text that merely looks like one. */
	const renderedTags = (html: string) => html.match(/<[a-z][^>]*>/gi) ?? [];
	const hasEventAttribute = (html: string) =>
		renderedTags(html).some((tag) => /\son[a-z]+\s*=/i.test(tag));

	it.each([
		'<script>alert(1)</script>',
		'<img src=x onerror="alert(1)">',
		'<a href="javascript:alert(1)">click</a>',
		'<iframe src="https://evil.example"></iframe>',
		'<svg onload="alert(1)"></svg>',
		'<body onload="alert(1)">',
		'<form action="https://evil.example"><input name="x"></form>',
		'<style>body{display:none}</style>',
		'<a href="data:text/html,<script>alert(1)</script>">x</a>',
		'<a href="vbscript:msgbox(1)">x</a>',
		'<div onmouseover="alert(1)">hover</div>'
	])('neutralises %o', (source) => {
		const html = render(source);
		expect(html).not.toMatch(ACTIVE_TAG);
		expect(hasEventAttribute(html)).toBe(false);
		expect(html).not.toMatch(DANGEROUS_URL);
	});

	it.each([
		'[click](javascript:alert(1))',
		'[click](data:text/html,<script>alert(1)</script>)',
		'![img](javascript:alert(1))'
	])('refuses %o, so a markdown link cannot carry a scheme', (source) => {
		expect(render(source)).not.toMatch(DANGEROUS_URL);
	});

	it('escapes markup into text rather than dropping it, so nothing vanishes', () => {
		const html = render('<div>kept text</div>');
		expect(html).toContain('kept text');
		expect(html).toContain('&lt;div&gt;');
	});

	it('marks external links so they cannot reach back into the page', () => {
		const html = render('[svelte](https://svelte.dev)');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain('target="_blank"');
	});
});

describe('attachments', () => {
	it('resolves a relative image against the task folder', () => {
		expect(render('![shot](./screenshot.png)')).toContain(
			'https://raw.githubusercontent.com/tsoding/tatr/main/tasks/20260826-200847/screenshot.png'
		);
	});

	it('resolves a bare filename too', () => {
		expect(resolveAttachment(options, 'shot.png')).toBe(
			'https://raw.githubusercontent.com/tsoding/tatr/main/tasks/20260826-200847/shot.png'
		);
	});

	it('resolves a sibling task, which cross-references use', () => {
		expect(resolveAttachment(options, '../20260315-160715/TASK.md')).toBe(
			'https://raw.githubusercontent.com/tsoding/tatr/main/tasks/20260315-160715/TASK.md'
		);
	});

	it.each(['../../etc/passwd', '../../../../secret', '../..'])(
		'refuses %o, which climbs out of tasks/',
		(url) => {
			expect(resolveAttachment(options, url)).toBeNull();
		}
	);

	it('drops an image whose source is neither relative nor the repository CDN', () => {
		// Otherwise a task could beacon every reader to an arbitrary host.
		expect(render('![x](https://evil.example/pixel.png)')).not.toContain('evil.example');
	});

	it('keeps an image already pointing at raw', () => {
		const url = 'https://raw.githubusercontent.com/tsoding/tatr/main/tasks/x/a.png';
		expect(render(`![x](${url})`)).toContain(url);
	});
});

describe('task ids in a body', () => {
	// The ids the repository being read actually has. The page hands in a builder
	// that answers for those and `null` for anything else, which is where the
	// difference between our tasks and the upstream ones they cite lands.
	const KNOWN = new Set(['20260907-011003', '20260826-200847', '20260907-011003-b']);
	const linking = {
		...options,
		taskUrl: (id: string) => (id !== options.taskId && KNOWN.has(id) ? `/base/t/${id}` : null)
	};
	const link = (source: string) => renderMarkdown(source, linking);

	it('links an id the repository has, leaving the sentence around it', () => {
		expect(link('depends on 20260907-011003 first')).toBe(
			'<p>depends on <a href="/base/t/20260907-011003">20260907-011003</a> first</p>\n'
		);
	});

	it('links every id in the line', () => {
		const html = link('20260907-011003 and 20260907-011003-b');
		expect(html.match(/<a /g)).toHaveLength(2);
		expect(html).toContain('>20260907-011003-b</a>');
	});

	it('leaves an id this repository does not have as text', () => {
		// A real one: our tasks cite upstream's, which resolve nowhere here.
		const html = link('upstream calls it 20260304-115038');
		expect(html).not.toContain('<a ');
		expect(html).toContain('20260304-115038');
	});

	it('keeps an unresolved id beside a resolved one, rather than dropping it', () => {
		const html = link('ours is 20260907-011003, upstream 20260304-115038');
		expect(html.match(/<a /g)).toHaveLength(1);
		expect(html).toContain('20260304-115038');
	});

	it('never links the task to the page it is written on', () => {
		const html = link(`this task is ${options.taskId}`);
		expect(html).not.toContain('<a ');
	});

	it('leaves an id in a code span literal', () => {
		const html = link('run `tatr show 20260907-011003`');
		expect(html).not.toContain('<a ');
		expect(html).toContain('<code>tatr show 20260907-011003</code>');
	});

	it('does not nest an anchor inside a link that already holds an id', () => {
		const html = link('[see 20260907-011003](https://example.com/x)');
		expect(html.match(/<a /g)).toHaveLength(1);
		expect(html).toContain('href="https://example.com/x"');
	});

	it('links nothing in a title, which is rendered into a row that is a link', () => {
		expect(renderInline('depends on 20260907-011003', linking)).not.toContain('<a ');
	});

	it('links nothing when no builder is handed in', () => {
		expect(render('depends on 20260907-011003')).not.toContain('<a ');
	});
});

describe('splitJournal', () => {
	it('splits a body on its --- separators', () => {
		expect(splitJournal('first\n\n---\n\nsecond\n\n---\n\nthird')).toEqual([
			'first',
			'second',
			'third'
		]);
	});

	it('returns one entry when there is no separator', () => {
		expect(splitJournal('just prose')).toEqual(['just prose']);
	});

	it('is empty for an empty body', () => {
		expect(splitJournal('')).toEqual([]);
	});

	it('does not split on a horizontal rule inside a code block boundary', () => {
		// A leading-dash list item is not a separator.
		expect(splitJournal('- one\n- two')).toEqual(['- one\n- two']);
	});
});
