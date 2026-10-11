# Make adding a source a matter of one folder

- STATUS: OPEN
- PRIORITY: 40
- TAGS: data,scope

Three sources read through one interface since 20260906-211255, and the loader
has one path for all of them. Writing a fourth is simple; knowing what else to
touch is not. Adding the served folder (20261011-150846) touched eight files
outside `src/lib/sources/`, four of them because they tell sources apart by
name: `ref.ts` treats `local` and `served` as hosts in three functions, the
header decides there are no branches with `isLocal(ref) || isServed(ref)`, and
the failure panel offers the folder picker on `isLocal`. A second forge would
meet the same, plus GitHub claiming every host with a dot in it and the
failure panel speaking of GitHub's sixty requests an hour for every source.
None of these places is listed anywhere, and the compiler points at none of
them.

The aim: a new source is one folder, one line in the registry, and a spec that
runs a contract every source passes, with the compiler naming anything else
that is missing.

## The shape

Three storeys, each with one job:

- **A source** does what every source does: `list`, `read`, `assetUrl`, and a
  `label`.
- **Capabilities** say what a source does besides, one small interface each,
  with a guard beside it for the views to ask: `Cached` (it spends a budget, so
  its readings are kept), `Rereadable` (Refresh means something), `Followable`,
  `Linked` (a page per file, with its history), and later `Writable`. A view
  asks `isRereadable(source)`, never which source it holds. `repeatable` and
  `refresh?()` say one thing twice today, and disagree: GitHub is repeatable
  without `refresh`, a folder always has `refresh`, even when it is not
  repeatable.
- **A kind** owns what is known before there is a source: its addresses
  (parsed, formatted, described), whether it has branches, what a reading
  costs, and how to open one.

Sources become classes, so that an instance owns its state. The local source
keeps its folder in module variables, written by the picker before the
navigation that creates the source; in between, the old instance reads the new
folder. That is the prerequisite 20261010-030543 names for writing. A folder
handed over once and a folder with a way back become two classes, which is the
distinction `repeatable: canReread()` draws today.

Left out on purpose: registering kinds at runtime, an abstract base class with
template methods, and classes for the listers, a function being all a lister
is. The reference keeps its GitHub shape (an owner and a name): a nested
GitLab path is the next forge's work, and this one only moves who parses it.

## Steps, one commit each

1. A contract spec every source runs over the same tree, before anything
   moves, so that each later step is checked by it.
2. Capabilities named, with their guards, and the views asking through them.
3. Sources as classes owning their state, the folder handed to the instance
   that reads it. A source that can be followed only sometimes is two classes:
   a folder with or without a way back, and the served folder with or without
   the dev channel.
4. Test seams in the constructors. `OpenOptions.listers` is GitHub's chain in
   every source's contract, and an injected `fetch` reaches GitHub's reads but
   not its listers.
5. One error class, whose message the source writes: the failure panel keeps a
   heading per failure, and stops writing GitHub's sentences for every source.
6. The kind owns its addresses and its way in: `ref.ts` stops knowing `local`
   and `served`, GitHub claims `github.com` alone, and the header's Reopen and
   the failure panel's picker come from the kind, where they are inferred
   today from `isLocal` or from a source that cannot be read again.

Writing (20261011-152936, 20261010-030543) comes after, as a `Writable`
capability, and belongs to those tasks.

Done when no view decides what to show by asking which source it holds
(branches, Refresh, following, reopening and the failure text all come from
the kind or the source), and every source passes the contract spec. The home
page's ways in stay one per kind, being what a kind brings.
