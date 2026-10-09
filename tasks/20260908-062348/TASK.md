# Audit the code for complexity, gaps and simplifications

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: infra,ui

Asked because the code felt like too much of it. Four read-only reviews ran over
the views, the source layer, the domain libraries and the test suite; every claim
below was re-verified against the code before being acted on, and one was thrown
out for not holding.

**The impression was right and the place was wrong.** Of 3,846 lines in
`routes/` and `components/`, 1,806 — 47% — were scoped CSS, and no selector was
dead: the weight was re-declaration. Six idioms existed in three or four copies,
which is how a panel came to have three paddings and a `.mono` class came to be
applied in five places while being defined in two. Elsewhere the test/production
ratio is about 1.0; for the views it is 0.

Six defects came out of it, all confirmed:

- **A folder without a `tasks/` subfolder makes the walk descend everything**
  under a synthetic prefix, so `NoTasksFolderError` never fires and the reader
  waits, then reads "0 tasks". The directory-input door checks; the other two
  do not.
- **`.mono` was a phantom**: five elements rendered in the body face, and the
  list and the board disagreed on screen about the same data.
- **The cache's memory fallback was rebuilt per call**, so with IndexedDB
  unavailable nothing was ever cached and the homepage list stayed empty.
- **The `AbortSignal` never reaches a local folder**, so leaving a page does not
  stop its reads.
- **`"#lib"` in `package.json` maps to a file that does not exist.**
- **The list explained the wrong tag**: `describe` took a task and read
  `tags[0]` while being called per tag.
- **"Reading the body…" could stick**, the early return never resetting it.

And one claim that did not survive checking: the board does *not* lose the
`closed` parameter. Its `syncUrl` starts from `page.url`, so it only ever
touches `q` and an existing `closed=1` rides along.

---

Stage one done: the shared idioms, the two display defects, and what was
verifiably dead.

