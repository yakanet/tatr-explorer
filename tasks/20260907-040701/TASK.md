# Link a task to its file in the repository it came from

- STATUS: CLOSED
- PRIORITY: 65
- TAGS: ui

Nothing on a task's page says where the file lives. A reader who wants the raw
markdown, the blame, or the commit that closed it has to reconstruct the URL by
hand from the owner, the name, the branch and the id.

    https://github.com/<owner>/<name>/blob/HEAD/tasks/<id>/TASK.md

All four parts are already in `RepoRef`, and the loader knows which provider the
files came from, so the link costs a template and nothing else.

This is deliberately the answer to wanting a task's history rather than reading
it ourselves. The format carries no modification date (upstream task
20260304-115038 is about exactly that absence), and the API route to it is
`/commits?path=tasks/<id>/TASK.md`, one request per task against an
unauthenticated budget of sixty an hour. Sixty-four tasks cannot be dated at any
price the reader should pay. The forge already renders history well; a link
hands the reader something better than we could build, and spends nothing.

So: a link per task, on the task's page. `HEAD` as the reference, like every
other read (see the note in the loader on why the default branch is never
resolved), and the branch when the repository was opened with one. It has to
carry the provider it points at rather than assuming GitHub, which is what
20260906-211255 will make matter.

---

`blobUrl` sits next to `rawUrl`, and the pair now reads as one idea: the raw
contents come from a CDN that costs no budget, the file's page comes from the
forge's own domain. It is the one URL where `ref.host` is genuinely the answer
rather than a constant, which is as far as this can go before 20260906-211255:
the path shape is still GitHub's, GitLab spelling it `/-/blob/`.

`HEAD` works there, checked against the real forge rather than assumed: a blob
URL on `HEAD` answers 200, as does one on a named branch, so the link follows
the same reference every other read uses.

The link lives in a `Source` panel in the right-hand column, reading
`TASK.md on github.com`, with a note saying what is over there: its history and
its blame. It sits last, above `← Back to the list`, which pairs the way out
with the way back.

It was first at the end of the meta line, beside the creation date, on the
argument that both say where the page came from. Wrong: the aside is where this
page keeps everything *about* the task (its properties, its references, the
files beside it), and a reader looking for the file looks there. The meta line
is a caption, and a caption is read, not used.

It opens away from the page, like every external destination the renderer
emits.

A latent bug came out of writing it. `rawUrl` encoded the branch with
`encodeURIComponent`, which turns `feature/web-ui` into `feature%2Fweb-ui`, a
branch of that literal name, which no repository has. Since `parseKey` keeps
branches with slashes on purpose, every read of such a repository was failing at
the URL. Branch and path are encoded segment by segment now, by the same helper,
and `github.spec.ts` pins both along with the blob shape. There were no tests on
these URLs at all before.
