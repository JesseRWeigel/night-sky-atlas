"""Synthetic local fixture only; static GET/HEAD and deny app cross-origin resources."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
                         "connect-src 'self'; form-action 'none'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_request(self, code='-', size='-'):
        print(json.dumps(dict(method=self.command, target=self.path, status=code)), flush=True)

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=sys.argv[1])) as server:
        port = Path(sys.argv[2])
        temp = port.with_suffix(".tmp")
        temp.write_text(str(server.server_port))
        temp.replace(port)
        server.serve_forever()
