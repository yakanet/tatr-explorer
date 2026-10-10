# store.list pairs keys with values across two transactions

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: data

`RepoStore.list` reads `getAllKeys()` and `getAll()` in separate transactions
and then pairs them by index:

    const keys = await transact('readonly', (store) => store.getAllKeys());
    const values = await transact('readonly', (store) => store.getAll());
    if (!keys || !values || keys.length !== values.length) return [];

A write landing between the two (the loader finishing a repository while the
homepage reads the cache) leaves the arrays describing different states. The
length guard catches the easy case and guarantees nothing about the pairing,
while the code depends entirely on the order.

Read both in one transaction, which the API allows: open it once and issue both
requests against the same store. Not observed in the wild, and the point is that
it could not be observed reliably either.

---

Fixed with a cursor rather than with one transaction. The transaction was the
smaller change and it only makes the pairing sound; `openCursor` hands over the
key and the value of a record together, so there is no pairing left to be sound
about. The class of bug leaves with the arrays.

`collect(store)` is the walk, and it holds one rule worth stating: `continue()`
is called from inside the success handler with nothing awaited in between. A
transaction commits as soon as it runs out of work, so an `await` between two
steps hands it exactly that chance and the walk stops halfway with no error.

`transact` now takes a function returning a promise instead of a request, which
is what let the walk be a transaction like any other rather than a second code
path with its own copy of the fallback dance. The three other callers wrap their
request in `request()` at the call site, where it reads as what it is.

The length guard and the timestamp filter are gone as separate ideas: `isStored`
is now one predicate, shared with `read`, and `flatMap` uses it to narrow and
map in one pass. A row from before the wrapper existed is skipped rather than
shown as read at the epoch.

Tested by driving `collect` with a fake object store (the walk is ours, the
cursor is the platform's), and the accumulation test was checked against a walk
that never calls `continue()`: it hangs, which is the honest failure of a cursor
that does not advance. `memoryStore.list` had no test at all and has one now.

No `fake-indexeddb`: the persistent path stays untested here, which is
20260906-232421's subject rather than this one's.
