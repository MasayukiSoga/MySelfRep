#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""config.ini に貼り付ける password_hash と secret_key を生成する。

SSH でログインして実行する:
    cd ~/www/game && python3 tools/make_password.py
"""
import getpass
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.auth import hash_password  # noqa: E402


def main():
    if len(sys.argv) > 1:
        password = sys.argv[1]
    else:
        password = getpass.getpass("ログインパスワード: ")
        if password != getpass.getpass("確認のため再入力: "):
            print("入力が一致しません。", file=sys.stderr)
            return 1
    if len(password) < 8:
        print("8 文字以上にしてください。", file=sys.stderr)
        return 1

    print("")
    print("config.ini の [app] に以下を貼り付けてください:")
    print("")
    print("secret_key = %s" % secrets.token_hex(32))
    print("password_hash = %s" % hash_password(password))
    print("password =")
    print("")
    print("※ password の行は空のままにしてください（平文は保存しない）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
