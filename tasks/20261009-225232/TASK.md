# Read a repository that only SSH can reach

- STATUS: OPEN
- PRIORITY: 20
- TAGS: data

The homepage field reads an SSH remote on any host —
`git@git.mycompany.com:team/repo.git`, an IP address, `ssh://` with a port — but
only github.com is served, and only through GitHub's HTTP APIs. A git server
reachable over SSH alone, or a forge whose API the site does not speak, is
refused with "not supported yet". Today such a repository is read by cloning it
and opening the folder.

This is a record of why not, more than a plan, so the survey is not done twice.

SSH itself runs in JavaScript or WebAssembly; the obstacles are around it.

- **Authentication.** GitHub refuses anonymous SSH even on public repositories,
  and a private server asks for a key. A page doing SSH would need the reader's
  private key, against the README's "nothing to hand over".
- **Git on top.** Fetching over SSH means speaking git's own protocol and
  unpacking what it sends. A git client in the browser was measured and refused
  over HTTP already: about 1.5 MB of code to fetch 30 kB of tasks.
- **The transport**, which settles it. SSH needs a raw TCP connection, and a web
  page never gets one — on purpose, or any site could probe the reader's local
  network or speak SMTP. Every way around it puts something outside the page:
  - _A relay turning a WebSocket into TCP_, as web SSH terminals use: SSH stays
    encrypted end to end, the relay only forwards bytes. Run publicly, it is the
    server this site refuses to have. Borrowed (WebVM uses Tailscale's), it
    adds a third party and an account. Run by the reader — that relay, or a
    small HTTP server fetching over SSH for the page — it costs no server, but
    the reader installs and starts it, and Chrome increasingly asks before a
    public site reaches `localhost` or the local network.
  - _An extension with Native Messaging_: the extension talks to a program
    installed on the machine, which runs `ssh` or `git` with the reader's own
    keys and agent. The cleanest on keys, since none ever reaches the page, and
    the heaviest to ship: an extension and a native program.
  - _Chrome's Direct Sockets API_ gives real TCP, and its documentation names a
    web SSH client as a use, but only to Isolated Web Apps: signed bundles
    installed rather than loaded, served from an `isolated-app://` origin, under
    a strict CSP and cross-origin isolation. They launched on ChromeOS alone, to
    managed devices through enterprise policy, with other platforms to follow;
    where that stands now is not verified. An IWA build would be a second way to
    ship the viewer beside the site, out of most readers' reach.
  - _`chrome.sockets.tcp`_ belongs to Chrome Apps, a platform deprecated in 2020
    and supported on ChromeOS for Enterprise and Education until at least January
    2025. Not an option.

  Self-hosted forges also serve git over HTTPS, but those endpoints send no CORS
  headers by default, so that road needs a proxy and the same git client. Their REST
  APIs are the real way in, which is the forge work of 20260906-211255.

Every option the site could accept asks the reader to install or start
something on their machine — which cloning the repository and opening the folder
already does, with fewer parts, today.

Two parsing gaps found on the way, harmless while only GitHub is served: an SSH
alias from `~/.ssh/config` with no dot in its name (`myalias:team/repo`) is not
recognised as a host, and a GitLab subgroup path (`group/sub/project`) is cut to
its first two segments.

Sources: <https://developer.chrome.com/docs/iwa/direct-sockets>,
<https://developer.chrome.com/docs/iwa/introduction>,
<https://developer.chrome.com/docs/apps/reference/sockets/tcp>.
