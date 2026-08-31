# NoteLock — solved

**Flag:** `FLAG{nusasec-2c4ca0d0269e3bce9d222dafe7594112}` · **Port:** 8102 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The lab's API is honest about its state and dishonest about its enforcement. The note listing correctly reports that a system note is not yours to edit — `canEdit: false` — and masks its content. But that flag is a *description*, not a control: the PATCH handler behind it performs no ownership check and no `canEdit` check whatsoever. The UI reads the flag and hides the edit button, which is exactly the failure mode of every "disabled field / hidden button" finding: the client obeys a rule the server never wrote. Any caller that skips the UI — which is every script and every proxy — walks straight past it.

The second half is the leak itself. A careful design would mask the note everywhere it appears; instead the update response echoes the **unmasked previous content** back to the caller. So the bypass doesn't just damage data, it *reads* it: patch the admin's locked note and the response hands you the plaintext you were never shown. The settings endpoint repeats the theme one more time — the API reports `ui_editable: false` for the priority threshold while the write endpoint accepts any caller — proving the pattern is systemic, not a one-off oversight.

## The right fix

Authorization is enforced at the point of mutation, by the server, from session identity — an editability flag in a response is documentation, never a control. Mutating endpoints must verify ownership (or role) of the exact object before writing. Responses should never echo data the caller could not already read: the "previous value" convenience turns a write-bypass into a read primitive. And masked fields must be masked at serialization for every code path, so no response shape — error, echo, audit, or diff — resurrects what the mask hid.
