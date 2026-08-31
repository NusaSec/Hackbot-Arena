# ExportCmd — solved

**Flag:** `FLAG{nusasec-9273c2bce511f2364fabddbff8fc3484}` · **Port:** 8104 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The export worker needs to write a file, and it does so by building a shell command as a string and running it — with the user-supplied output file name interpolated into the middle of that string. Nothing validates the name: not a character allowlist, not a path check, not a metacharacter screen. Everything the shell treats as syntax — `;`, backticks, `$()` — is honored verbatim, so `outputFileName` is not a file name at all; it is a position in a command line. `x; cat /app/flag.txt` becomes two commands, and the worker runs both.

Two design choices convert the injection from "possible" to "convenient". The job record stores and returns the command's **stdout and stderr** to the caller, so the injected command's output comes straight back in the API response — no exfiltration infrastructure needed. And the worker processes run with just enough filesystem reach to read application files, which is what makes the flag file (and in real deployments, configuration, credentials, and environment material) part of the blast radius. The source finding's remediation list says it exactly: allowlist the filename characters, confine the path, and above all do not build command strings from input.

## The right fix

File names are data, and data must reach the filesystem through APIs that take data: pass the name as an argument list (`subprocess.run(["cp", src, dest])` without `shell=True`, or better, `shutil.copy`) and the entire metacharacter class evaporates — there is no shell to interpret it. When a name must be user-visible, validate it against `[A-Za-z0-9._-]+`, resolve the final path and verify it stays inside the export directory, and generate the on-disk name server-side. Reflecting subprocess output to callers deserves scrutiny too: job logs should carry curated status, not raw stdio, or every future injection becomes self-exfiltrating.
