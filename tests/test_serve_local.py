# -*- coding: utf-8 -*-
"""ローカル確認用サーバ（serve_local.py）自体の検証。

ブラウザで触る前に、サーバの振り分けと静的配信の安全性を確認する。
"""
import http.cookiejar
import os
import shutil
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer

import serve_local
from client import LocalApp

PORT = 8899


class _Lenient(urllib.request.HTTPErrorProcessor):
    """3xx は追従し、4xx / 5xx は例外にしない。"""

    def http_response(self, request, response):
        if 300 <= response.status < 400:
            return super().http_response(request, response)
        return response

    https_response = http_response


def test(suite):
    base = tempfile.mkdtemp(prefix="gameapp-serve-")
    app = LocalApp(base_dir=base, invite_code=serve_local.INVITE_CODE,
                   db_name="serve.sqlite3")
    serve_local.Handler.app = app
    httpd = HTTPServer(("127.0.0.1", PORT), serve_local.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        _run(suite)
    finally:
        httpd.shutdown()
        httpd.server_close()
        app.cleanup()
        shutil.rmtree(base, ignore_errors=True)


def _run(suite):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), _Lenient)

    def call(path, data=None):
        body = urllib.parse.urlencode(data).encode() if data else None
        request = urllib.request.Request("http://127.0.0.1:%d%s" % (PORT, path),
                                         data=body)
        with opener.open(request, timeout=5) as response:
            return response.status, response.read().decode("utf-8", "replace"), \
                response.headers

    def csrf():
        return next(c.value for c in jar if c.name == "gcsrf")

    for _ in range(40):  # 起動待ち
        try:
            call("/index.cgi")
            break
        except Exception:
            time.sleep(0.1)

    suite.group("サーバの振り分け")
    status, body, _headers = call("/")
    suite.check("トップから画面が出る", "新規登録" in body or "ログイン" in body, status)
    status, body, headers = call("/static/style.css")
    suite.check("CSS を配信する",
                status == 200 and "--accent" in body, status)
    suite.check("CSS の Content-Type が正しい",
                headers.get("Content-Type", "").startswith("text/css"),
                headers.get("Content-Type"))

    suite.group("static/ の外は配信しない")
    for path in ("/static/../app/main.py", "/static/../config.ini",
                 "/static/../../tests/client.py", "/static/..%2fapp%2fmain.py",
                 "/app/main.py", "/config.ini", "/app/.htaccess"):
        status, body, _headers = call(path)
        suite.check("%s を拒否する" % path, status == 404,
                    "%s / %d バイト返した" % (status, len(body)))

    suite.group("ブラウザからの一連の操作")
    status, body, _headers = call("/index.cgi?a=signup", {
        "invite_code": serve_local.INVITE_CODE, "username": "pcuser",
        "display_name": "PCの私", "password": "localpass123",
        "password_confirm": "localpass123", "_csrf": csrf()})
    suite.check("アカウントを作れる", "＋ 新規登録" in body, status)
    suite.check("Cookie が保存される",
                {"gsess", "gcsrf"} <= {c.name for c in jar},
                sorted(c.name for c in jar))
    suite.check("ローカルは HTTP なので Secure が付かない",
                all(not c.secure for c in jar), [c.name for c in jar if c.secure])

    status, body, _headers = call("/index.cgi?a=save", {
        "title": "ブラウザから登録", "platform": "Switch", "status": "プレイ中",
        "rating": "4", "_csrf": csrf()})
    suite.check("ゲームを登録できる", "ブラウザから登録" in body, status)
    status, body, _headers = call("/index.cgi?q=" + urllib.parse.quote("ブラウザ"))
    suite.check("検索できる", body.count('class="card"') == 1, status)
    status, body, _headers = call("/index.cgi?a=save", {
        "id": "1", "title": "修正後", "status": "クリア", "_csrf": csrf()})
    suite.check("修正できる", "修正後" in body, status)
    status, body, headers = call("/index.cgi?a=csv")
    suite.check("CSV を落とせる",
                body.startswith("﻿") and "attachment" in
                headers.get("Content-Disposition", ""), status)
    status, body, _headers = call("/index.cgi?a=delete",
                                  {"id": "1", "_csrf": csrf()})
    suite.check("削除できる", "該当するゲームがありません" in body, status)
    status, body, _headers = call("/index.cgi?a=logout", {"_csrf": csrf()})
    suite.check("ログアウトできる", "＋ 新規登録" not in body, status)
