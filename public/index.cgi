#!/usr/local/bin/python3
# -*- coding: utf-8 -*-
"""ゲーム情報管理アプリの入口（さくらのレンタルサーバ CGI 用）。

このファイルだけが Web から直接実行される。実処理は app パッケージに置き、
.htaccess で *.py を公開対象から外している。

※ 1 行目の shebang はサーバの python3 の実体に合わせて書き換えること。
   SSH で `which python3` を実行したパスをそのまま書く。
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# vendor/ に pip install -t した依存（PyMySQL など）を読めるようにする
for _path in (BASE_DIR, os.path.join(BASE_DIR, "vendor")):
    if os.path.isdir(_path) and _path not in sys.path:
        sys.path.insert(0, _path)


def _emergency(message):
    """app パッケージすら読めない場合の最終手段。"""
    body = (
        "<!DOCTYPE html><html lang=\"ja\"><meta charset=\"UTF-8\">"
        "<title>起動エラー</title>"
        "<h1>アプリを起動できませんでした</h1><pre>%s</pre>" % message
    )
    out = getattr(sys.stdout, "buffer", sys.stdout)
    out.write(b"Status: 500 Internal Server Error\r\n")
    out.write(b"Content-Type: text/html; charset=UTF-8\r\n\r\n")
    out.write(body.encode("utf-8", "replace"))


if __name__ == "__main__":
    try:
        from app.main import run

        run(BASE_DIR)
    except Exception:
        import traceback
        import html

        _emergency(html.escape(traceback.format_exc()))
