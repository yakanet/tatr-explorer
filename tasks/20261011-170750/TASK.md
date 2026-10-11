# Add a repository on a self-hosted forge, through a small wizard

- STATUS: OPEN
- PRIORITY: 20
- TAGS: data,ui

A GitLab or a Gitea runs on whatever host its owner chose, and nothing in
`git.example.com` says which it is. So the reader says it: a small wizard picks
the source (GitLab, Gitea), takes the host, and adds a "custom" repository read
by that source. Wanted, but not before a second forge exists to pick.

It rests on 20261011-170749, a reference naming the source that reads it: a
custom repository is one whose source was chosen rather than read off its host.

What it will need besides, and was left for it on purpose:

- **Each source reads and writes its own addresses** (`static parse`,
  `static format`). The shared reading of a forge address supposes GitHub: two
  segments, `owner/name`, where GitLab nests groups (`group/sub/project`), and
  GitHub's URL shapes, where GitLab writes `/-/tree/` and Gitea `/src/branch/`.
  Written before a second forge exists, it would only freeze GitHub's.
- **`hosts` only recognises a public host**: a URL from gitlab.com pasted into
  the picker, the sentence for a host nothing reads, the spec that no two
  sources share one. The hosts a reader adds are data, kept with their
  repositories rather than written into a class.
- **A custom repository stays a link.** Every view is a URL that can be shared,
  so the source chosen has to be in it (a prefix such as
  `/gitlab/git.example.com/group/project`) rather than only in this browser.

To find out before promising "any GitLab": many self-hosted instances send no
CORS headers on their API, and a browser cannot read those at all.
