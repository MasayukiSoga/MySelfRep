# -*- coding: utf-8 -*-
"""画面ごとの処理。URL は index.cgi?a=... の 1 本に集約している。

権限の考え方:
- ctx.owner_scope が「データの可視範囲」を表す。一般利用者は自分の ID、
  管理者は None（制限なし）。全ての問合・更新系はこの値を SQL に渡すので、
  URL の id を他人のものに書き換えても取得できず 404 になる。
- ROUTES の admin_only=True の画面は管理者以外アクセスできない。
"""
import csv
import io
import urllib.parse

from . import auth, games, templates, users
from .errors import ValidationError
from .web import Response, redirect

FLASH_MESSAGES = {
    "saved": "登録しました。",
    "updated": "修正しました。",
    "deleted": "削除しました。",
    "logged_in": "ログインしました。",
    "logged_out": "ログアウトしました。",
    "signed_up": "アカウントを作成しました。ようこそ。",
    "signed_up_admin": "管理者アカウントを作成しました。ようこそ。",
    "name_saved": "表示名を変更しました。",
    "password_saved": "パスワードを変更しました。",
    "user_updated": "利用者の設定を変更しました。",
    "user_password": "パスワードを再設定しました。",
    "user_deleted": "利用者を削除しました。",
}


class Context(object):
    """1 リクエスト分の共有情報。テンプレートに渡す。"""

    def __init__(self, config, request, response, db=None, user=None):
        self.config = config
        self.request = request
        self.response = response
        self.db = db
        self.user = user
        self.script = request.script_url
        self.csrf = auth.ensure_csrf_token(request, response)
        self.flash = FLASH_MESSAGES.get(request.get("m"), "")

    @property
    def is_admin(self):
        return users.is_admin(self.user)

    @property
    def owner_scope(self):
        """SQL に渡す可視範囲。管理者は None（全件）。"""
        if self.user is None:
            return -1  # 未ログインではどの行にも一致しない
        return None if self.is_admin else int(self.user["id"])


def _criteria(request, is_admin=False):
    sort = request.get("sort")
    criteria = {
        "q": request.get("q"),
        "platform": request.get("platform"),
        "status": request.get("status"),
        "sort": sort if sort in games.SORT_COLUMNS else games.DEFAULT_SORT,
        "order": "asc" if request.get("order") == "asc" else "desc",
    }
    if is_admin:
        owner = request.get_int("owner")
        criteria["owner"] = owner if owner else ""
    return criteria


def _back_to_list(ctx, message=None):
    params = dict((k, v) for k, v in _criteria(ctx.request, ctx.is_admin).items() if v)
    if message:
        params["m"] = message
    url = ctx.script + ("?" + urllib.parse.urlencode(params) if params else "")
    return redirect(url)


def _html(ctx, body, status="200 OK"):
    ctx.response.body = body
    ctx.response.status = status
    return ctx.response


def _reject(ctx, message, status="400 Bad Request"):
    return _html(ctx, templates.error_page(ctx, "送信を受け付けられません", message),
                 status=status)


def _not_found(ctx):
    return _html(ctx, templates.error_page(
        ctx, "見つかりません",
        "指定されたデータは存在しないか、閲覧できる権限がありません。"),
        status="404 Not Found")


def _carry_cookies(ctx, res):
    """リダイレクト応答にも Set-Cookie を引き継ぐ。"""
    res.headers.extend(h for h in ctx.response.headers if h[0] == "Set-Cookie")
    return res


# --- 認証 -----------------------------------------------------------------

def login(ctx):
    if ctx.user:
        return redirect(ctx.script)
    request = ctx.request
    if request.method != "POST":
        return _html(ctx, templates.login_page(ctx))
    if not auth.check_csrf(request):
        return _html(ctx, templates.login_page(
            ctx, "画面の有効期限が切れました。もう一度お試しください。"))

    username = request.get("username")
    user, error = users.login(ctx.db, username, request.get("password"))
    if not user:
        return _html(ctx, templates.login_page(ctx, error, username=username),
                     status="401 Unauthorized")

    ctx.response.set_cookie(
        auth.SESSION_COOKIE,
        auth.issue_session(ctx.config.secret_key, user),
        max_age=auth.SESSION_SECONDS,
        secure=request.is_https,
    )
    return _carry_cookies(ctx, redirect(ctx.script + "?m=logged_in"))


