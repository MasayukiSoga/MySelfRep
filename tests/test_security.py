# -*- coding: utf-8 -*-
"""XSS・SQL インジェクション・CSRF と、設定不備の案内を確認する。"""
import io
import os
import tempfile

from client import LocalApp

XSS = '<script>alert(1)</script>"><img src=x onerror=alert(2)>'
INJECTIONS = [
    "' OR '1'='1",
    "'; DROP TABLE games; --",
    "1 UNION SELECT password_hash FROM users",
    "%' OR title LIKE '%",
]


def test(suite):
    app = LocalApp()
    try:
        _run(suite, app)
    finally:
        app.cleanup()
    _run_config_cases(suite)


def _run(suite, app):
    user = app.client()
    user.signup("owner", "ownerpass123", "持ち主")

    suite.group("HTML への出力をエスケープしている")
    user.add_game(XSS, note=XSS, tags=XSS, maker=XSS)
    res = user.get()
    suite.check("script タグが生成されない", res.lacks("<script>"))
    suite.check("エスケープされた文字列として出る", res.has("&lt;script&gt;"))
    suite.check("img タグが生成されない", res.lacks("<img"))
    suite.check("引用符による属性の脱出を防ぐ", res.has("&quot;&gt;&lt;img"))
    res = user.get("detail", id=1)
    suite.check("詳細でも script タグが生成されない", res.lacks("<script>"))
    res = user.get("edit", id=1)
    suite.check("入力欄の value でも脱出しない", res.lacks('value="<script>'))
    suite.check("表示名もエスケープされる",
                _display_name_escaped(app))

    suite.group("SQL インジェクションが効かない")
    before = len(app.sql("SELECT id FROM games"))
    for payload in INJECTIONS:
        res = user.get(q=payload)
        suite.check("検索に仕込んでも 200 を返す（%s）" % payload[:24],
                    res.code == 200, res.status)
    suite.check("テーブルが消えていない",
                len(app.sql("SELECT id FROM games")) == before)
    res = user.get(q="' OR '1'='1")
    suite.check("常に真になる条件を注入できない", res.cards == 0, res.cards)
    for field in ("sort", "order", "platform", "status", "owner", "page"):
        res = user.get(**{field: "1; DROP TABLE users; --"})
        suite.check("%s に仕込んでも壊れない" % field, res.code == 200, res.status)
    suite.check("users テーブルが残っていて読める",
                len(app.sql("SELECT id, username FROM users")) >= 1)
    suite.check("パスワードハッシュが画面に漏れていない",
                user.get(q="pbkdf2").cards == 0 and "pbkdf2_sha256" not in user.get().text)

    suite.group("CSRF がないと更新できない")
    for action, form in (("save", {"title": "x"}), ("delete", {"id": "1"}),
                         ("account_name", {"display_name": "x"})):
        res = user.request("POST", action=action, form=form)
        suite.check("%s を拒否する" % action, res.code == 400, res.status)
    res = user.request("POST", action="save", form={"title": "x", "_csrf": "wrong-token"})
    suite.check("偽のトークンを拒否する", res.code == 400, res.status)

    suite.group("想定外のリクエスト")
    suite.check("未知のアクションは一覧へ戻す", user.get("no_such_action").code == 302)
    suite.check("id が数値でなくても落ちない", user.get("detail", id="abc").code == 404)
    suite.check("正しい POST は処理できる", user.post("save", {"title": "正常系"}).code == 302)
    res = user.request("POST", action="save", form={"title": "x", "_csrf": user.csrf},
                       https=False)
    suite.check("HTTP でも動作する（ローカル確認用）", res.code == 302, res.status)
    res = user.get("csv", q="\x00制御文字")
    suite.check("制御文字を含む検索でも落ちない", res.code == 200, res.status)
    suite.check("サーバログに例外が出ていない", not app.last_error_log,
                app.last_error_log[:300])


def _display_name_escaped(app):
    """表示名に仕込んだタグが画面で無効化されるか。"""
    evil = app.client()
    evil.signup("evil01", "evilpass123", XSS)
    res = evil.get()
    return "<script>" not in res.text and "&lt;script&gt;" in res.text


def _config_app(suite, label, body, expect):
    base = tempfile.mkdtemp(prefix="gameapp-cfg-")
    if body is not None:
        with io.open(os.path.join(base, "config.ini"), "w", encoding="utf-8") as fh:
            fh.write(body)
    app = LocalApp(base_dir=base)
    # LocalApp が書いた設定を、検証したい内容で上書きする
    if body is None:
        os.remove(os.path.join(base, "config.ini"))
    else:
        with io.open(os.path.join(base, "config.ini"), "w", encoding="utf-8") as fh:
            fh.write(body)
    res = app.client().get("login")
    suite.check(label, res.has(expect), "%s / %s" % (res.status, res.plain[:160]))
    app.cleanup()


def _run_config_cases(suite):
    suite.group("設定の不備を分かりやすく案内する")
    _config_app(suite, "config.ini が無い場合", None, "セットアップが未完了")
    _config_app(
        suite, "データベース情報が空の場合",
        "[database]\nhost =\nname =\nuser =\n\n[app]\ninvite_code = abcdefghijkl\n",
        "host / name / user")
    _config_app(
        suite, "招待コードが無い場合",
        "[database]\nhost = h\nname = n\nuser = u\npassword = p\n\n"
        "[app]\nallow_signup = true\ninvite_code =\n",
        "invite_code")
    _config_app(
        suite, "招待コードが短い場合は警告する",
        "[database]\nhost = h\nname = n\nuser = u\npassword = p\n\n"
        "[app]\nallow_signup = true\ninvite_code = abc\nsecret_key = %s\n" % ("k" * 64),
        "推測されにくい")
