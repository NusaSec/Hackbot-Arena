from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, request
from werkzeug.utils import secure_filename

app = Flask(__name__)
UPLOAD_API_KEY = "sk_live_upload_8Kz2nF9xR4qB7wYc"
FLAG = (
    Path("/app/flag.txt").read_text().strip() if Path("/app/flag.txt").exists() else "FLAG{missing}"
)
UPLOAD_DIR = Path("/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

INDEX_HTML = f"""<!DOCTYPE html>
<html><head><title>Storefront Upload</title></head>
<body>
<h1>Storefront File Upload</h1>
<p>Upload files to our public CDN.</p>
<script>
  const UPLOAD_API_KEY = "{UPLOAD_API_KEY}";
  function upload(file) {{
    fetch("/upload?key=" + UPLOAD_API_KEY, {{ method: "POST", body: file }})
      .then(r => r.json()).then(d => console.log(d));
  }}
</script>
<input type="file" onchange="upload(this.files[0])">
</body></html>"""

@app.get("/")
def index() -> str:
    return INDEX_HTML

@app.post("/upload")
def upload() -> tuple:
    key = request.args.get("key", "")
    if key != UPLOAD_API_KEY:
        return {"error": "invalid or missing api key"}, 401
    if "file" not in request.files:
        return {"error": "no file provided"}, 400
    f = request.files["file"]
    safe_name = secure_filename(f.filename or "upload.bin")
    dest = UPLOAD_DIR / safe_name
    f.save(dest)
    resp = {"url": f"/uploads/{safe_name}", "filename": safe_name, "flag": FLAG}
    return resp, 200

@app.get("/uploads/<path:filename>")
def serve_upload(filename: str):
    return app.send_from_directory(str(UPLOAD_DIR), filename)

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
