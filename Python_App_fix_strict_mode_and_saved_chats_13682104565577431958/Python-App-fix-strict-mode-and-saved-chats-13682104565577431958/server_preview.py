from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        SimpleHTTPRequestHandler.end_headers(self)

port = 3000
if len(sys.argv) > 1:
    port = int(sys.argv[1])

print(f"Starting server on port {port}...")
httpd = HTTPServer(('0.0.0.0', port), CORSRequestHandler)
httpd.serve_forever()