def signup(ctx):
    if ctx.user:
        return redirect(ctx.script)
    config, request = ctx.config, ctx.request
    if not config.allow_signup:
        return _html(ctx, templates.signup_closed_page(ctx), status="403 Forbidden")

    first_user = users.count_all(ctx.db) == 0
    if request.method != "POST":
        return _html(ctx, templates.signup_page(ctx, first_user=first_user))
    if not auth.check_csrf(request):
        return _html(ctx, templates.signup_page(
            ctx, errors={"invite_code": "画面の有効期限が切れました。もう一度お試しください。"},
            first_user=first_user))

    values = dict(
        invite_code=request.get("invite_code"),
        username=request.get("username"),
        display_name=request.get("display_name"),
    )
    try:
        user_id, became_admin = users.signup(
            ctx.db, config, values["invite_code"], values["username"],
            values["display_name"], request.get("password"),
            request.get("password_confirm"),
        )
    except ValidationError as err:
        return _html(ctx, templates.signup_page(
            ctx, values=values, errors=err.errors, first_user=first_user),
            status="422 Unprocessable Entity")

    user = users.find_by_id(ctx.db, user_id)
    users.login(ctx.db, user["username"], request.get("password"))
    ctx.response.set_cookie(
        auth.SESSION_COOKIE,
        auth.issue_session(config.secret_key, user),
        max_age=auth.SESSION_SECONDS,
        secure=request.is_https,
    )
    return _carry_cookies(ctx, redirect(
        ctx.script + ("?m=signed_up_admin" if became_admin else "?m=signed_up")))


