# Read a private repository with the reader's own token

- STATUS: OPEN
- PRIORITY: 60
- TAGS: data,ui

Every repository is read anonymously, so a private one answers 404, as if it
did not exist. Wanted: public repositories stay readable without signing in,
and a reader who wants more gives the site read access to the private
repositories they choose, and to those only.

**"Sign in with GitHub" cannot work without a server.** OAuth ends by trading a
code for a token at `github.com/login/oauth/access_token`, and the device flow
starts at `github.com/login/device/code`; both answer a CORS preflight with 404
and no CORS headers (checked), so a page cannot call them. The code exchange
also takes the client secret, PKCE or not. GitHub has planned the fix, a "SPA"
client type for GitHub Apps with PKCE, no secret and CORS on `/access_token`
(github/roadmap#1153), but marked it paused in August 2026. If it ships, a real
"Sign in" needs no server, and becomes a second way to obtain the same token.

Until then, the reader creates a _fine-grained personal access token_ and pastes
it. GitHub lets it be limited to chosen repositories and to "Contents:
read-only", which is exactly the access wanted, and `api.github.com` accepts an
`Authorization` header from any origin (checked). A relay holding the client
secret, such as a Cloudflare Worker, is refused: it is the server this site
does not have, and every reader's token would pass through it.

**What a token changes:**

- **Contents no longer come from the CDN.** `raw.githubusercontent.com` refuses
  a preflight carrying `Authorization` (checked: 403), so a private file is
  read through the API, which is metered. One GraphQL query can return every
  `TASK.md` under `tasks/` at once, which keeps a private repository at about
  one request, like a public listing; to check against GraphQL's size limits.
- **The token goes to `api.github.com` and nowhere else**, never to `ungh.cc`,
  which is no fallback for a private repository anyway.
- **Where the token is kept.** Session storage by default, so closing the tab
  forgets it; remembering it is an explicit choice. Signing out forgets the
  token and every private repository read with it.
- **The cache.** It "stores nothing it would not show a stranger"
  (20260906-211255), and a private repository's titles and tags break that:
  either it is not cached at all, or it is cached and dropped on sign-out. The
  README's "Private by construction" says "No account" and needs rewording
  either way.
- **Public repositories with a token, or without?** With it, the budget goes
  from 60 to 5000 requests an hour and the code has one path; without it, a
  public read never involves the reader's account. To decide.

**The UI, to sketch before building:**

- Nothing changes for a reader who never gives a token.
- A 404 from GitHub says "not found, or private" and offers a token right there,
  when it is needed, rather than a sign-in screen up front.
- The token form opens GitHub's token page already filled in, through its
  template URL (`/settings/personal-access-tokens/new?name=...&description=...
  &target_name=<owner>&expires_in=...&contents=read`). The reader only picks
  the repositories, generates, and pastes back. `target_name` naming an
  organisation is reported to create the token under the personal account
  (community discussion 188111), to check.
- The site cannot take the token from GitHub's tab: the page is another origin
  and redirects nowhere once the token is shown. So the paste is made one
  keystroke: the field has the focus when the reader comes back to the tab, and
  pasting is submitting.
- The form reads the repository once before keeping the token, so a wrong one
  is refused at once.
- The header shows that a token is in use, for which account, with a way to
  forget it.

**Other forges.** gitlab.com's `oauth/token` does answer CORS (checked), so a
GitLab source could offer a real "Sign in" through OAuth with PKCE, which needs
no secret. A self-hosted GitLab would need an OAuth application registered on
that instance, so a pasted token is the general answer there too. That rests on
20261011-170750, which also notes that many self-hosted instances send no CORS
headers at all. This task is about GitHub; it only has to keep tokens per host,
so another forge's fits beside it.
