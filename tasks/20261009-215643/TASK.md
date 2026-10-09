# Read a pull request's tasks against the branch it targets

- STATUS: OPEN
- PRIORITY: 50
- TAGS: data

Tasks are files, so a pull request that adds, closes or reprioritises tasks is
reviewed today as a diff of Markdown. The comparison the site already makes on a
refresh — what is new, closed, moved in priority since the last reading
(20260907-040703) — is the same comparison between a PR's head and its base, and
would read better than the diff.

A branch can already be read: `/{owner}/{name}@{branch}` goes through the trees
API, ungh and raw, and the cache keeps each branch apart. Choosing one from the
header is 20261009-220852.

To measure before designing:

- whether `@refs/pull/<n>/head` already works, the address accepting slashes in
  a branch name. Raw keeps those slashes, while the trees API and ungh receive
  them encoded as `%2F`, which nothing has shown them to accept. A fork's head
  lives in another repository, and resolving it is `pulls/<n>`, one more request;
- what a comparison costs: one listing per side against the 60-an-hour budget,
  the files themselves being free on raw — or whether the compare API names the
  changed paths in one request;
- how a PR is addressed. `/{owner}/{name}/pull/<n>`, mirroring GitHub's own URL,
  would let a reader swap the host and land here.

Done when a PR's address shows its tasks, and what it adds, closes and changes
against its base, at a cost stated on screen before it is spent.
