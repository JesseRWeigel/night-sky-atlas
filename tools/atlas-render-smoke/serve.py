"""Serve an isolated test copy on loopback only, blocking cross-origin app resources."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

class LocalHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; object-src 'none'")
        super().end_headers()

def serve(directory, ready):
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(LocalHandler, directory=directory)) as httpd:
        # A single atomic write/rename lets the shell safely observe the chosen listener.
        tmp = ready.with_suffix(".tmp")
        tmp.write_text(str(httpd.server_port) + "\n", encoding="ascii")
        tmp.replace(ready)
        httpd.serve_forever()

if __name__ == "__main__":
    serve(sys.argv[1], Path(sys.argv[2]))
