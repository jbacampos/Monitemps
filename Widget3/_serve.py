"""Servidor local APENAS para os testes (nao faz parte do widget).

Serve os arquivos do Widget3 e grava o POST /__result em
_test_result.json. Usado pelo harness do Edge headless.
"""

import http.server
import socketserver
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/__result":
            length = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(length)
            with open(os.path.join(ROOT, "_test_result.json"), "wb") as handle:
                handle.write(data)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("127.0.0.1", 8137), Handler) as httpd:
    httpd.serve_forever()