`src/styles/` now holds what every view agreed on and none owned — tokens, the
base elements, one panel, one action button, the labels (`.mono`, `.tag`,
`.prio`, a title's inline code, an empty note) and the keyboard's marks — and
`app.css` is the index that imports them. What stays in a component is what only
that view knows: a density, a column width, a layout. 1,806 lines of view CSS
became 1,675, and six idioms have one definition each.

SCSS was considered and declined. Custom properties already do what its
variables would, and better — three theme blocks swap live, which compile-time
variables cannot. Native nesting was measured rather than assumed: a probe
component using `&` type-checks and survives the production build in this exact
toolchain. Mixins are the one real gain, and would keep Svelte's scoping while
duplicating the declarations in the bundle; for six idioms shared *by intention*
the shared name is the point. The cost would have been `sass-embedded` plus a
preprocess step, in a project with one runtime dependency.

Removed as dead, each verified by counting readers: `--prio-1` to `--prio-4` and
`--accent-weak`, declared in all three theme blocks and used nowhere;
`RepositoryState.closed`; an `eslint-disable` directive in a project with no
eslint configuration.

---

A regression of my own, found by the reader rather than by the audit: the
dashboard never arrived, the page staying on its two-step loading panel for
ever, with no network request made at all.

`load()` captured `this.previous` unconditionally, and `load()` is called from
the layout's `$effect`. Reading state there makes the effect depend on it —
and the same method writes it a few lines down. So the effect re-ran, its
cleanup aborted the reading in flight, a new one started, wrote the value
again, and around. The phase never left `listing`.

It only showed where a cache entry carried a comparison: with `previous` already
null, writing null changed nothing and the effect did not re-run. Which is why
a fresh origin looked healthy and the reader's did not — and a good reminder
that "works on my machine" here meant "my IndexedDB is empty".

Both reads are behind `refresh` now, so the path an effect takes touches
neither. No cheap test covers it: the fault is a reactivity property, not a
value, and pinning it needs an `$effect.root` test — which is the exact payoff
of opening the view-test slot, since a spec file for one cannot run today.

---

Stages two and four done.

**A folder that is neither a repository nor a tasks folder is now left alone.**
Both handle walks ask for the proof the directory-input door already asked for
on paths: an immediate child holding a `TASK.md`. Only the top level is
examined, and only until one child answers, so a real tasks folder costs one
lookup and a mistaken selection costs one per top-level entry instead of a walk
of everything beneath it. The empty map that comes back is what lets
`NoTasksFolderError` reach the reader, which is the whole point: the old
behaviour prefixed a whole disk with `tasks/` and left the loader unable to say
anything but "0 tasks".

Four tests, and both guards proved to bite by removing them. The drop door gets
its own pair, being the one with no dialog in front of it — on Firefox and
Safari nothing asks the reader to confirm a file count before that walk begins.

**Skipped folders are said out loud.** `repo.skipped` was computed and read by
nobody, so a task folder the parser refused vanished and the count could differ
from `tatr ls` with nothing on screen to explain it. The header now carries one
clause — `· 1 folder skipped` — with the folders and reasons in its tooltip.
There rather than in a view because it is a fact about the reading, and in a
tooltip because naming them inline would push the header around for a case that
is rare.

Verified by making the case rather than waiting for it: four files pushed
through the application's own directory input, one of them in a folder called
`notes`. The dashboard read two tasks and the header said the third was
skipped, naming it.

Left as it was, and the audit was wrong about it: `"#lib"` in `package.json` is
SvelteKit's own convention, not a dangling mapping of ours — its `write_tsconfig`
test app ships the same pair, and `svelte-kit sync` reads `imports` to write the
tsconfig paths.

---

The indentation was one file out of step — 67 in tabs, one in spaces — and the
answer was not to align that file by hand but to give the project back the
formatter it had clearly once had. `sv add prettier` writes a config the code
*already* obeyed: tabs, single quotes, no trailing commas, width 100. That the
scaffold's defaults match this codebase exactly is what identifies them as its
origin.

The judgement is not in the config, it is in `.prettierignore`.

`tasks/` is out: this folder is the backlog *and* the fixture the viewer is
pointed at, so reflowing a task's prose would change what the screen shows —
the one thing this project refuses to do to a repository it reads.
`tests/fixtures/` is out: those are replays of the reference binary compared
byte for byte, and regenerating them needs the checkout and a compiler, so a
formatter must never be what changes them. `.claude/` and the build outputs
follow.

Left in: the README, at the price of one convention — prettier normalises
`*emphasis*` to `_emphasis_`. Its tables come out aligned, which is worth more
than the asterisks.

39 files reformatted, 306 of those lines being the one file's spaces becoming
tabs. Checked on screen and not only by the suite: the Svelte plugin reflows
markup, and markup whitespace is significant — the space around an inline code
span in a title, the gaps between the header's clauses. The list, the graph and
the header all still read right.

---

`provider.ts` is dissolved, which was the deepest of the audit's findings and
the only one touching the vocabulary the UI reads.

`Provider` had become a single-method interface with two implementations, both
GitHub, and one consumer — so it was never a layer, it was a function type
wearing a shape. It is now `type Lister = (ref, signal?) => Promise<Listing>`,
declared with the chain it serves in `github/kind.ts`, and the two wrapper
objects around `api.ts` and `ungh.ts` disappeared with it: each module exports
the function it always was, `listViaApi` and `listViaUngh`.

`Listing`, `TreeEntry` and the failure vocabulary moved to `source.ts`, where
`Source.list` was already promising them. `sources/` is now: the contract, the
registry, the loader, the cache, and one folder per source.

Two departures from what the review proposed, both argued rather than assumed:

- **`ProviderError` became `ListingError`, not `SourceError`.** Listing is the
  operation that fails this way — a spent budget, a repository that is not
  there, a host nobody serves — while reading a file never throws and a source
  with nothing behind it throws `NoSourceError`. `SourceError` beside
  `NoSourceError` would have been two names for two unrelated things, differing
  by a word.
- **`Listed` in `tatr/attachments.ts` stays.** The review called it `TreeEntry`
  under another name, which it is; what it also is, is the boundary that keeps
  the domain from importing the source contract. `tatr/` imports nothing from
  `sources/` — verified — and that is worth one duplicated pair of fields.

The seam kept its shape without naming a type it must not import:
`OpenOptions.listers` is spelled out structurally, and `LoadOptions` refers to
it. And the word followed the type: `PROVIDERS` is `LISTERS`, `providers` is
`listers`, and nothing in `src/` says "provider" any more.

The specs went with it. A fake lister is a function now, so three tests that
wrapped an object's method spy on the function itself — shorter, and asking the
same question. 584 tests unchanged, `svelte-check` at zero, and the module count
of `sources/` down by one.

---

The README was re-read against the code, at the reader's prompting, and it was
wrong in two ways — one of them worse than a stale sentence.

The count contradicted itself. "The widest door of the three" opened the local
section, and two paragraphs later "Either way your browser asks first, and the
two ask differently — so the page says which one is coming before you click".
Three doors, then two, and a click that does not exist: a drop asks nothing,
the drop *being* the gesture. Now two of the three ask, the drop says so, and
the section also states what tonight's guard does — a folder with no tasks in it
is told so rather than trawled.

And the mirror bullet promised more than one mirror can. "Hitting the limit
anyway is not the end" was written when there were two; with ungh alone it is
one more chance, not a guarantee, and it now says so.

The worse fault was in the pictures. All three screenshots showed a header with
**two** views, Overview and List — they predate the board and the graph, and the
brand mark. So the README's shop window displayed a product from two weeks ago
while its own table listed six URLs. Retaken at the same framings (1400×868,
1400×545, 1400×330) on the same repository and the same query, so only the
product differs: four views, the mark, and the Source panel that links a task to
its file on the forge.

Verified as correct, having been checked rather than assumed: the 64 rows and 34
query invocations against the fixtures, the 60 requests an hour, `1`-`4`
switching among exactly four views, the `404.html` the build emits, and every
query in the table appearing in the CLI replay.


---

Closed, after checking each defect of the opening list against the code rather
than against this journal, which had stopped accounting for two of them.

**"Reading the body…" could stick** was fixed in 655107e, the commit that opened
this task, along with the list explaining the wrong tag.

**The cache's memory fallback was still rebuilt per call.** `openStore()` made a
new store each time it was asked, the loader asked once per load and the
homepage once more, so with IndexedDB unavailable every write went into a memory
nobody read again and the homepage listed nothing — exactly as reported. There is
one store per page now, and the test that says so fails without it. It also
stops each load from opening its own IndexedDB connection.

**The `AbortSignal` still does not reach a local folder, and stays that way.** The
folder's reads are of files the browser has already handed over, the source has
no cache key so nothing is written, and the repository state checks the signal
before taking a result. Stopping those reads would save milliseconds of work
whose outcome is already thrown away.

What remains of the audit is the view tests, which were already
20260906-232421.
