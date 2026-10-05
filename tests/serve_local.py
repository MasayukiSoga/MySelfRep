#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ローカルのブラウザでアプリを試すための簡易サーバ。

    python3 serve_local.py            http://localhost:8800/ で起動
    python3 serve_local.py --port 9000
    python3 serve_local.py --reset     データを消してやり直す

MySQL は不要。データは tests/local_data/ の SQLite に入るので、
サーバを止めても次回に残る。アップロード前の操作確認用で、
本番環境では使わない（さくらのサーバでは index.cgi が動く）。
"""
import argparse
import os
import shutil
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TESTS_DIR)

from client import LocalApp, PUBLIC_DIR  # noqa: E402

STATIC_DIR = os.path.join(PUBLIC_DIR, "static")
DATA_DIR = os.path.join(TESTS_DIR, "local_data")
INVITE_CODE = "LOCAL-TEST-INVITE"
SCRIPT_PATH = "/index.cgi"

CONTENT_TYPES = {
    ".css": "text/css; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    app = None
    server_version = "GameAppLocal/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s %s\n" % (self.command, self.path))

    # --- 振り分け ---------------------------------------------------------

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in ("/", ""):
            self.send_response(302)
            self.send_header("Location", SCRIPT_PATH)
            self.end_headers()
            return
        if path.startswith("/static/"):
            self._serve_static(path)
            return
        if path == SCRIPT_PATH:
            self._serve_app("GET", query)
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        path, _, query = self.path.partition("?")
        if path != SCRIPT_PATH:
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8", "replace")
        self._serve_app("POST", query, body)

    # --- 実処理 -----------------------------------------------------------

    def _serve_static(self, path):
        relative = path[len("/static/"):]
        target = os.path.normpath(os.path.join(STATIC_DIR, relative))
        # static/ の外へ出る参照を拒否する（..  で app/ のソースを読まれないように）
        if os.path.commonpath([target, STATIC_DIR]) != STATIC_DIR \
                or not os.path.isfile(target):
            self.send_error(404, "Not Found")
            return
        with open(target, "rb") as handle:
            payload = handle.read()
        extension = os.path.splitext(target)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type",
                         CONTENT_TYPES.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _serve_app(self, method, query, body=""):
        env = {
            "REQUEST_METHOD": method,
            "QUERY_STRING": query,
            "SCRIPT_NAME": SCRIPT_PATH,
            "HTTP_COOKIE": self.headers.get("Cookie", ""),
        }
        if method == "POST":
            env["CONTENT_TYPE"] = self.headers.get(
                "Content-Type", "application/x-www-form-urlencoded")
            env["CONTENT_LENGTH"] = str(len(body.encode("utf-8")))

        response = self.app.invoke(env, body)
        if self.app.last_error_log:
            sys.stderr.write("\n--- アプリ内で例外が発生しました ---\n")
            sys.stderr.write(self.app.last_error_log)
            sys.stderr.write("------------------------------------\n")

        payload = response.text.encode("utf-8")
        self.send_response(response.code or 200)
        for name, value in response.headers.items():
            if name.lower() != "content-length":
                self.send_header(name, value)
        for cookie in response.set_cookies:
            # ローカルは HTTP なので Secure が付くと Cookie を保存できない
            self.send_header("Set-Cookie", cookie.replace("; Secure", ""))
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    parser = argparse.ArgumentParser(description="ローカル確認用サーバ")
    parser.add_argument("--port", type=int, default=8800, help="待ち受けポート")
    parser.add_argument("--reset", action="store_true", help="データを消してやり直す")
    parser.add_argument("--no-browser", action="store_true", help="ブラウザを開かない")
    args = parser.parse_args()

    if args.reset and os.path.isdir(DATA_DIR):
        shutil.rmtree(DATA_DIR)
        print("ローカルデータを削除しました。")
    os.makedirs(DATA_DIR, exist_ok=True)

    # 本番と同じ反復回数にすると体感が重くなるため、ローカルでは軽くする
    app = LocalApp(base_dir=DATA_DIR, invite_code=INVITE_CODE, per_page=20,
                   fast_hash=True, db_name="local.sqlite3")
    Handler.app = app

    url = "http://localhost:%d%s" % (args.port, SCRIPT_PATH)
    users = app.sql("SELECT username, is_admin FROM users ORDER BY id")

    print("")
    print("=" * 56)
    print(" ゲーム情報管理アプリ ローカル確認用サーバ")
    print("=" * 56)
    print(" URL        : %s" % url)
    print(" 招待コード : %s" % INVITE_CODE)
    print(" データ     : %s" % os.path.join(DATA_DIR, "local.sqlite3"))
    if users:
        print(" 登録済み   : %s" % ", ".join(
            "%s%s" % (u["username"], "（管理者）" if u["is_admin"] else "")
            for u in users))
    else:
        print(" 登録済み   : なし（最初に登録した人が管理者になります）")
    print("")
    print(" MySQL は使いません。SQLite なので本番と細かな挙動差があります。")
    print(" 止めるには Ctrl+C。")
    print("=" * 56)
    print("")

    # 同時アクセスを想定しない（os.environ を差し替えるため単一スレッドで動かす）
    httpd = HTTPServer(("127.0.0.1", args.port), Handler)
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n終了しました。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
