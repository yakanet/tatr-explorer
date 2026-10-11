/**
 * Records `tests/fixtures/` again from the reference binary.
 *
 * The differential tests compare this viewer with what the real `tatr` prints,
 * so the recordings have to come from the real `tatr`: the checkout at
 * `../tatr` (or `TATR_CHECKOUT`), built beforehand with `cc -o nob nob.c &&
 * ./nob`. That is why this is a manual step and not part of the suite or CI.
 *
 * Two repositories are recorded. tatr's own, whose 79 tasks are written by the
 * format's author and carry the accidents no one would think to invent. And
 * `corpus-raw.json`, a handful of tasks of ours that each hold an edge case the
 * first one lacks; it is laid out in a temporary folder for the run, so that no
 * `tasks/` folder sits in this repository for the CLI or a reader to mistake
 * for a backlog.
 *
 * Both are rewritten by `tatr untag` too, which pins the file this viewer writes
 * when it edits a task.
 *
 * Every recording keeps its own questions: the queries are read back from the
 * file before it is written again. To add a case, add an entry with an empty
 * answer and run this; the binary fills it in.
 */
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests', 'fixtures');
const checkout = resolve(root, process.env.TATR_CHECKOUT ?? '../tatr');
const tatr = join(checkout, 'build', 'tatr');

if (!existsSync(tatr)) {
	console.error(`No tatr binary at ${tatr}. Build it: cd ${checkout} && cc -o nob nob.c && ./nob`);
	process.exit(1);
}

const run = (cwd, args) => spawnSync(tatr, args, { cwd, encoding: 'utf8' });

const LINE =
	/^\.\/tasks\/([^/]+)\/TASK\.md:1: (\S+) \[PRIORITY: *(-?\d+)\](?: \[([^\]]*)\])? (.*)$/;

/** What `tatr ls` prints, one row per line, in its order. */
function ls(cwd, args) {
	const result = run(cwd, ['ls', ...args]);
	if (result.status !== 0) throw new Error(`tatr ls ${args.join(' ')}: ${result.stderr}`);
	const rows = [];
	for (const line of result.stdout.split('\n')) {
		if (line === '' || line === 'No tasks were found') continue;
		const m = LINE.exec(line);
		if (!m) throw new Error(`unparsed line: ${line}`);
		rows.push({
			id: m[1],
			status: m[2],
			priority: Number(m[3]),
			tags: m[4] === undefined ? [] : m[4].split(','),
			title: m[5]
		});
	}
	return rows;
}

/**
 * The arrows `tatr graph` writes into `graph.dot`, sorted. It writes the file
 * into the folder it runs in, then fails to draw the SVG without Graphviz; the
 * `.dot` is all that is needed, and both files go once read.
 */
function edges(cwd) {
	run(cwd, ['graph']);
	const dot = readFileSync(join(cwd, 'graph.dot'), 'utf8');
	for (const name of ['graph.dot', 'graph.svg']) rmSync(join(cwd, name), { force: true });
	return [...dot.matchAll(/^\s*"([^"]+)" -> "([^"]+)";$/gm)]
		.map((m) => [m[1], m[2]])
		.sort((a, b) => (a.join() < b.join() ? -1 : a.join() > b.join() ? 1 : 0));
}

/** Orders rows by id, code unit by code unit, as `strcmp` does. */
function compareById(a, b) {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

/**
 * What `tatr untag` writes: for each tag of each task in `rows`, the file once
 * that tag alone is removed. `cwd` must be a copy: each file is put back before
 * the next run, so that every run removes one tag.
 */
function untagged(cwd, rows) {
	const cases = [];
	for (const { id, status, tags } of [...rows].sort(compareById)) {
		const path = join(cwd, 'tasks', id, 'TASK.md');
		const before = readFileSync(path, 'utf8');
		for (const tag of new Set(tags)) {
			const args = ['untag', '-t', tag];
			// `untag` rewrites the open tasks the query selects, or the closed ones with `-c`.
			if (status === 'CLOSED') args.push('-c');
			const result = run(cwd, [...args, id]);
			if (result.status !== 0) throw new Error(`tatr untag -t ${tag} ${id}: ${result.stderr}`);
			cases.push({ id, tag, text: readFileSync(path, 'utf8') });
			writeFileSync(path, before);
		}
	}
	return cases;
}

const read = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

function write(name, text) {
	const path = join(fixtures, name);
	const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
	writeFileSync(path, text);
	console.log(
		`${before === text ? 'unchanged' : before === null ? 'new      ' : 'CHANGED  '}  ${name}`
	);
}

// tatr's own recordings were first written by Python's json.dumps, which escapes
// everything outside ASCII; keeping that keeps their diffs down to content.
const ascii = (text) =>
	text.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

/** The ids each query selects, sorted and joined, one case per line. */
function cliCases(cwd, cases, encode) {
	const lines = cases.map(({ query, closed }) => {
		const ids = ls(cwd, closed ? ['-c', query] : [query])
			.map((row) => row.id)
			.sort()
			.join(',');
		return encode(
			`{"query": ${JSON.stringify(query)}, "closed": ${closed}, "ids": ${JSON.stringify(ids)}}`
		);
	});
	return '[\n' + lines.join(',\n') + ']\n';
}

// tatr's own repository.
{
	const raw = {};
	for (const id of readdirSync(join(checkout, 'tasks')).sort()) {
		const path = join(checkout, 'tasks', id, 'TASK.md');
		if (existsSync(path)) raw[id] = readFileSync(path, 'utf8');
	}
	write('tsoding-tatr-raw.json', ascii(JSON.stringify(raw, null, 1)) + '\n');

	const rows = [...ls(checkout, []), ...ls(checkout, ['-c'])];
	write('tatr-ls-output.json', JSON.stringify(rows, null, 1));
	const byId = [...rows]
		.sort(compareById)
		.map(({ id, title, status, priority, tags }) => ({ id, title, status, priority, tags }));
	write('tsoding-tatr.json', ascii(JSON.stringify(byId, null, 1)) + '\n');

	write('tatr-graph-edges.json', JSON.stringify(edges(checkout), null, 1) + '\n');
	write('tql-cli-cases.json', cliCases(checkout, read('tql-cli-cases.json'), ascii));

	const errors = read('tatr-query-errors.json').map(({ query }) => {
		const result = run(checkout, ['ls', query]);
		return { query, exit: result.status, stderr: result.stderr.replace(/\n+$/, '') };
	});
	write('tatr-query-errors.json', JSON.stringify(errors, null, 1) + '\n');

	// `untag` writes into the folder it runs in, so it runs over a copy.
	const copy = mkdtempSync(join(tmpdir(), 'tatr-untag-'));
	try {
		cpSync(join(checkout, 'tasks'), join(copy, 'tasks'), { recursive: true });
		write('tatr-untag.json', ascii(JSON.stringify(untagged(copy, rows), null, 1)) + '\n');
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

// Our corpus of edge cases, laid out for the run and removed after.
{
	const folder = mkdtempSync(join(tmpdir(), 'tatr-corpus-'));
	try {
		for (const [name, text] of Object.entries(read('corpus-raw.json'))) {
			mkdirSync(join(folder, 'tasks', name), { recursive: true });
			writeFileSync(join(folder, 'tasks', name, 'TASK.md'), text);
		}
		const rows = [...ls(folder, []), ...ls(folder, ['-c'])];
		write('corpus-ls-output.json', JSON.stringify(rows, null, 1) + '\n');
		write('corpus-graph-edges.json', JSON.stringify(edges(folder), null, 1) + '\n');
		write(
			'corpus-cli-cases.json',
			cliCases(folder, read('corpus-cli-cases.json'), (line) => line)
		);
		write('corpus-untag.json', JSON.stringify(untagged(folder, rows), null, 1) + '\n');
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}
