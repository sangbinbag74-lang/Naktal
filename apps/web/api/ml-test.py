"""
최소 테스트 Python function — 의존성 없이 Python runtime 동작만 확인.
Vercel이 Python을 제대로 서빙하는지 격리 테스트.
"""
from http.server import BaseHTTPRequestHandler
import json
import sys


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({
            "status": "alive",
            "python_version": sys.version,
            "path": self.path,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass
