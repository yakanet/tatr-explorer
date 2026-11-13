# Read a private repository with the reader's own token

- STATUS: OPEN
- PRIORITY: 60
- TAGS: data,ui

Every repository is read anonymously, so a private one answers 404, as if it
did not exist. Wanted: public repositories stay readable without signing in,
and a reader who wants more gives the site read access to the private
repositories they choose, and to those only.

**"Sign in with GitHub" cannot work without a server**, whether the site
declares an OAuth app or a GitHub App:

- _The web flow_ trades a code for a token at
  `github.com/login/oauth/access_token`, which takes the client secret, PKCE or
  not, and sends no CORS headers.
- _The device flow_ needs no secret, and a GitHub App may enable it, but neither
  `github.com/login/device/code` nor the token endpoint sends CORS headers: they
  answer a real client id, and the browser keeps the answer from the page
  (checked).
- _An installation token_ is signed with the App's private key, which a page
  would hand to every visitor.

GitHub has planned the fix, a "SPA"
client type for GitHub Apps with PKCE, no secret and CORS on `/access_token`
(github/roadmap#1153), but marked it paused in August 2026. If it ships, a real
"Sign in" needs no server, and becomes a second way to obtain the same token.

Until then, the reader creates a _fine-grained personal access token_ and pastes
it. GitHub lets it be limited to chosen repositories and to "Contents:
read-only", which is exactly the access wanted, and `api.github.com` accepts an
`Authorization` header from any origin (checked). A relay holding the client
secret, such as a Cloudflare Worker, is refused: it is the server this site
does not have, and every reader's token would pass through it.

**The token belongs to a repository.** It is kept in IndexedDB, in the same
database as the cache, beside the repository it opens, and is sent only for that
repository. So:

- **Several accounts work at once**, a personal repository beside an
  organisation's, with no notion of a signed-in account.
- **A public repository is still read anonymously**: it has no token, and a
  token is never spent on a read that does not need it.
- **There is no sign-out.** Removing a repository from the homepage forgets its
  token and its tasks in one transaction, so nothing is left half-forgotten.
- **A token is keyed by repository, not by cache entry**, since the cache keeps
  one entry per branch and all of them share the token.
- **Refreshing re-reads the tasks and keeps the token**, and clearing the cache
  of a repository does not forget its token either.
- **A token outlives the tab**, until the repository is removed or the token
  expires. That is acceptable because it can only read the repositories chosen,
  and expires on the date the template URL sets. Where IndexedDB is unavailable
  (private windows), the store falls back to memory, and the token is forgotten
  with the page.

**What else a token changes:**

- **Contents no longer come from the CDN.** `raw.githubusercontent.com` refuses
  a preflight carrying `Authorization` (checked: 403), so a private file is
  read through the API, which is metered. One GraphQL query can return every
  `TASK.md` under `tasks/` at once, which keeps a private repository at about
  one request, like a public listing; to check against GraphQL's size limits.
- **A repository with a token is read from `api.github.com` alone**, with no
  fallback to `ungh.cc`. Today any failure other than a 404 falls back to it
  (`list` in the GitHub source). With a token that would hand the token to a
  third party, and even stripped of it, the request would still tell
  `ungh.cc` that a private repository of that name exists. `ungh.cc` cannot see
  a private repository either, so a 500 from GitHub would come back as a 404
  and send the reader after a token that works. The fallback is not needed
  anyway: a token raises the budget from 60 to 5000 requests an hour, so
  GitHub's failure is shown as it is. `ungh.cc` stays for anonymous reads.
- **The first read still leaks a name.** Before a token is given, the site
  does not know the repository is private: if the anonymous budget is spent,
  the name goes to `ungh.cc`, which answers 404, and the token is offered from
  there. Avoiding it means giving up the fallback for everyone.
- **A Content-Security-Policy restricts where the page may connect.** Any
  script running on the origin can read IndexedDB, and the token has to be sent
  in clear, so storage cannot protect it. A `<meta>` CSP whose `connect-src`
  lists only the origin itself and the hosts the sources read (`api.github.com`,
  `raw.githubusercontent.com`, `ungh.cc`) keeps even an injected script from
  sending it elsewhere. Markdown is already rendered with `html: false`, and the
  site loads no third-party script; the CSP is the one addition. The custom
  domain matters too: a site of its own, rather than a path under
  `github.broutin.dev`, shares its origin, and so its storage, with no other
  page.
- **The cache.** It "stores nothing it would not show a stranger"
  (20260906-211255), and a private repository's titles and tags now break that
  on purpose. That rule, and the README's "Private by construction", which says
  "No account", need rewriting.

**The journey, to sketch before building.** Nothing changes for a reader who
never gives a token. For `owner/private`:

1. **The reader types `owner/private`** on the homepage. The site reads it
   anonymously, as today.
2. **GitHub answers 404**, as for a repository that does not exist. The message
   already says "No repository owner/private on github.com, or it is private";
   beneath it, a token is offered, there and only then, rather than a sign-in
   screen up front. It comes second, since a typo is the likelier cause.
3. **A token already kept for another repository of `owner`** is offered first:
   a fine-grained token is issued for one owner but covers every repository
   ticked for it. If it reads this one, it is kept for it too and the tasks
   show. If it answers 404, the site offers to tick this repository on that
   token on GitHub (a token can be edited and keeps its value), then retry, or
   to create a new one.
4. **"Create a token on GitHub"** opens GitHub's token page in a new tab,
   already filled in through its template URL
   (`/settings/personal-access-tokens/new?name=...&description=...
   &target_name=<owner>&expires_in=...&contents=read`): a name naming the site
   and the repository, a description, the owner, an expiry, and "Contents:
   read-only". The reader picks "Only select repositories", ticks the
   repository (no parameter preselects one), generates, and copies the token,
   which GitHub shows once. To check: that GitHub brings back the filled-in
   page after asking a reader to sign in or confirm their password, and that
   `target_name` naming an organisation does not create the token under the
   personal account, as community discussion 188111 reports.
5. **Back on the site**, the field has the focus when the tab becomes visible
   again, and pasting is submitting. The site cannot take the token from
   GitHub's tab: the page is another origin and redirects nowhere once the
   token is shown, so the paste is made one keystroke.
6. **The site reads the repository with the token before keeping it:**
   - 200: the token is kept with the repository and the tasks show. The header
     shows a padlock and the account the token belongs to (`GET /user`).
   - 401: the token is wrong, expired or revoked; the field empties for another
     paste.
   - 404: the token is valid but does not see this repository. The message
     names its account and links to editing the token on GitHub. If the
     repository is ticked and still answers 404, it does not exist.
   - 403: the token lacks "Contents: read-only".

   Nothing is kept on a failure.
7. **Afterwards**, the repository's card in "Already read" on the homepage shows
   a padlock and opens without asking again; every card gets a way to remove
   the repository, which the list lacks today. "Refresh" re-reads with the same
   token. Once the token expires, it answers 401: the padlock shows the access
   as lost and offers to paste a new token (step 4), and the tasks already
   cached stay readable until then.

A first private repository costs three gestures: create, tick and generate,
paste. A second one of the same owner costs one click when the token already
covers it.

**Other forges.** gitlab.com's `oauth/token` does answer CORS (checked), so a
GitLab source could offer a real "Sign in" through OAuth with PKCE, which needs
no secret. A self-hosted GitLab would need an OAuth application registered on
that instance, so a pasted token is the general answer there too. That rests on
20261011-170750, which also notes that many self-hosted instances send no CORS
headers at all. This task is about GitHub; since a token belongs to a
repository, another forge's fits beside it unchanged.

**Documentation:**

- The token:
  - [Pre-filling a fine-grained token through URL parameters](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#pre-filling-fine-grained-personal-access-token-details-using-url-parameters),
    and the [changelog](https://github.blog/changelog/2025-08-26-template-urls-for-fine-grained-pats-and-updated-permissions-ui/)
    that introduced it
  - [Permissions required for fine-grained tokens](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens),
    to confirm "Contents: read-only" covers every call made
- The REST API with a token:
  - [Authenticating to the REST API](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)
  - [Cross-origin requests](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
  - [Rate limits for authenticated users](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-authenticated-users)
  - [Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user),
    for the account the header shows
  - [Git trees](https://docs.github.com/en/rest/git/trees), the listing already
    used, and [repository content](https://docs.github.com/en/rest/repos/contents#get-repository-content),
    whose raw media type replaces the CDN file by file
- GraphQL, to read every task in one query:
  - [Forming calls with GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)
  - [Rate limits and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- The browser side:
  - [`connect-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src),
    and [CSP in a `<meta>` element](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP),
    since GitHub Pages sets no headers
  - [The `paste` event](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event),
    for submitting on paste
- What would allow a real "Sign in":
  - [github/roadmap#1153](https://github.com/github/roadmap/issues/1153), the
    SPA client type for GitHub Apps
  - [The device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow),
    to retry once its endpoints send CORS headers
