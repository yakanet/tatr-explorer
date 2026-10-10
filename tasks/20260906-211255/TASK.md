# Support forges other than GitHub

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: data

The URL scheme already carries a host segment and `src/lib/sources/provider.ts`
is meant to abstract listing and reading. GitLab and Gitea both expose a tree
API and a raw endpoint, so the shape should transfer.

Not urgent: no one has asked, and GitHub covers the case that motivated the
project.

---

Extends the provider abstraction from 20260906-211159.

---

The shape to build first is an interface, with GitHub as its only
implementation for now. What the code already asks of it, once the
GitHub-specific parts are collected in one place:

- **An id.** `github`. It is already half-present as `Provider.name`, which the
  UI prints when it says which source answered.
- **The hosts it answers for.** `parseRepoPath` currently guesses (a leading
  segment containing a dot is a host) and falls back to `github.com`, then
  `assertGitHub` rejects everything else. A forge has to declare its hosts, and
  the list cannot be closed: a self-hosted Gitea or GitLab is on whatever domain
  its owner chose, so an unknown host has to be either named by the reader
  (`gitlab.example.com/owner/name` already parses) or probed.
- **Two URLs, and probably three.** Raw contents, the file's page on the forge
  (`blobUrl`, added in 20260907-040701), and the repository's own page: the
  header prints `owner/name` and links it nowhere.
- **A logo.** Inline SVG, bundled, taking its colour from the theme, exactly as
  `Mark` does: the page makes no request for an image, and that rule is not
  worth breaking for a forge badge.
- **Listing the tree**, which exists as `Provider.list`.

And what is not on the list above but will decide how much this costs:

- **`Provider` is not a forge.** All three of today's providers are GitHub (its
  API, ungh proxying it, jsDelivr serving a cached copy of it), and each one
  calls `assertGitHub`. So a forge *owns* an ordered list of listers with their
  fallback order, and a new forge starts with exactly one and no fallback. Which
  means `mayBeStale` and the "which source answered" line have to still read
  sensibly when there is nothing to fall back to.
- **`RepoRef` is GitHub-shaped, and an interface does not fix that.** GitLab
  nests groups arbitrarily deep, so `group/subgroup/project` is a repository
  path; `RepoRef` has a fixed `owner` and `name`, `SEGMENT` forbids a slash in
  either, and `parseRepoPath` requires exactly two segments. The ref needs to
  carry a path rather than a pair, which touches `repoKey`, the cache, and every
  URL builder. This is the real work in this task.
- **What reference to use when none is given.** `HEAD` is deliberate here and
  was measured: both the trees API and raw accept it, which halves what listing
  costs against resolving the default branch first. That is a fact about GitHub.
  A forge has to say what its own "no branch given" reference is, and whether
  finding it costs a request.
- **How this forge says the budget is spent.** GitHub answers 403 with
  `x-ratelimit-remaining: 0`, or 429. `ProviderFailure` is the shared vocabulary
  and stays; the translation into it is per-forge. `truncated` belongs here too:
  GitHub's tree API caps a listing, which is *incomplete* rather than *stale*:
  two different things the UI currently conflates into one sentence.
- **Whether contents are free and CORS-open.** The whole architecture rests on
  the split in 20260906-211159: listing is metered, contents are not, so the
  loader reads 12 files at a time without asking anyone's permission. A forge
  whose raw endpoint is metered or refuses CORS collapses that split, and its
  implementation would have to say so rather than quietly making every task
  cost quota.
- **No credentials.** A token would raise every limit and is the obvious next
  thought; it is out of scope here and belongs to nothing yet. This site has no
  server and stores nothing it would not show a stranger.

Two things already work and should not be rebuilt: the cache key carries the
host (`github.com/owner/name@branch`), so two forges coexist in storage
untouched, and `[...repo]` is a catch-all route, so a deeper path is a parsing
problem rather than a routing one.