def logout(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return redirect(ctx.script)
    res = redirect(ctx.script + "?m=logged_out")
    res.set_cookie(auth.SESSION_COOKIE, "", max_age=0, secure=ctx.request.is_https)
    return res


# --- 問合（一覧・詳細） ---------------------------------------------------

def index(ctx):
    scope = ctx.owner_scope
    criteria = _criteria(ctx.request, ctx.is_admin)
    page = ctx.request.get_int("page", 1) or 1
    rows, total, page, pages = games.search(
        ctx.db, criteria, page=page, per_page=ctx.config.per_page, owner_id=scope
    )
    owners = users.choices_for_filter(ctx.db) if ctx.is_admin else []
    return _html(ctx, templates.list_page(
        ctx, rows, total, page, pages, criteria,
        games.distinct_platforms(ctx.db, scope), games.summary(ctx.db, scope), owners,
    ))


def detail(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"), ctx.owner_scope)
    if not row:
        return _not_found(ctx)
    return _html(ctx, templates.detail_page(ctx, row))


# --- 登録・修正 -----------------------------------------------------------

def new(ctx):
    return _html(ctx, templates.form_page(
        ctx, {"status": games.STATUS_CHOICES[0]},
        games.distinct_platforms(ctx.db, ctx.owner_scope)))


def edit(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"), ctx.owner_scope)
    if not row:
        return _not_found(ctx)
    owner = None
    if ctx.is_admin and int(row["user_id"]) != int(ctx.user["id"]):
        owner = templates._owner_label(row)
    return _html(ctx, templates.form_page(
        ctx, row, games.distinct_platforms(ctx.db, ctx.owner_scope),
        game_id=row["id"], owner=owner))


def save(ctx):
    if ctx.request.method != "POST":
        return _back_to_list(ctx)
    if not auth.check_csrf(ctx.request):
        return _reject(ctx, "画面の有効期限が切れたか、不正な送信です。"
                            "一覧から操作し直してください。")

    game_id = ctx.request.get_int("id")
    try:
        data = games.parse_form(ctx.request)
    except ValidationError as err:
        # 入力値をそのまま画面に戻して、どこが悪いか示す
        values = dict((name, ctx.request.get(name)) for name in games.FIELDS)
        return _html(ctx, templates.form_page(
            ctx, values, games.distinct_platforms(ctx.db, ctx.owner_scope),
            errors=err.errors, game_id=game_id), status="422 Unprocessable Entity")

    if game_id:
        # 所有者の範囲外なら 0 件更新になるので、ここで弾く
        if not games.find(ctx.db, game_id, ctx.owner_scope):
            return _not_found(ctx)
        games.update(ctx.db, game_id, data, ctx.owner_scope)
        return _back_to_list(ctx, "updated")

    games.insert(ctx.db, int(ctx.user["id"]), data)
    return _back_to_list(ctx, "saved")


# --- 削除 -----------------------------------------------------------------

def confirm_delete(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"), ctx.owner_scope)
    if not row:
        return _not_found(ctx)
    return _html(ctx, templates.delete_page(ctx, row))


def delete(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _reject(ctx, "削除は確認画面のボタンから実行してください。")
    game_id = ctx.request.get_int("id")
    if not game_id or not games.delete(ctx.db, game_id, ctx.owner_scope):
        return _not_found(ctx)
    return _back_to_list(ctx, "deleted")


# --- 自分のアカウント -----------------------------------------------------

def account(ctx):
    return _html(ctx, templates.account_page(ctx))


def account_name(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _reject(ctx, "アカウント設定画面から操作してください。")
    display_name = ctx.request.get("display_name")
    errors = {}
    users.validate_display_name(display_name, errors)
    if errors:
        return _html(ctx, templates.account_page(
            ctx, errors=errors, values={"display_name": display_name}),
            status="422 Unprocessable Entity")
    users.set_display_name(ctx.db, ctx.user["id"], display_name)
    return redirect(ctx.script + "?a=account&m=name_saved")


def account_password(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _reject(ctx, "アカウント設定画面から操作してください。")
    request = ctx.request
    errors = {}
    if not auth.verify_password_hash(
        ctx.user["password_hash"], request.get("current_password")
    ):
        errors["current_password"] = "現在のパスワードが違います"
    users.validate_password(
        request.get("password"), request.get("password_confirm"), errors
    )
    if errors:
        return _html(ctx, templates.account_page(ctx, errors=errors),
                     status="422 Unprocessable Entity")

    users.set_password(ctx.db, ctx.user["id"], request.get("password"))
    # パスワードを変えると署名の指紋が変わるため、Cookie を再発行しないと
    # 自分自身もログアウトしてしまう
    updated = users.find_by_id(ctx.db, ctx.user["id"])
    ctx.response.set_cookie(
        auth.SESSION_COOKIE,
        auth.issue_session(ctx.config.secret_key, updated),
        max_age=auth.SESSION_SECONDS,
        secure=request.is_https,
    )
    return _carry_cookies(ctx, redirect(ctx.script + "?a=account&m=password_saved"))


# --- CSV 書き出し ---------------------------------------------------------

CSV_HEADER = [
    ("id", "ID"), ("title", "タイトル"), ("title_kana", "よみ"),
    ("platform", "機種"), ("genre", "ジャンル"), ("maker", "メーカー"),
    ("release_date", "発売日"), ("status", "状態"), ("rating", "評価"),
    ("play_hours", "プレイ時間"), ("own_type", "所有形態"), ("tags", "タグ"),
    ("note", "メモ"), ("created_at", "登録日時"), ("updated_at", "更新日時"),
]


def export_csv(ctx):
    header = list(CSV_HEADER)
    if ctx.is_admin:
        header.append(("owner_username", "登録者"))
    rows = games.all_for_export(
        ctx.db, _criteria(ctx.request, ctx.is_admin), ctx.owner_scope)

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([label for _key, label in header])
    for row in rows:
        writer.writerow([
            "" if row.get(key) is None else str(row.get(key)) for key, _l in header
        ])
    # Excel で文字化けしないよう UTF-8 BOM を付ける
    res = Response("﻿" + buffer.getvalue(), content_type="text/csv; charset=UTF-8")
    res.add_header("Content-Disposition", 'attachment; filename="games.csv"')
    return _carry_cookies(ctx, res)


# --- 利用者管理（管理者のみ） ---------------------------------------------

def user_list(ctx):
    return _html(ctx, templates.users_page(ctx, users.list_all(ctx.db)))


def _target_user(ctx, allow_self=False):
    """操作対象の利用者を取り出す。自分自身は原則対象外。"""
    target = users.find_by_id(ctx.db, ctx.request.get_int("id"))
    if not target:
        return None, _not_found(ctx)
    if not allow_self and int(target["id"]) == int(ctx.user["id"]):
        return None, _reject(
            ctx, "自分自身の権限や利用状態は変更できません。"
                 "誰も管理できない状態になるのを防ぐためです。", status="403 Forbidden")
    return target, None


def _user_flag_change(ctx, apply_change):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _reject(ctx, "利用者管理画面のボタンから操作してください。")
    target, error = _target_user(ctx)
    if error:
        return error
    blocked = apply_change(target)
    if blocked:
        return _reject(ctx, blocked, status="409 Conflict")
    return redirect(ctx.script + "?a=users&m=user_updated")


def user_promote(ctx):
    return _user_flag_change(
        ctx, lambda t: users.set_admin(ctx.db, t["id"], True))


def user_demote(ctx):
    def change(target):
        if users.count_admins(ctx.db, exclude_id=target["id"]) < 1:
            return "管理者が 0 人になるため、この操作はできません。"
        users.set_admin(ctx.db, target["id"], False)
    return _user_flag_change(ctx, change)


def user_activate(ctx):
    return _user_flag_change(
        ctx, lambda t: users.set_active(ctx.db, t["id"], True))


def user_deactivate(ctx):
    def change(target):
        if users.is_admin(target) and \
                users.count_admins(ctx.db, exclude_id=target["id"]) < 1:
            return "管理者が 0 人になるため、この操作はできません。"
        users.set_active(ctx.db, target["id"], False)
    return _user_flag_change(ctx, change)


def user_password(ctx):
    target, error = _target_user(ctx, allow_self=True)
    if error:
        return error
    if int(target["id"]) == int(ctx.user["id"]):
        # 自分の変更は現在のパスワード確認がある account 画面へ誘導する
        return redirect(ctx.script + "?a=account")
    if ctx.request.method != "POST":
        return _html(ctx, templates.user_password_page(ctx, target))
    if not auth.check_csrf(ctx.request):
        return _reject(ctx, "利用者管理画面から操作し直してください。")

    errors = {}
    users.validate_password(
        ctx.request.get("password"), ctx.request.get("password_confirm"), errors)
    if errors:
        return _html(ctx, templates.user_password_page(ctx, target, errors=errors),
                     status="422 Unprocessable Entity")
    users.set_password(ctx.db, target["id"], ctx.request.get("password"))
    return redirect(ctx.script + "?a=users&m=user_password")


def user_delete_confirm(ctx):
    target, error = _target_user(ctx)
    if error:
        return error
    count = ctx.db.query_one(
        "SELECT COUNT(*) AS n FROM games WHERE user_id = %s", (target["id"],))
    return _html(ctx, templates.user_delete_page(
        ctx, target, int(count["n"]) if count else 0))


def user_delete(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _reject(ctx, "削除は確認画面のボタンから実行してください。")
    target, error = _target_user(ctx)
    if error:
        return error
    if users.is_admin(target) and \
            users.count_admins(ctx.db, exclude_id=target["id"]) < 1:
        return _reject(ctx, "管理者が 0 人になるため、この操作はできません。",
                       status="409 Conflict")
    users.delete(ctx.db, target["id"])
    return redirect(ctx.script + "?a=users&m=user_deleted")


# a= の値 -> (処理, ログイン必須か, 管理者限定か)
ROUTES = {
    "": (index, True, False),
    "detail": (detail, True, False),
    "new": (new, True, False),
    "edit": (edit, True, False),
    "save": (save, True, False),
    "confirm_delete": (confirm_delete, True, False),
    "delete": (delete, True, False),
    "csv": (export_csv, True, False),
    "account": (account, True, False),
    "account_name": (account_name, True, False),
    "account_password": (account_password, True, False),
    "login": (login, False, False),
    "signup": (signup, False, False),
    "logout": (logout, False, False),
    "users": (user_list, True, True),
    "user_promote": (user_promote, True, True),
    "user_demote": (user_demote, True, True),
    "user_activate": (user_activate, True, True),
    "user_deactivate": (user_deactivate, True, True),
    "user_password": (user_password, True, True),
    "user_delete_confirm": (user_delete_confirm, True, True),
    "user_delete": (user_delete, True, True),
}
