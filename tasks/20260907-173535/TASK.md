# Link a task id written in a body

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: ui

Task bodies cite each other by id — this repository's own do it constantly, and
so do upstream's — and every one of those ids renders as plain text. The
References panel lists them, so the information is on the page; what is missing
is that the id *in the sentence that explains it* is not clickable. The reader
has the reason in front of them and has to go around by the panel.

So: a HUID in a rendered body becomes a link to that task's page.

Four constraints, all of them found in the code rather than guessed:

- **`renderMarkdown` only, never `renderInline`.** The list and the board wrap a
  title in `<a href=… data-key-row>` and fill it with `renderInline`. An anchor
  inside that anchor is invalid, the browser breaks it apart, and the row link
  the keyboard depends on goes with it. Titles keep their ids as text.
- **Only ids this repository has.** Our own tasks cite upstream ones —
  20260304-115038 for instance — which do not exist here, and linking those
  would lead a reader to *No such task*. The References panel already lists only
  what resolves; the same rule keeps the two agreeing.
- **Not the task's own id.** A body naming itself would link to the page it is
  on.
- **Recognised by `scanHuids`, not by a regex written for the occasion.**
  `huid.ts` ports the reference implementation's own scan, and the References
  panel is built from it. A second, looser notion of what an id looks like would
  make a body link ids the panel does not list.

On the shape: markdown-it's own linkify works by splitting `text` tokens in a
core rule, which is the pattern to follow. Code spans are not text tokens, so
`` `20260907-173535` `` stays literal for free, but the inside of an existing
link has to be skipped explicitly or the nesting comes back by another door.

The href wants `resolve('/[...repo]/task/[id]')`, which is what carries the
`BASE_PATH` the deployed site is served under. That is a `$app/paths` import,
and `render/markdown.ts` is a plain module under unit test, so it should be
handed a builder in `RenderOptions` instead — the pages that call it already
have a `taskHref` for their own links.

---

Done as described: a core rule splits `text` tokens after the inline parse, the
way markdown-it's own linkify does, and the four constraints held.

The scan gives up its positions rather than being searched afterwards.
`scanHuidSpans` is now the scan and `scanHuids` its ids, because recovering a
position with `indexOf` is wrong in a case the port makes real: `chopHuid`
accepts a truncated id at the very end of a text, so `20260907-17 ... x` can be
read as an id where an identical earlier occurrence is not one, and the search
would link the wrong occurrence.

Two things the code said that the ticket could not.

**The link rewriting had to be taught to skip its own links.** A task page's
href has no scheme either, so `isRelative` claimed it and `resolveAttachment`
turned `/tatr-dashboard/t/20260907-011003` into a `raw.githubusercontent.com`
path. Marked with `markup`, which is where linkify records the same provenance.
A test caught it, not a reading.

**`@types/markdown-it` was stale and is gone.** markdown-it 15 ships its own
types, and the two disagreed — `attrs` values are `string | number` there and
`[string, string][]` in the 14.x package — so a rule typed against one could not
be handed to the other. Nothing was importing the package any more: dropping it
took `svelte-check` from 939 files to 918, with the same zero errors.

Cheaper than expected: an id inside `**bold**` needs nothing, because an inline
token's children are a flat list, so that id is a text token like any other.
Only a link's own text needs stepping over, and it is a depth count rather than a
flag since a link can hold emphasis and images.

The `state.inlineMode` guard rather than a second parameter is what keeps titles
out. One rule serves both renderers, and no future caller of `renderInline` can
produce an anchor inside the row link by accident.

Verified against this repository's own tasks in the browser: 20260906-211227
links 20260906-211220 and 20260906-211241, and leaves upstream's
20260826-200847 and 20260304-115038 as plain text — the same set the References
panel beside it lists. Nine tests on the renderer and two on the scan, each
proven to bite by breaking the guard it covers; one of them pins that an
unresolved id keeps its text when a resolved one sits in the same sentence,
which an earlier shape of the loop dropped.
