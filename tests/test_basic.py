# -*- coding: utf-8 -*-
"""基本操作の検証。登録 -> 問合 -> 修正 -> 削除 -> CSV の流れを通す。"""
from client import LocalApp


def test(suite):
    app = LocalApp(per_page=5)
    try:
        _run(suite, app)
    finally:
        app.cleanup()


def _run(suite, app):
    user = app.client()

    suite.group("ログインしていないと使えない")
    res = user.get()
    suite.check("一覧は見せない", res.lacks("＋ 新規登録"), res.plain[:120])
    suite.check("401 を返す", res.code == 401, res.status)
    suite.check("CSRF トークンを発行する", bool(user.csrf))

    suite.group("アカウント作成")
    res = user.signup("owner", "ownerpass123", "持ち主")
    suite.check("登録できる", res.code == 302, res.status)
    suite.check("セッションが張られる", user.logged_in)
    cookie = res.set_cookies[0] if res.set_cookies else ""
    for flag in ("HttpOnly", "SameSite", "Secure"):
        suite.check("Cookie に %s が付く" % flag, flag in cookie, cookie)

    suite.group("ゲームを登録する")
    res = user.get()
    suite.check("0 件のときは案内を出す", res.has("該当するゲームがありません"))
    games = [
        {"title": "ゼルダの伝説", "title_kana": "ぜるだのでんせつ", "platform": "Switch",
         "genre": "アクション", "maker": "任天堂", "release_date": "2023-05-12",
         "status": "クリア", "rating": "5", "play_hours": "72.5",
         "own_type": "パッケージ", "tags": "名作", "note": "とても良い\n2周目予定"},
        {"title": "ファイナルファンタジー", "title_kana": "ふぁいなるふぁんたじー",
         "platform": "PS5", "maker": "スクウェア・エニックス",
         "status": "プレイ中", "rating": "4", "play_hours": "30"},
        {"title": "マインクラフト", "platform": "PC", "status": "未プレイ"},
        {"title": "テトリス 100%", "platform": "Switch", "status": "積み", "rating": "3"},
    ]
    created = sum(1 for game in games if user.post("save", game).code == 302)
    suite.check("4 件すべて登録できる", created == 4, "成功 %d 件" % created)

    res = user.get()
    suite.check("件数サマリを表示する", res.has("合計"))
    suite.check("記号入りのタイトルも壊れない", res.has("テトリス 100%"))

    suite.group("問合（検索・絞り込み）")
    suite.check("キーワードで探せる",
                user.get(q="任天堂").has("ゼルダの伝説") and
                user.get(q="任天堂").lacks("マインクラフト"))
    suite.check("記号を含む検索が効く", user.get(q="100%").cards == 1,
                user.get(q="100%").cards)
    suite.check("状態で絞り込める", user.get(status="積み").cards == 1)
    suite.check("機種で絞り込める", user.get(platform="Switch").cards == 2)
    suite.check("並び替えできる", user.get(sort="rating", order="asc").code == 200)
    suite.check("不正な並び替え値を無害化する",
                user.get(sort="';DROP TABLE games;--").code == 200)
    suite.check("並び替え後もデータが残っている",
                len(app.sql("SELECT id FROM games")) == 4)

    suite.group("ページング")
    for index in range(2):
        user.add_game("ページング確認%d" % index)
    res = user.get()
    suite.check("6 件で 2 ページに分かれる", res.has("1 / 2 ページ"), res.plain[-140:])
    suite.check("1 ページ目は 5 件", res.cards == 5, res.cards)
    suite.check("2 ページ目は 1 件", user.get(page=2).cards == 1)
    suite.check("範囲外のページは最終ページに丸める",
                user.get(page=99).has("2 / 2 ページ"))
    for game_id in (5, 6):
        user.delete_game(game_id)

    suite.group("詳細表示")
    res = user.get("detail", id=1)
    suite.check("登録内容が出る", res.has("ぜるだのでんせつ", "72.5"), res.status)
    suite.check("メモの改行が反映される", res.has("とても良い<br>2周目予定"))
    suite.check("存在しない ID は 404", user.get("detail", id=999).code == 404)

    suite.group("修正")
    res = user.get("edit", id=3)
    suite.check("フォームに現在値が入る", res.has('value="マインクラフト"'), res.status)
    res = user.edit_game(3, "マインクラフト", platform="PC", status="プレイ中", rating="5")
    suite.check("保存できる", res.code == 302, res.status)
    res = user.get("detail", id=3)
    suite.check("修正内容が反映される", res.has("プレイ中", "★★★★★"))

    suite.group("入力エラー")
    res = user.post("save", {"title": "", "rating": "9",
                             "release_date": "2023/01/01", "play_hours": "abc"})
    suite.check("422 を返す", res.code == 422, res.status)
    for message in ("タイトルは必須です", "0〜5 の範囲", "YYYY-MM-DD", "数字で入力"):
        suite.check("「%s」を表示する" % message, res.has(message))
    res = user.post("save", {"title": "A" * 300})
    suite.check("長すぎるタイトルを拒否する", res.code == 422, res.status)

    suite.group("削除")
    res = user.get("confirm_delete", id=4)
    suite.check("確認画面を出す", res.has("元に戻せません"), res.status)
    res = user.request("POST", action="delete", form={"id": "4"})
    suite.check("CSRF が無ければ削除しない", res.code == 400, res.status)
    suite.check("GET では削除しない", user.get("delete", id=4).code == 400)
    suite.check("削除前はまだ残っている",
                len(app.sql("SELECT id FROM games WHERE id = 4")) == 1)
    res = user.delete_game(4)
    suite.check("確認画面からは削除できる", res.code == 302, res.status)
    suite.check("DB からも消えている",
                len(app.sql("SELECT id FROM games WHERE id = 4")) == 0)

    suite.group("CSV 書き出し")
    res = user.get("csv")
    suite.check("CSV で返る", res.headers.get("Content-Type", "").startswith("text/csv"),
                res.headers)
    suite.check("Excel 用に BOM が付く", res.text.startswith("﻿"))
    suite.check("見出しが日本語", "タイトル" in res.text.split("\r\n")[0])
    lines = [line for line in res.text.strip().split("\r\n") if line]
    suite.check("見出し + 3 件", len(lines) == 4, len(lines))
    suite.check("絞り込み結果だけ出す",
                len([l for l in user.get("csv", platform="Switch").text.strip().split("\r\n") if l]) == 2)

    suite.group("ログアウト")
    suite.check("ログアウトできる", user.logout().code == 302)
    suite.check("ログアウト後は一覧を見せない", user.get().lacks("＋ 新規登録"))

    suite.group("セッションの改ざん")
    for token in ("9999999999.ZZZZ", "1.9999999999.ZZZZ", "1.9999999999.", "x.y.z"):
        attacker = app.client()
        attacker.cookies["gsess"] = token
        suite.check("偽のトークンを拒否する（%s）" % token,
                    attacker.get().lacks("＋ 新規登録"))
