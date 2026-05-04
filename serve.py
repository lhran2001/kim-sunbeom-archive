"""캐시 없는 개발 서버 — http://localhost:3000/"""
import os, sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

# 항상 이 파일이 있는 디렉토리를 루트로 서브
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    port = 3000
    print(f'http://localhost:{port}/', flush=True)
    HTTPServer(('', port), NoCacheHandler).serve_forever()
