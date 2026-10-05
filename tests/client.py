# -*- coding: utf-8 -*-
"""CGI アプリをプロセス内で呼び出す検証用クライアント。

LocalApp がデータベースと設定を用意し、client() が 1 つのブラウザに相当する。
Cookie はクライアントごとに保持するので、複数人の同時利用を再現できる。
"""
import io
import os
import re
import shutil
import sys
import tempfile
import urllib.parse

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
if PUBLIC_DIR not in sys.path:
    sys.path.insert(0, PUBLIC_DIR)

import sqlite_backend  # noqa: E402
from app import auth, db as db_module  # noqa: E402

DEFAULT_INVITE = "INVITE-CODE-1234"
SCRIPT_NAME = "/game/index.cgi"


class Response(object):
    def __init__(self, status, headers, set_cookies, text):
        self.status = status
        self.headers = headers
        self.set_cookies = set_cookies
        self.text = text

    @property
    def code(self):
        try:
            return int(self.status.split()[0])
        except (ValueError, IndexError):
            return 0

    @property
    def location(self):
        return self.headers.get("Location", "")

    @property
    def cards(self):
        """一覧に並んだカードの枚数。"""
        return self.text.count('class="card"')

    def has(self, *fragments):
        return all(fragment in self.text for fragment in fragments)

    def lacks(self, *fragments):
        return all(fragment not in self.text for fragment in fragments)

    @property
    def plain(self):
        """タグを落とした本文。失敗時の原因確認用。"""
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", self.text)).strip()


class Client(object):
    """1 つのブラウザ。Cookie を保持する。"""

    def __init__(self, app):
        self.app = app
        self.cookies = {}

    # --- 低レベル ---------------------------------------------------------

    def request(self, method="GET", action=None, query="", form=None, https=True):
        if action is not None:
            query = ("a=%s" % action) + ("&" + query if query else "")
        body = urllib.parse.urlencode(form) if form else ""

        env = {
            "REQUEST_METHOD": method,
            "QUERY_STRING": query,
            "SCRIPT_NAME": SCRIPT_NAME,
            "HTTP_COOKIE": "; ".join("%s=%s" % kv for kv in self.cookies.items()),
        }
        if https:
            env["HTTPS"] = "on"
        if method == "POST":
            env["CONTENT_TYPE"] = "application/x-www-form-urlencoded"
            env["CONTENT_LENGTH"] = str(len(body.encode("utf-8")))

        response = self.app.invoke(env, body)
        for item in response.set_cookies:
            name, _, rest = item.partition("=")
            value = rest.split(";")[0]
            if "Max-Age=0" in item:
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = value
        return response

    def get(self, action=None, query="", **params):
        if params:
            extra = urllib.parse.urlencode(params)
            query = query + "&" + extra if query else extra
        return self.request("GET", action=action, query=query)

    def post(self, action=None, form=None, with_csrf=True, **extra):
        data = dict(form or {}, **extra)
        if with_csrf and "_csrf" not in data:
            data["_csrf"] = self.csrf
        return self.request("POST", action=action, form=data)

    @property
    def csrf(self):
        """CSRF トークンが無ければ、画面を 1 度開いて受け取る。"""
        if "gcsrf" not in self.cookies:
            self.request("GET", action="login")
        return self.cookies.get("gcsrf", "")

    @property
    def logged_in(self):
        return "gsess" in self.cookies

    # --- よく使う操作 -----------------------------------------------------

    def signup(self, username, password, display_name="", invite=DEFAULT_INVITE):
        return self.post("signup", {
            "invite_code": invite, "username": username,
            "display_name": display_name or username,
            "password": password, "password_confirm": password,
        })

    def login(self, username, password):
        return self.post("login", {"username": username, "password": password})

    def logout(self):
        return self.post("logout")

    def add_game(self, title, **fields):
        data = {"title": title, "status": "未プレイ"}
        data.update(fields)
        return self.post("save", data)

    def edit_game(self, game_id, title, **fields):
        data = {"id": str(game_id), "title": title, "status": "未プレイ"}
        data.update(fields)
        return self.post("save", data)

    def delete_game(self, game_id):
        return self.post("delete", {"id": str(game_id)})


