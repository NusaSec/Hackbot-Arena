# StorefrontUpload — solver

**Flag:** `FLAG{nusasec-a2ede63503697d3c3260c3b798794248}` · **Port:** 8097 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The upload API requires a live key — and the landing page contains it, hardcoded into the inline JavaScript that powers the upload widget. Everything shipped to a browser is public: view source, copy the `UPLOAD_API_KEY` constant, and `POST /upload?key=...` accepts you as a legitimate caller. Client-side credential storage is the root failure; the key cannot distinguish friend from foe because every visitor already holds it.

The upload endpoint adds a second, subtler exposure: everything uploaded is stored and re-served publicly at `/uploads/<filename>`. A file store with unauthenticated reads is a broadcast channel — whatever enters it becomes world-readable. That turns careless tradecraft into credential leakage: an operator who embeds the API key (or a flag they recovered) inside an uploaded file has published the secret to anyone with the URL. The safe demonstration keeps the key in the one place the protocol requires it (the query parameter) and uploads only benign content.

## The right fix

Never embed API keys in client code — use short-lived, scoped tokens minted per session by an authenticated endpoint, validated server-side with rotation and revocation. Uploads need per-user authentication, content-type and size validation, virus scanning, and storage outside the web root with unguessable names or signed URLs — never a public directory. A credential accepted by the server should not be readable back from the server's own public files; treating uploaded content as untrusted input applies to its exfiltration potential, not just its parseability.
