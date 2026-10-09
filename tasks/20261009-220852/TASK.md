# Choose the branch from the header

- STATUS: OPEN
- PRIORITY: 45
- TAGS: ui

A branch can be read already — `/{owner}/{name}@{branch}`, and the homepage
field accepts `owner/name@branch` — and the header shows the address branch and
all. But once a repository is open, nothing leads to another branch or back to
`HEAD`: the address bar is the only way.

The header could offer it where it names the repository: a field to type a
branch name, and a way back to `HEAD`. Typing rather than a list, because
listing a repository's branches is one more API request against the 60-an-hour
budget, spent before the reader has asked for anything.

Switching keeps the view and the query, as moving between views does, and a
branch that does not exist says so the way an unknown repository does.

Done when a branch can be named from the header and left again for `HEAD`,
without a request beyond the listing of the branch itself.