Worth deciding while writing it: the differential fixtures replay one GitHub
repository, and the conformance tests must stay about the *format* rather than
about a forge, or a second implementation will have nothing to be tested
against.

---

A proposal, now that 20260907-122228 is built and there are two sources to
generalise from rather than one to imagine.

**The thing to name is a source, not a forge.** A folder on the disk is not a
forge and reads tasks perfectly well; a forge is a source that also has URLs, a
budget, a branch and an address other people can follow. Naming the interface
after the smaller idea is what keeps the local source from being a permanent
exception.

    /** Everything a reading of tasks needs, whatever it is a reading of. */
    export interface Source {
        /** `github`, `local`. The UI picks a mark by it; nothing else may. */
        readonly id: string;

        /** What the reading calls itself: `owner/name`, or a folder's name. */
        readonly label: string;

        /** Where this reading may be cached, or null when it must not be. */
        readonly cacheKey: string | null;

        /** How many reads at once this source likes: politeness to a CDN, and
         *  nothing at all to a disk. */
        readonly concurrency: number;

        /** Every file it holds, once. Throws SourceError. */
        list(signal?: AbortSignal): Promise<Listing>;

        /** One file as text, or null when it cannot be read. */
        read(path: string, signal?: AbortSignal): Promise<string | null>;

        /** A URL the browser can put in an `<img>` or a link: a raw endpoint,
         *  or a `blob:` for a file already in memory. */
        assetUrl(path: string): string | null;

        /** The file's own page, where its history is. Absent by design for a
         *  folder: there is nothing to link to. */
        fileUrl?(path: string): string;
    }

`cacheKey: string | null` is the shape worth arguing for: "this must not be
cached" stops being a branch in the loader and becomes something the source
declares. The local source answers null and the whole question is settled.

`id` rather than a logo. A component in a data interface would drag Svelte into
`lib/sources`, and the mark is a UI decision about an id, so the interface says
what it is and the UI keeps a registry of marks.

**A kind, above the instance, for choosing between them.** Recognising a
reference is not something an instance can do; it is what decides which instance
to build.

    export interface SourceKind {
        readonly id: string;
        /** Whether this kind serves the reference: a host it answers for, or
         *  the local marker. Cannot be a closed list of hosts: a self-hosted
         *  Gitea is on whatever domain its owner chose. */
        claims(ref: RepoRef): boolean;
        open(ref: RepoRef): Source;
    }

    const KINDS: SourceKind[] = [github, local];
    export function openSource(ref: RepoRef): Source | null;

**`Provider` stays, one storey down.** Today's three are all GitHub (its API,
ungh proxying it, jsDelivr caching it), so they are what a *forge* falls back
through, not sources. `github.list()` keeps that ordered list inside itself, and
a new forge starts with one lister and no fallback. Which means `Listing` has to
keep saying which one answered, and stay sensible when the answer is always the
same.

**Two changes to `Listing` while it is open.** `mayBeStale` is not the only way a
listing can be less than the truth: GitHub's tree API caps large repositories,
which is *incomplete*, not late. Those want to be two fields, `mayBeStale` and
`complete`, because the sentence shown to the reader is different: one says the
copy may be behind, the other says tasks are missing.

**And `RepoRef` is still the real work**, which no interface hides: `owner` and
`name` are a GitHub shape, GitLab nests groups arbitrarily deep, so the
reference wants a path rather than a pair. `SEGMENT`, `parseRepoPath`, `repoKey`
and every URL builder touch it.

Out of scope, deliberately: credentials, and writing. This viewer never writes,
and a source that could would be a different program.

---

Proved on the `source-interface` branch, by writing it for the two sources that
exist and making the loader consume nothing else. The suite is the verdict: 549
tests unchanged and green, five added for the registry, and `loadRepository` has
one path where it had two. All four URL call sites go through the source, and
`isLocal` is gone from the loader and from the renderer.

Four corrections the interface needed, none of them visible from the proposal:

