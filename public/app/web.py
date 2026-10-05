# -*- coding: utf-8 -*-
"""CGI 用の最小限のリクエスト / レスポンス処理。

Python 3.13 で削除された cgi / cgitb モジュールには依存しない。
ファイルアップロードは使わないので multipart は扱わない。
"""
import os
import sys
import urllib.parse

# 悪意ある巨大 POST でメモリを食い潰さないための上限
MAX_BODY_BYTES = 512 * 1024


class Request(object):
    def __init__(self, env=None, stdin=None):
        self.env = env if env is not None else os.environ
        self.method = (self.env.get("REQUEST_METHOD") or "GET").upper()
        self.query = urllib.parse.parse_qs(
            self.env.get("QUERY_STRING") or "", keep_blank_values=True
        )
        self.form = self._read_form(stdin) if self.method == "POST" else {}
        self.cookies = self._read_cookies()

    def _read_form(self, stdin):
        ctype = (self.env.get("CONTENT_TYPE") or "").split(";")[0].strip().lower()
        if ctype and ctype != "application/x-www-form-urlencoded":
            return {}
        try:
            length = int(self.env.get("CONTENT_LENGTH") or 0)
        except ValueError:
            return {}
        if length <= 0:
            return {}
        stream = stdin if stdin is not None else getattr(sys.stdin, "buffer", sys.stdin)
        raw = stream.read(min(length, MAX_BODY_BYTES))
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", "replace")
        return urllib.parse.parse_qs(raw, keep_blank_values=True)

    def _read_cookies(self):
        """Cookie ヘッダを自前で分解する（SimpleCookie は不正値で例外を出すため）。"""
        jar = {}
        for chunk in (self.env.get("HTTP_COOKIE") or "").split(";"):
            name, sep, value = chunk.strip().partition("=")
            if sep and name:
                jar[name] = urllib.parse.unquote(value)
        return jar

    def get(self, name, default=""):
        """POST を優先してパラメータを 1 つ取り出す。前後の空白は落とす。"""
        for source in (self.form, self.query):
            if name in source and source[name]:
                return source[name][0].strip()
        return default

    def get_int(self, name, default=None):
        try:
            return int(self.get(name, ""))
        except ValueError:
            return default

    @property
    def is_https(self):
        if (self.env.get("HTTPS") or "").lower() in ("on", "1"):
            return True
        # さくらの共用サーバはリバースプロキシ経由で HTTPS 終端する
        return (self.env.get("HTTP_X_FORWARDED_PROTO") or "").lower() == "https"

    @property
    def script_url(self):
        return self.env.get("SCRIPT_NAME") or "/index.cgi"


class Response(object):
    def __init__(self, body="", status="200 OK", content_type="text/html; charset=UTF-8"):
        self.body = body
        self.status = status
        self.headers = [("Content-Type", content_type)]

    def add_header(self, name, value):
        self.headers.append((name, value))

    def set_cookie(self, name, value, max_age=None, secure=False, http_only=True):
        parts = ["%s=%s" % (name, urllib.parse.quote(value, safe=""))]
        parts.append("Path=/")
        parts.append("SameSite=Lax")
        if max_age is not None:
            parts.append("Max-Age=%d" % max_age)
        if http_only:
            parts.append("HttpOnly")
        if secure:
            parts.append("Secure")
        self.add_header("Set-Cookie", "; ".join(parts))

    def send(self):
        out = getattr(sys.stdout, "buffer", sys.stdout)
        lines = ["Status: %s" % self.status]
        lines.extend("%s: %s" % pair for pair in self.headers)
        out.write(("\r\n".join(lines) + "\r\n\r\n").encode("utf-8"))
        body = self.body
        if not isinstance(body, bytes):
            body = body.encode("utf-8", "replace")
        out.write(body)
        out.flush()


def redirect(location):
    res = Response("", status="302 Found")
    res.headers = [("Location", location)]
    return res
