import json
import os
import threading
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

DIR = os.path.dirname(os.path.abspath(__file__))
THEMES = os.path.join(DIR, 'themes.json')
PORT = 8080

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != '/themes.json':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        try:
            payload = json.loads(self.rfile.read(length))
            with open(THEMES, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
                f.write('\n')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except (json.JSONDecodeError, OSError) as e:
            self.send_error(400, str(e))

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        if args and args[0].startswith('POST'):
            super().log_message(format, *args)

if __name__ == '__main__':
    url = f'http://localhost:{PORT}'
    threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    print(f'{url}')
    HTTPServer(('', PORT), Handler).serve_forever()