- **`branch` cannot be a member.** A working tree reads its own out of
  `.git/HEAD`, asynchronously, so no synchronous member can answer. A forge
  captures one when it is opened and builds every URL with it; which branch was
  read is a fact about the reading, and `Listing` already carries it.
- **Two members were missing, both about repeating a reading.** `repeatable`
  says whether Refresh means anything (a forge always, a folder only where a
  handle was kept), and `refresh?()` is the folder being walked again. They
  deleted a `canReread()` check in the layout and the loader's local branch.
- **A failure had to move into the contract.** `NoSourceError`: a source that
  exists with nothing behind it, which a forge cannot be and a folder is after
  every reload. It lives beside the interface so a source can throw it without
  importing the loader.
- **`listRepository` and `PROVIDERS` belong to GitHub**, as this task predicted,
  and moving them was not optional: leaving them in the loader made a cycle,
  load → open → github → load.

Two `isLocal` survive, both in views, and both are about *presenting* a local
source rather than reading one: offering the folder picker in the failure panel,
and showing a folder's name where a forge shows its URL form. That is the right
home for the last of that knowledge.

A review of the POC found two things worth fixing and two worth only a note.

The registry keyed by id could silently lose a kind: written as an object with
computed keys, two kinds sharing an id would leave one of them out, and a test
that iterates the record would pass over the hole it left. So the list is what
declares them and the record is *derived* from it, through a check that throws
at import (proved by giving two kinds one id, which now fails to load rather
than quietly serving one source less). The spec names the ids it expects instead
of counting the record against itself.

And `loadTaskDescription` had started mapping an empty body to *no* body:
`text ? parse : null`. Both render the same screen, so nothing was visible, but
`null` is a file that could not be read and an empty file is one that says
nothing, and a translation meant to be mechanical should not blur them.

Left as a note in the code where a reader would trip on it: `repeatable` in the
layout is a `$derived` over `ref` reading module state that is not reactive,
which no current path can catch out: every `openFolder` ends in a navigation
that renews `ref`. And the `unsupported-host` error carries a host in the field
documented for a provider's name, which nothing reads.

The seam itself is covered now, which it was not: the loader's tests exercise
the reading and `open.spec.ts` only asserted what each source *says about
itself*. Nine tests ask what they do: a file read from the CDN and the URL it
asked for, a refused file and a network that does not answer at all, both
answering null rather than throwing, since one unreadable task is listed as
skipped instead of taking the whole load down; and for a folder, a file in
memory, a path it does not hold, the name no URL carries, and the folder with
nothing behind it. Checked by letting a fetch failure through, which fails two
of them.

One thing the interface tidied on its own: five of `local.ts`'s exports have no
reader outside it any more; the session is reached through the source now, so
only opening and closing a folder leave the module. A surface that shrinks
without anything being deleted is the sign the abstraction sits in the right
place.

`OpenOptions` carries `providers` and `fetchImpl` purely as test seams. Worth
admitting rather than dressing up: the alternative was a module-level registry
for the tests to mutate.

**And the id is not in the URL, which is the question the POC leaves open.** Our
own URLs carry a *host* (`/tsoding/tatr`, `/gitlab.com/group/project`), and the
kind is inferred from it, today by "any host with a dot is GitHub". `repoKey`
carries the host too, and no id.

That holds while one forge exists and breaks in two places when a second one
does. A host cannot say which software answers it: `git.mycompany.com` may be a
GitLab or a Gitea, and no table of known hosts will ever know. Either the page
probes, or the reader names it. And the place a reader names it is the URL,
which would then carry the id as a segment of its own:
`/gitea/git.mycompany.com/owner/name`. The second place is the cache: two
readings of one host by two kinds would share an entry, since the key does not
distinguish them.

