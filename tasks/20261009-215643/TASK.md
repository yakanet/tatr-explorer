# Read a pull request's tasks against the branch it targets

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: data

Tasks are files, so a pull request that adds, closes or reprioritises tasks is
reviewed today as a diff of Markdown. On a refresh, the site already compares
what is new, closed or moved in priority since the last reading
(20260907-040703). The same comparison between a PR's head and its base would
read better than the diff.

A branch can already be read: `/{owner}/{name}@{branch}` goes through the trees
API, ungh and raw, and the cache keeps each branch apart. Choosing one from the
header is 20261009-220852.

To measure before designing:

- whether `@refs/pull/<n>/head` already works, the address accepting slashes in
  a branch name. Raw keeps those slashes, while the trees API and ungh receive
  them encoded as `%2F`, which nothing has shown them to accept. A fork's head
  lives in another repository, and resolving it is `pulls/<n>`, one more request;
- what a comparison costs: one listing per side against the 60-an-hour budget,
  the files themselves being free on raw, or whether the compare API names the
  changed paths in one request;
- how a PR is addressed. `/{owner}/{name}/pull/<n>`, mirroring GitHub's own URL,
  would let a reader swap the host and land here.

Done when a PR's address shows its tasks, and what it adds, closes and changes
against its base, at a cost stated on screen before it is spent.

---

Closed without being done: it leans on GitHub too much. A pull request is a
GitHub object, not a git one. Finding its head means `pulls/<n>` or the
`refs/pull/<n>/head` convention, a fork's head lives in another repository, and
naming the changed paths cheaply means the compare API. Every one of those is
specific to one forge and spends the reader's budget, where everything else
here reads plain branches of a repository and could follow any forge.

What remains possible without it: reading the PR's branch by name, in the same
repository, with the branch menu (20261009-220852), and the badges showing what
moved since the previous reading.
