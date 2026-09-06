# RolePlay — solver

**Flag:** `FLAG{nusasec-8a18a0e70f6d3789d34553c54ded15a5}` · **Port:** 8084 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The lab looks like it is about the disabled `role` dropdown on the profile page, but that control is a decoy: the server-side update only ever writes `full_name`, `email`, and `bio`, so re-enabling the field and submitting `role=admin` changes nothing. The decoy itself teaches the right lesson — a disabled input is browser-side presentation, not access control — but the real chain sits elsewhere.

The actual bug is broken access control in `posts.php`. When a post is *edited*, the query correctly checks `AND author_id = ?`; when a post is *viewed*, the query selects by `?id=N` alone with no ownership check at all. That asymmetry is the vulnerability: any logged-in staff member can enumerate `/posts?id=1,2,3,...` and read every other staff member's notes. One of those seeded notes, written by the intern account, is a "legacy credential audit queue" that pastes the MD5 password hashes of all five staff accounts into a post body — so the IDAR turns an internal note into a credential leak.

The final piece is the hash format. Passwords are stored as plain, unsalted MD5. MD5 is fast and unsalted, so common passwords fall to a wordlist attack in seconds: the admin account's hash is present in rockyou, which recovers the admin password and with it the `/admin` page where the flag is displayed. The other four hashes are random passwords and do not crack — the lab is honest about which credential is realistically recoverable.

## The right fix

Every object access needs an authorization check on the server — if the edit path can remember `author_id`, the view path can too. Password hashes are credentials and must never be pasted into application content. And MD5 must go: store passwords with a salted, slow hash designed for them (bcrypt, scrypt, or Argon2), so a leaked hash is not a wordlist lookup away from the original.
