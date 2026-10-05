# -*- coding: utf-8 -*-
"""複数人利用の検証。他人のデータに触れないことを重点的に確認する。"""
from client import LocalApp


def test(suite):
    app = LocalApp()
    try:
        _run(suite, app)
    finally:
        app.cleanup()


def _run(suite, app):
    suite.group("最初の登録者が管理者になる")
    admin = app.client()
    res = admin.get()
    suite.check("利用者 0 人なら登録へ案内する",
                res.has("最初に登録したアカウントが管理者"), res.status)
    suite.check("1 人目を登録できる", admin.signup("admin01", "adminpass123", "管理者たろう").code == 302)
    res = admin.get()
    suite.check("管理者として扱われる", res.has("管理者", "利用者管理"), res.status)

    suite.group("招待コードの確認")
    res = app.client().signup("baduser", "password123", "侵入者", invite="WRONG")
    suite.check("誤った招待コードを拒否する",
                res.code == 422 and res.has("招待コードが違います"), res.status)
    res = app.client().signup("baduser", "password123", "侵入者", invite="")
    suite.check("空の招待コードを拒否する", res.code == 422, res.status)
    suite.check("拒否された利用者は作られていない",
                len(app.sql("SELECT id FROM users WHERE username = 'baduser'")) == 0)

    suite.group("一般利用者の登録")
    alice, bob = app.client(), app.client()
    suite.check("2 人目を登録できる", alice.signup("userA", "passwordAAA", "Aさん").code == 302)
    suite.check("2 人目は管理者ではない", alice.get().lacks("利用者管理"))
    suite.check("3 人目を登録できる", bob.signup("userB", "passwordBBB", "Bさん").code == 302)

    suite.group("登録内容の検証")
    cases = [
        ("ログイン名の重複を拒否する", ("userA", "passwordXXX"), "既に使われています"),
        ("短すぎるログイン名を拒否する", ("ab", "passwordXXX"), "3〜32 文字"),
        ("記号入りのログイン名を拒否する", ("bad user!", "passwordXXX"), "半角英数字"),
        ("短いパスワードを拒否する", ("userC", "short"), "8 文字以上"),
    ]
    for label, (username, password), message in cases:
        res = app.client().signup(username, password, "確認")
        suite.check(label, res.has(message), res.plain[:160])
    res = app.client().post("signup", {
        "invite_code": app.invite_code, "username": "userC", "display_name": "不一致",
        "password": "passwordCCC", "password_confirm": "different123"})
    suite.check("確認用パスワードの不一致を拒否する", res.has("一致しません"), res.status)

    suite.group("データが利用者ごとに分かれている")
    alice.add_game("Aさんのゲーム1", platform="Switch", rating="5")
    alice.add_game("Aさんのゲーム2", platform="PS5")
    bob.add_game("Bさんのゲーム1", platform="PC", rating="3")

    res = alice.get()
    suite.check("A は自分の 2 件だけ見える",
                res.cards == 2 and res.lacks("Bさんのゲーム"), res.cards)
    res = bob.get()
    suite.check("B は自分の 1 件だけ見える",
                res.cards == 1 and res.lacks("Aさんのゲーム"), res.cards)
    suite.check("検索しても他人のデータは出ない", alice.get(q="Bさん").cards == 0)
    suite.check("CSV にも他人のデータは出ない", alice.get("csv").lacks("Bさんのゲーム"))
    suite.check("機種一覧にも他人の機種は出ない", bob.get().lacks("Switch"))

    suite.group("他人のデータへの直接アクセスを拒否する")
    # B のデータ（id=3）に A が URL を書き換えて触ろうとする
    suite.check("詳細は 404", alice.get("detail", id=3).code == 404)
    suite.check("修正画面は 404", alice.get("edit", id=3).code == 404)
    suite.check("削除確認は 404", alice.get("confirm_delete", id=3).code == 404)
    suite.check("更新は 404", alice.edit_game(3, "乗っ取り", status="クリア").code == 404)
    suite.check("削除は 404", alice.delete_game(3).code == 404)
    suite.check("データは書き換わっていない",
                app.sql("SELECT title FROM games WHERE id = 3")[0]["title"] == "Bさんのゲーム1")
    suite.check("本人なら閲覧できる", bob.get("detail", id=3).has("Bさんのゲーム1"))

    suite.group("管理者限定の画面を一般利用者は使えない")
    for action in ("users", "user_promote", "user_delete_confirm", "user_password",
                   "user_demote", "user_activate", "user_deactivate", "user_delete"):
        res = alice.get(action, id=2)
        suite.check("%s を拒否する" % action, res.code == 403, res.status)

    suite.group("管理者は全データを扱える")
    res = admin.get()
    suite.check("全 3 件が見える", res.cards == 3, res.cards)
    suite.check("登録者名が出る", res.has("Aさん", "Bさん"))
    suite.check("全員分である旨を示す", res.has("全利用者のデータ"))
    res = admin.get(owner="2")
    suite.check("登録者で絞り込める",
                res.has("Aさんのゲーム1") and res.lacks("Bさんのゲーム1"), res.cards)
    suite.check("他人の詳細を見られる", admin.get("detail", id=3).has("Bさんのゲーム1"))
    suite.check("他人の修正画面に注意書きが出る",
                admin.get("edit", id=3).has("管理者として編集"))
    suite.check("他人のデータを修正できる",
                admin.edit_game(3, "管理者が修正", status="クリア").code == 302)
    suite.check("修正結果が本人側にも見える", bob.get().has("管理者が修正"))
    suite.check("CSV に登録者列が付く", admin.get("csv").has("登録者"))

    suite.group("利用者管理")
    res = admin.get("users")
    suite.check("3 人表示される", res.cards == 3, res.cards)
    suite.check("所有ゲーム数が出る", res.has("登録ゲーム 2 件"))
    suite.check("管理者権限を付与できる", admin.post("user_promote", {"id": "2"}).code == 302)
    suite.check("昇格した人は管理画面に入れる", alice.get("users").code == 200)
    suite.check("管理者権限を外せる", admin.post("user_demote", {"id": "2"}).code == 302)
    suite.check("降格した人は管理画面に入れない", alice.get("users").code == 403)

    suite.group("自分自身を締め出せない")
    suite.check("自分の管理者権限は外せない",
                admin.post("user_demote", {"id": "1"}).code == 403)
    suite.check("自分を利用停止にできない",
                admin.post("user_deactivate", {"id": "1"}).code == 403)
    suite.check("自分を削除できない",
                admin.get("user_delete_confirm", id=1).code == 403)
    suite.check("管理者のままである",
                app.sql("SELECT is_admin FROM users WHERE id = 1")[0]["is_admin"] == 1)

    suite.group("最後の管理者を失わない")
    admin.post("user_promote", {"id": "2"})      # A を管理者にする
    admin.post("user_demote", {"id": "2"})       # 元に戻す
    app.connection.execute("UPDATE users SET is_admin = 0 WHERE id = 1")
    app.connection.execute("UPDATE users SET is_admin = 1 WHERE id = 2")
    app.connection.commit()
    res = alice.post("user_demote", {"id": "3"})  # 管理者でない B の降格は通る
    suite.check("管理者でない人の降格は通る", res.code == 302, res.status)
    app.connection.execute("UPDATE users SET is_admin = 1 WHERE id = 1")
    app.connection.commit()

    suite.group("利用停止")
    suite.check("利用停止にできる", admin.post("user_deactivate", {"id": "3"}).code == 302)
    suite.check("停止中は既存セッションも無効", bob.get().code == 401)
    res = app.client().login("userB", "passwordBBB")
    suite.check("停止中はログインできない", res.has("利用停止中"), res.plain[:120])
    suite.check("停止を解除できる", admin.post("user_activate", {"id": "3"}).code == 302)
    bob = app.client()
    suite.check("解除後はログインできる", bob.login("userB", "passwordBBB").code == 302)

    suite.group("パスワード")
    alice = app.client()
    suite.check("正しいパスワードでログインできる",
                alice.login("userA", "passwordAAA").code == 302)
    res = app.client().login("userA", "wrongpass123")
    suite.check("誤ったパスワードを拒否する", res.has("ログイン名またはパスワードが違います"))
    res = app.client().login("notexist", "whatever123")
    suite.check("存在しない利用者でも同じ文言を返す",
                res.has("ログイン名またはパスワードが違います"))

    other_device = app.client()
    other_device.login("userA", "passwordAAA")
    res = alice.post("account_password", {
        "current_password": "wrong", "password": "newpassAAA1",
        "password_confirm": "newpassAAA1"})
    suite.check("現在のパスワードが違えば変更できない",
                res.has("現在のパスワードが違います"), res.status)
    res = alice.post("account_password", {
        "current_password": "passwordAAA", "password": "newpassAAA1",
        "password_confirm": "newpassAAA1"})
    suite.check("パスワードを変更できる", res.code == 302, res.status)
    suite.check("変更した端末はログイン状態を保つ", alice.get("account").code == 200)
    suite.check("別端末のログインは失効する", other_device.get().code == 401)
    suite.check("新しいパスワードでログインできる",
                app.client().login("userA", "newpassAAA1").code == 302)

    suite.group("管理者によるパスワード再設定")
    bob.login("userB", "passwordBBB")
    res = admin.get("user_password", id=3)
    suite.check("再設定画面を開ける", res.has("管理者として再設定"), res.status)
    res = admin.post("user_password", {"id": "3", "password": "resetBBB123",
                                       "password_confirm": "resetBBB123"})
    suite.check("再設定できる", res.code == 302, res.status)
    suite.check("新しいパスワードでログインできる",
                app.client().login("userB", "resetBBB123").code == 302)
    suite.check("対象者の旧セッションは失効する", bob.get().code == 401)
    suite.check("自分の再設定は確認付きの画面へ誘導する",
                admin.get("user_password", id=1).location.endswith("a=account"))

    suite.group("ログイン試行回数の制限")
    for _ in range(5):
        app.client().login("userB", "badpassword999")
    res = app.client().login("userB", "resetBBB123")
    suite.check("5 回失敗でロックされる", res.has("試行回数が多すぎます"), res.plain[:120])

    suite.group("利用者の削除")
    res = admin.get("user_delete_confirm", id=3)
    suite.check("削除件数を確認できる", res.has("ゲーム情報 1 件"), res.plain[:160])
    res = admin.request("POST", action="user_delete", form={"id": "3"})
    suite.check("CSRF が無ければ削除しない", res.code == 400, res.status)
    suite.check("削除できる", admin.post("user_delete", {"id": "3"}).code == 302)
    suite.check("利用者が消えている",
                len(app.sql("SELECT id FROM users WHERE id = 3")) == 0)
    suite.check("その人のデータも消えている",
                len(app.sql("SELECT id FROM games WHERE user_id = 3")) == 0)
    suite.check("他の人のデータは残っている",
                len(app.sql("SELECT id FROM games WHERE user_id = 2")) == 2)

    suite.group("新規登録の停止")
    app.write_config(allow_signup=False)
    res = app.client().get("signup")
    suite.check("案内を表示する", res.code == 403 and res.has("受け付けていません"), res.status)
    res = app.client().signup("userZ", "passwordZZZ", "後から")
    suite.check("作成できない", res.code != 302, res.status)
    suite.check("利用者は増えていない",
                len(app.sql("SELECT id FROM users WHERE username = 'userZ'")) == 0)
    app.write_config(allow_signup=True)
