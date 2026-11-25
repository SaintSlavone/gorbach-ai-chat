"""Serve the Gorbach widget and a local HTTP demo without dependencies."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
ASSETS = {
    "/": (ROOT / "demo.html", "text/html; charset=utf-8"),
    "/widget/gorbach.js": (ROOT / "public/widget/gorbach.js", "text/javascript; charset=utf-8"),
}
MAX_BODY = 64 * 1024
MAX_TEXT = 800
MAX_HISTORY = 12


class DemoHandler(BaseHTTPRequestHandler):
    def send_bytes(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_bytes(body, "application/json; charset=utf-8", status)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/cbot/status":
            self.send_json({"ok": True, "enabled": True})
        elif path in ASSETS:
            file, content_type = ASSETS[path]
            self.send_bytes(file.read_bytes(), content_type)
        else:
            self.send_json({"ok": False}, 404)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/cbot/msg":
            self.send_json({"ok": False}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= MAX_BODY:
                raise ValueError
            body = json.loads(self.rfile.read(length))
            text = body.get("text") if isinstance(body, dict) else None
            history = body.get("history", []) if isinstance(body, dict) else None
            if not isinstance(text, str) or not 0 < len(text.strip()) <= MAX_TEXT:
                raise ValueError
            if not isinstance(history, list) or len(history) > MAX_HISTORY:
                raise ValueError
            for turn in history:
                if not isinstance(turn, dict) or turn.get("role") not in ("user", "assistant"):
                    raise ValueError
                if not isinstance(turn.get("text"), str):
                    raise ValueError
        except (ValueError, RecursionError):
            self.send_json({"ok": False}, 400)
            return

        reply = (
            "Toto je ukázková odpověď. Jaký druh stínění vás zajímá?" if not history else
            "Děkuji. Živý asistent by v tomto kroku odpověděl podle znalostní báze Gorbach žaluzie."
        )
        self.send_json({"ok": True, "reply": reply})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), DemoHandler) as server:
        print(f"Widget demo: http://{args.host}:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