What settles the shape is that the URL *already* carries an id in one case.
`/local` is not a host, and `LOCAL_HOST` says as much in its own doc comment:
an id wearing a host's clothes. So the scheme mixes the two notions today, and
the choice is to name the id everywhere or nowhere. Naming it everywhere reads
better than it sounds: `github` is the default and stays absent, exactly as
`github.com` is absent now.

Not attempted, deliberately: `RepoRef`'s owner-and-name shape, which is still
the real work; the split of `mayBeStale` from `complete`; and the mark registry,
which now has an id to key on.

---

GitLab measured rather than assumed, since the whole architecture rests on
"listing is metered, contents are not" and a forge that breaks the split changes
the design. Headers read with an `Origin` of our own, against `gitlab.com`:

- **The API is CORS-open**: `/api/v4/.../repository/tree` answers
  `access-control-allow-origin: *` and exposes its pagination headers to the
  page (`X-Total`, `X-Next-Page`, `Link`). Its budget is `ratelimit-limit: 500`,
  per minute rather than per hour.
- **The web raw endpoint is not.** `gitlab.com/owner/name/-/raw/main/file`
  answers 200 to `curl` and carries *no* `access-control-allow-origin`, so a
  `fetch` from the page is blocked. It stays usable for an `<img>` and for a
  link, neither of which needs CORS, so `assetUrl` and `fileUrl` are fine and
  `read` is not.
- **So contents cost budget on GitLab.** They come from
  `/repository/files/:path/raw?ref=`, which is CORS-open and metered like the
  rest. 500 a minute against ~40 tasks is comfortable, but the sentence the
  README prints (contents are free, only listing is counted) becomes a fact
  about GitHub rather than about the viewer. `Source` needs to say it.
- **Listing can be cheaper than on GitHub.** The tree API takes `path=`, so it
  lists `tasks/` alone: 43 entries in a single page where the whole repository
  is 7,180. GitHub's recursive tree has no such filter and returns everything.
- **`ref=HEAD` is accepted**, and so is no `ref` at all. The measured shortcut
  survives, so "what reference when none is given" is not a cost here.

Which settles the two things this task said would decide how much it costs: the
raw/API split has to move into the source, and GitLab's pagination is real but
bounded by `path=`.

---

Closed on a decision rather than on a second forge: none is wanted for now, so
the GitLab source is set aside. What this task was really asked to produce got
produced: the interface, and the knowledge of what a second forge would cost.

What stands: `Source` and `SourceKind`, both existing sources read through them,
one path in the loader where there were two, and GitLab's endpoints measured
instead of guessed. Starting a forge from here begins with a working
abstraction and a page of facts, not from zero.

What is deliberately not done, and why each piece buys nothing until a second
forge exists:

- **`RepoRef` as a path.** Its only justification is GitLab nesting groups
  arbitrarily deep. On GitHub a repository is always two segments, so the change
  would be generality serving nobody. Worth recording that it is smaller than
  this task feared: ten call sites in four files, and all ten already spell
  `${ref.owner}/${ref.name}`, which is to say they want the path. The real
  content is in the parser, and in `repoKey` changing shape: the cache never
  expires, so old entries would sit orphaned forever unless a version prefix
  retires them.
- **The source id in the URL.** With one forge there is nothing to distinguish;
  `github` would be an implicit segment that never appears. The wart it would
  fix (`/local` being an id wearing a host's clothes) is not worth a change to
  the URL scheme on its own.
- **The mark registry**, which needs a second mark.
- **`complete` beside `mayBeStale`.** Already decided the other way and working:
  a truncated tree throws, so the GitHub lister fails and the page falls through
  to a fallback rather than showing part of a repository. Splitting the field
  would let the reader see the tasks that *were* found under a warning, which is
  arguably better for a monorepo. And nobody has one. GitHub's cap is 100,000
  entries; this repository holds 38 files.

One wart left standing on purpose: that truncation is reported as `malformed`,
which it is not. A one-word mislabel in a message no reader has seen, in the
vocabulary that a second forge would rewrite anyway.

