# Make the GitHub source read like the others

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: data

Since 20261011-163029, `local/kind.ts` and `served/kind.ts` open on the source
they are; `github/kind.ts` gets to its class after the URL helpers, two lister
types, the fallback list, the fallback loop, the missing-repository sentence
and the test seams. The logic is not harder, the file is.

What makes it so, and what to do about each:

- **Free functions repeat what the class holds.** `rawUrl`, `blobUrl`,
  `listRepository` and `missing` take the reference, the branch, the network and
  the listers as arguments, while the class keeps them in private fields. They
  become methods, and `list()` holds the fallback itself.
- **The fallback carries too much state**: a spent budget and a last error,
  kept apart. A list of failures, and the first spent budget or else the last
  failure, says the same.
- **Test seams shape the class.** `Lister`, `Listers` and `Seams` exist so that
  the fallback specs can hand over listers. Faked at the network instead, by
  host (`api.github.com`, `ungh.cc`), as the GitHub spec already does, they pin
  the real HTTP answers, and the class keeps one seam, the network, as the
  served source does.
- **The docs tell history**: a forge "GitHub-shaped", a dropped third lister
  with its measurement, a second forge to come, a task id in a comment, and why
  the blob URL takes the reference's host, when only github.com reaches it.
- **`HEAD` as the default is worked out in four places**: the class, and the
  listers again. The class resolves it once and hands it over.
- **The listers**: `api.ts`'s `json()` returns a response and parses nothing,
  and the same conditional builds a tree entry in both files. Their names are
  not parallel either, `api.ts` saying what it is and `ungh.ts` whom it asks:
  `github-api.ts` and `ungh-api.ts`, with `listViaGitHubApi` and
  `listViaUnghApi`.

Done when `github/kind.ts` opens on its class, reads at the length of
`served/kind.ts`, and the fallback specs fake HTTP rather than listers, with
the suite unchanged in what it checks.

---

Done as planned: `github/kind.ts` opens on `GitHubRepository` and is as long as
`served/kind.ts`. Beyond the plan:

- The listers return the files alone, and `list()` adds the branch it resolved,
  which they had only been handing back.
- The loader specs read a fake source of their own rather than GitHub: they are
  about the loader, and a change to how GitHub lists no longer reaches them.
  The fallback specs fake the two hosts' HTTP answers in the GitHub spec. Two
  cases went with what they pinned: a blob URL on another host, and a missing
  repository named once, which the fallback specs cover.

Raised on the way, for the next change: `describe` on a kind repeats what a
source's `label` says, and so do `branches` and `cost` belong to the source,
which leaves a kind its address and the way to open it; and `kind.ts` names
what the registry takes rather than the source a reader is looking for.
