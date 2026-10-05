#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ローカル検証をまとめて実行する。

    python3 run_tests.py            すべて実行
    python3 run_tests.py preflight  設置前チェックだけ

MySQL は不要。標準ライブラリの sqlite3 でアプリ全体を動かして確認する。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import runner  # noqa: E402
import test_basic  # noqa: E402
import test_multiuser  # noqa: E402
import test_preflight  # noqa: E402
import test_security  # noqa: E402
import test_serve_local  # noqa: E402

SUITES = [
    ("設置前チェック", test_preflight.test),
    ("基本操作", test_basic.test),
    ("複数人利用", test_multiuser.test),
    ("セキュリティと異常系", test_security.test),
    ("ローカル確認用サーバ", test_serve_local.test),
]


def main(argv):
    selected = SUITES
    if len(argv) > 1:
        keys = [arg.lower() for arg in argv[1:]]
        aliases = {
            "preflight": "設置前チェック", "basic": "基本操作",
            "multi": "複数人利用", "security": "セキュリティと異常系", "serve": "ローカル確認用サーバ",
        }
        wanted = set(aliases.get(key, key) for key in keys)
        selected = [pair for pair in SUITES if pair[0] in wanted]
        if not selected:
            print("指定されたテストが見つかりません。使える名前: %s"
                  % ", ".join(aliases))
            return 2

    print("ゲーム情報管理アプリ ローカル検証")
    print("Python %s / MySQL は使いません（sqlite3 で代用）"
          % sys.version.split()[0])
    return runner.run(selected)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
