# Leave a kind its address and the way to open a source

- STATUS: OPEN
- PRIORITY: 40
- TAGS: data,scope

A `SourceKind` says five things: its address, how a reference reads on screen,
whether it has branches, what a reading costs, and how a source is opened. Only
the first and the last need a kind. The page opens the source as a reading
starts, before anything is shown, so the other three can be asked of it, as
Refresh and following already are:

- **How a reference reads** is the source's `label`. GitHub's `describe` and
  `label` said the same thing; a folder's source says its name, and one with no
  folder behind it, after a reload, says what it is. A host nothing reads,
  which has no source, reads as `owner/name`.
- **Branches** are a capability, `Branched`, which GitHub's source has and a
  folder's does not: the header asks the source, as it asks whether it can be
  read again.
- **What a reading costs** is a member of every source.

Then `kind.ts`, which names what the registry takes rather than the source a
reader is looking for, becomes `source.ts` in each source folder, and the
shared contract, `sources/source.ts`, becomes `sources/contract.ts`, which is
what its readers already call it and what `contract.spec.ts` runs.

A second forge (GitLab, Gitea) is what this prepares: it brings a class with
its capabilities, and a kind with an address, which for a self-hosted forge is
where more than a list of hosts will be needed.

Done when `SourceKind` is an id, an address and `open`, the page asks the
source for its name, its branches and its cost, and every source folder's
entry is its `source.ts`.
