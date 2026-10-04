"""Loopback-only launcher with readiness checks and persistent error logs."""
import argparse
import ctypes
import functools
import http.client
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import traceback
import webbrowser

ROOT = Path(__file__).resolve().parent
HOST, PORT = '127.0.0.1', 8080
URL = f'http://{HOST}:{PORT}/index.html'
LOG_DIR = Path(os.environ.get('LOCALAPPDATA', str(ROOT.parent))) / 'BabyGrowth'
HEALTH_PATH = '/__baby_growth_health__'


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == HEALTH_PATH:
            body = json.dumps({'app': 'baby-growth', 'root': str(ROOT)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


def ready():
    # Direct loopback connection; environment proxies are intentionally irrelevant.
    connection = http.client.HTTPConnection(HOST, PORT, timeout=1)
    try:
        connection.request('GET', HEALTH_PATH)
        response = connection.getresponse()
        if response.status != 200:
            return False
        result = json.loads(response.read())
        return result.get('app') == 'baby-growth' and result.get('root') == str(ROOT)
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def launch(open_browser=True):
    if not ready():
        with socket.socket() as probe:
            if probe.connect_ex((HOST, PORT)) == 0:
                raise RuntimeError('Port 8080 is used by another service. Close that service and try again.')
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        # python.exe is hidden by CREATE_NO_WINDOW and persists after this launcher exits.
        executable = Path(sys.executable).with_name('python.exe')
        with (LOG_DIR / 'server.log').open('ab') as log:
            process = subprocess.Popen(
                [str(executable), '-u', str(Path(__file__).resolve()), '--serve'],
                cwd=str(ROOT), stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), close_fds=True)
        for _ in range(60):
            if ready():
                break
            if process.poll() is not None:
                raise RuntimeError(f'Server exited with code {process.returncode}. See {LOG_DIR / "server.log"}')
            time.sleep(0.2)
        else:
            process.terminate()
            raise RuntimeError(f'Server startup timed out. See {LOG_DIR / "server.log"}')
    if open_browser:
        webbrowser.open(URL)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    try:
        if args.serve:
            server = http.server.ThreadingHTTPServer((HOST, PORT), functools.partial(Handler, directory=str(ROOT)))
            server.serve_forever()
        else:
            launch(not args.no_browser)
    except Exception as error:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        (LOG_DIR / 'launcher-error.log').write_text(traceback.format_exc(), encoding='utf-8')
        if not args.no_browser and not args.serve:
            ctypes.windll.user32.MessageBoxW(0, f'{error}\n\nLog: {LOG_DIR / "launcher-error.log"}', 'Baby Growth - startup failed', 16)
        elif sys.stderr:
            traceback.print_exc()
        sys.exit(1)
