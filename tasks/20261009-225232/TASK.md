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

Reading it from the page is possible in principle; SSH is a protocol, and it
runs in JavaScript. What stands in the way is everything around it:

- **The transport.** SSH needs a raw TCP connection, which a web page cannot
  open. Web SSH clients go through a relay that turns a WebSocket into TCP — a
  server, which this site does not have and does not want. Chrome's Direct
  Sockets API gives real sockets, but only to Isolated Web Apps: installed,
  signed bundles with a permissions policy in their manifest, not a site served
  from GitHub Pages, and Chrome alone.
- **Authentication.** GitHub refuses anonymous SSH even on public repositories,
  and a private server asks for a key. The page would need the reader's private
  key, against the README's "nothing to hand over".
- **Git on top.** Fetching over SSH means speaking git's own protocol and
  unpacking what it sends. A git client in the browser was measured and refused
  over HTTP already: about 1.5 MB of code to fetch 30 kB of tasks.

So this is a record of why not, more than a plan. What would reopen it is an
Isolated Web App build of the viewer, shipped beside the site — and an answer to
the key question that does not have the reader paste a private key.

Two parsing gaps found on the way, harmless while only GitHub is served: an SSH
alias from `~/.ssh/config` with no dot in its name (`myalias:team/repo`) is not
recognised as a host, and a GitLab subgroup path (`group/sub/project`) is cut to
its first two segments.
