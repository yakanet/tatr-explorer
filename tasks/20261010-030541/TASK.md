# Jump anywhere from a command palette

- STATUS: OPEN
- PRIORITY: 45
- TAGS: ui

The keyboard walks what a view shows (`j`/`k`), searches (`/`), switches views
(`1`-`9`) and branches (`b`), but reaching one task still means finding it in a
list. A palette would take a few letters and offer, as they are typed:

- **tasks** of the repository being read, by id or by title, opening the task;
- **views**, the same as `1`-`9` but by name;
- **repositories already read** and **branches already read**, from the cache;
- **actions**: Refresh, the keyboard help, the homepage.

Everything listed is in memory or in the cache, so the palette costs no request,
and a repository or branch it does not know is left to the homepage field and
the branch menu, which say what reading a new one costs.

To decide: the key. `Ctrl`/`Cmd`+`K` is the convention, but the shortcut layer
leaves every modified key to the browser on purpose, and this would be the first
exception. `:` is vi's command line and needs no modifier, in a keyboard map
that already borrows from vi. Then how titles match: the query language's `~`
is loose (every word, in any order), and the palette should match the same way
rather than invent a second notion of "matches".
