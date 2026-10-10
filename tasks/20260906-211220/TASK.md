# List view and task detail

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: ui

Dense sortable table, sorted by priority descending as `tatr ls` does, with
closed tasks hidden by default to match the CLI.

Detail opens through shallow routing (`goto(url, { shallow: true })`, new in
SvelteKit 3) so the list stays behind it. Markdown must be sanitised: it comes
from an arbitrary third-party repository, so rendering it raw is XSS by
construction. Rewrite relative attachment links to raw.githubusercontent.com.

---

Needs the routing from 20260906-211206.

---

Done. List at `/{owner}/{name}/list`, detail at `/{owner}/{name}/task/{id}`, both
sharing one loaded repository through context so navigating between them costs
nothing.

On sanitising: the first attempt rendered with marked and scrubbed the output
with DOMPurify, which needs a DOM and left a class of problem open. Replaced by
markdown-it with `html: false`, which never lets HTML in at all: markup in the
source is escaped into text, and its link validator refuses `javascript:`,
`data:` and `vbscript:` outright. Nothing is left to sanitise, which is a
stronger position than sanitising well, and it dropped three dependencies
(marked, dompurify, happy-dom) along with the need for a DOM in the tests.

The security tests assert the right property as a result: not "the word script
is absent" (it appears inertly as `&lt;script&gt;`) but that no *active* markup
survives, checked against the tags actually rendered.

Titles are rendered as inline markdown. This format puts inline code in titles
constantly (`` `tatr ls` relative paths are broken ``), and showing the
backticks raw would be showing the file rather than the task.

Verified in a browser against the live repository: `:bug and not :wontfix`
returns the same 8 tasks as the CLI, and the detail view shows the real mutual
reference between 20260826-200847 and 20260826-152351.