class LocalApp(object):
    """SQLite と設定ファイルを用意して、アプリを呼び出せる状態にする。

    fast_hash=True で PBKDF2 の反復回数を下げる。検証を数秒で終わらせるため
    で、本番の設定には影響しない。
    """

    def __init__(self, base_dir=None, invite_code=DEFAULT_INVITE, per_page=3,
                 allow_signup=True, fast_hash=True, db_name="test.db"):
        self._temporary = base_dir is None
        self.base_dir = base_dir or tempfile.mkdtemp(prefix="gameapp-test-")
        self.public_dir = PUBLIC_DIR
        self.invite_code = invite_code

        self.write_config(invite_code=invite_code, per_page=per_page,
                          allow_signup=allow_signup)

        schema = os.path.join(PUBLIC_DIR, "schema.sql")
        shutil.copy(schema, os.path.join(self.base_dir, "schema.sql"))
        self.connection = sqlite_backend.install(
            db_module, os.path.join(self.base_dir, db_name), schema)

        if fast_hash:
            auth.PBKDF2_ROUNDS = 1000

    def write_config(self, **values):
        settings = {
            "invite_code": self.invite_code,
            "per_page": 3,
            "allow_signup": True,
            "secret_key": "s" * 64,
            "title": "ゲーム情報管理",
        }
        settings.update(values)
        text = (
            "[database]\n"
            "host = localhost\nport = 3306\nname = testdb\n"
            "user = tester\npassword = secret\n\n"
            "[app]\n"
            "title = %(title)s\n"
            "secret_key = %(secret_key)s\n"
            "allow_signup = %(allow_signup)s\n"
            "invite_code = %(invite_code)s\n"
            "per_page = %(per_page)s\n"
            "auto_migrate = false\n"
        ) % {
            "title": settings["title"],
            "secret_key": settings["secret_key"],
            "allow_signup": "true" if settings["allow_signup"] else "false",
            "invite_code": settings["invite_code"],
            "per_page": settings["per_page"],
        }
        with io.open(os.path.join(self.base_dir, "config.ini"), "w", encoding="utf-8") as fh:
            fh.write(text)

    def client(self):
        return Client(self)

    def invoke(self, env, body=""):
        """os.environ と標準入出力を差し替えて run() を 1 回呼ぶ。"""
        from app.main import run

        captured = io.BytesIO()

        class _Stdout(object):
            buffer = captured

            def write(self, data):
                captured.write(data.encode("utf-8") if isinstance(data, str) else data)

            def flush(self):
                pass

        class _Stdin(object):
            buffer = io.BytesIO(body.encode("utf-8"))

        real_environ, real_stdin, real_stdout = os.environ, sys.stdin, sys.stdout
        real_stderr = sys.stderr
        error_log = io.StringIO()
        os.environ = env
        sys.stdin, sys.stdout, sys.stderr = _Stdin(), _Stdout(), error_log
        try:
            run(self.base_dir)
        finally:
            os.environ = real_environ
            sys.stdin, sys.stdout, sys.stderr = real_stdin, real_stdout, real_stderr

        self.last_error_log = error_log.getvalue()
        raw = captured.getvalue().decode("utf-8", "replace")
        head, _, text = raw.partition("\r\n\r\n")

        status, headers, cookies = "200 OK", {}, []
        for line in head.split("\r\n"):
            name, _, value = line.partition(": ")
            if name == "Status":
                status = value
            elif name == "Set-Cookie":
                cookies.append(value)
            elif name:
                headers[name] = value
        return Response(status, headers, cookies, text)

    def sql(self, query, params=()):
        return [dict(row) for row in
                self.connection.execute(query, tuple(params)).fetchall()]

    def cleanup(self):
        if self._temporary and os.path.isdir(self.base_dir):
            shutil.rmtree(self.base_dir, ignore_errors=True)
