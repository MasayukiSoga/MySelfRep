#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""config.ini に貼り付ける secret_key と invite_code を生成する。

SSH でログインして実行する:
    cd ~/www/game && python3 tools/make_secrets.py

パスワードはブラウザの新規登録画面で各自が設定するため、
このツールでは扱いません。
"""
import secrets
import string


def main():
    alphabet = string.ascii_letters + string.digits
    invite = "-".join(
        "".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)
    )
    print("")
    print("config.ini の [app] に以下を貼り付けてください:")
    print("")
    print("secret_key = %s" % secrets.token_hex(32))
    print("invite_code = %s" % invite)
    print("")
    print("招待コードは、アカウントを作ってほしい相手にだけ伝えてください。")
    print("最初に登録した人が管理者になります。")
    print("全員の登録が済んだら allow_signup = false にすると登録を閉じられます。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
