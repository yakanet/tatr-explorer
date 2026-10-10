# Keep the forge's knowledge inside the forge

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: data

Found by reading rather than by a failure, while asking why `blobUrl` and
`PROVIDERS` live in `github.ts`. They belong there: all three listers *are*
GitHub, so the fallback chain is the forge's and the URL builders are its
shapes. But the question found one thing sitting in the wrong file and two
smaller ones beside it.

`assertGitHub` was exported from `provider.ts`, which is the vocabulary the
listers share: a GitHub fact in the neutral module. It could not simply move,
either: `ungh.ts` and `jsdelivr.ts` both called it, and `github.ts` imports
them for `PROVIDERS`, so importing it from there would have made a cycle.

The way out was to notice the guard has no business being per-lister. All three
read the same forge, so the host is asked once, at the entrance of the chain in
`listRepository`. Three calls become one, the shared export goes away, and the
error now names the forge that refused instead of whichever lister happened to
be asked last.

Two more, while the file was open:

- **`rawUrl` and `blobUrl` were exported for their own test only.** Nothing else
  imported them. The spec now goes through `githubKind.open(…)`, which is how
  the application reaches them, so the module's surface is the contract and
  `listRepository`.
- **`defaultBranch` was dead.** Exported, called by nobody, and contradicting a
  decision this project made deliberately: `HEAD` is the reference precisely so
  that resolving a default branch by name never costs a request. A function
  offering to do it was an invitation to undo that.

Nothing was covered here before: no test asserted that an unknown host is
refused, which is the behaviour that answers `gitlab.com` today. One now does,
and it also pins that no lister is tried (proved by removing the guard, which
fails it).

577 tests green, `svelte-check` at zero.

---

The other half of the same question, asked straight after: `PROVIDERS` should
not sit inside `github.ts` either, and the suggestion was an `index.ts`.

Not an `index.ts`, for a reason already in the tree: the one this repository has,
`src/lib/tatr/index.ts`, is imported by nobody. A barrel buys nothing here
because `#lib/*` demands file extensions, so there is no directory resolution to
shorten: an import would read `.../github/index.ts` anyway, and would hide
which file the symbol came from.

The layout answers it instead. `sources/github/` now holds `api.ts` (the trees
API as one lister), `ungh.ts` and `jsdelivr.ts` (mirrors of it), and `forge.ts`
(the host guard, the ordered chain, the URL shapes, the source kind). The claim
this task made in prose (those three listers are GitHub, not three sources)
is now in the filesystem rather than in a comment.

The chain also has to live *above* its members, which flat files could not
express: the kind needs the chain and the chain needs the listers, so any split
that left them side by side made a cycle.

One thing deliberately not shared: the forge's id and its primary lister's name
are both `github` and are now declared twice, once in each file. They coincide
today and are not the same fact (renaming the API lister would not rename the
forge), and a shared constant would have claimed they must move together.

Left standing, mentioned rather than done: `provider.ts` is the vocabulary a
chain shares, but `Listing` and `ProviderError` are used by the local source
too, which is not a provider. And `src/lib/tatr/index.ts` is still dead.

---

One source, one folder: applied to the local source too, since half a pattern
is worse than none. `local/folder.ts` is what a folder is and the three ways one
gets in; `local/session.ts` is the source, holding for a folder what `forge.ts`
holds for GitHub.

The two folders are deliberately not symmetrical inside, and the reason is
worth writing down before somebody evens them up. A forge's three listers are
independent services (three hosts, three response shapes, three error
translations), so they are three files. The folder's three doors are one walk in
three dialects: they share the type they produce and the strategy of descending
`tasks/` alone, and only the flat-list door needs the path filter at all.
Splitting them would have bought a fourth file to hold what they share.

What the move made visible: the session is the local source. Not a helper it
uses: the module state *is* what "a folder is open" means, so it belongs in the
file that builds the kind rather than beside the walks. Which is also why the
folder file exports no state at all: it turns three browser APIs into a name and
a map, and nothing more.

---

The entry point of a source folder was not findable by name: `github/forge.ts`
on one side, `local/session.ts` on the other, both true to their domain and
neither recognisable as *the* file the registry imports.

Both are now `kind.ts`, which names the export that makes a folder a source:
the {@link SourceKind} `open.ts` holds. Not `source.ts`, which would have been
the third file of that name beside the contract in `sources/source.ts`; not
`index.ts`, for the reasons recorded above. The domain word each file had earned
did not disappear, it moved one line down into the module doc, where "a forge is
what GitHub is" and "a local source is a session" are sentences rather than
filenames.

So a reader arriving at `sources/` finds the contract in `source.ts`, the
registry in `open.ts`, and one `kind.ts` per source folder.

And `Provider.name` is gone, having survived one commit as the thing that would
cost 28 call sites to remove. It cost a regex over one spec, which is what the
answer to "if it is not useful, it goes" is worth. What remains of a lister's
identity is where it is actually read: the `ProviderError` it throws names it.
`Provider` is now a single method: a function type wearing an interface, which
is what lets a test spy on `.list`.

---

A pass counting readers rather than reading code, which found three exports that
only the tests crossed.

`PROVIDERS` and `listRepository` are private now. Both were reached from a spec
and from nowhere else, so the specs go through the door the application uses:
`githubKind.open(ref, { providers }).list()`. `open.ts` was already the only way
in for everything but those tests; now it is the only way in.

`KINDS` had no production reader at all: it was built for a registry of marks
that closed with 20260906-211255. Rather than deleting the shape, `openSource`
reads it, and the record stopped being derived from a list: it *is* the
declaration, keys written out. Which turns out to be safer than the reduce it
replaced: the mistake that reduce was guarding against, two kinds sharing an id,
is an error the compiler makes in a literal. Twenty lines became four, and the
throw-at-import and the duplicate-id check went with them. What a literal cannot
check is that each key is the id its kind answers to, and the spec does that.

One correction found while rewriting: routing the unsupported-host test through
the source dropped the counting provider from the call, which made "without
asking anybody" true for free. Passed properly through `OpenOptions`, and both
guards were re-proved by breaking them.

