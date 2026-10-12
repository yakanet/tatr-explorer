# A refresh shows how far it has read

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: ui

Since 20261011-141340 a refresh keeps the reading on screen, so the loading
steps and their bar, which replace every view, no longer appear. All that is
left is the button saying `Refreshing…`, and a repository of a few hundred
tasks keeps it there for seconds with nothing moving. The header has no room
for a counter beside it.

The Refresh button fills with the accent, from left to right, as the task files
come in, and its title gives the count (`23 / 71 task files read`). Nothing is
added to the header, and the views stay mounted.

Done when a refresh of a GitHub repository fills the button as its files
arrive, and leaves it empty once the reading is on screen.

---

The state counts the files during a refresh too, from none, and only the
phase stays `ready`, since any other phase unmounts the views. The counts go
back to zero once a reading ends, so they describe the reading under way and
nothing else. The button's fill is a background image sized to that share, so
the button keeps its colour under it; it moves only while the button is busy,
so that it empties at once rather than sliding back. Checked on yakanet/tatr-explorer, its raw requests
slowed down: half full at 36 / 71 in both themes, empty once the reading is on
screen.
