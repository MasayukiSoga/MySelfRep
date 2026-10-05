# -*- coding: utf-8 -*-
"""画面ごとの処理。URL は index.cgi?a=... の 1 本に集約している。"""
import csv
import io
import urllib.parse

from . import auth, games, templates
from .web import Response, redirect

FLASH_MESSAGES = {
    "saved": "登録しました。",
    "updated": "修正しました。",
    "deleted": "削除しました。",
    "logged_in": "ログインしました。",
    "logged_out": "ログアウトしました。",
}


class Context(object):
    """1 リクエスト分の共有情報。テンプレートに渡す。"""

    def __init__(self, config, request, response, db=None):
        self.config = config
        self.request = request
        self.response = response
        self.db = db
        self.script = request.script_url
        self.logged_in = auth.is_logged_in(config, request)
        self.csrf = auth.ensure_csrf_token(request, response)
        self.flash = FLASH_MESSAGES.get(request.get("m"), "")


def _criteria(request):
    sort = request.get("sort")
    return {
        "q": request.get("q"),
        "platform": request.get("platform"),
        "status": request.get("status"),
        "sort": sort if sort in games.SORT_COLUMNS else games.DEFAULT_SORT,
        "order": "asc" if request.get("order") == "asc" else "desc",
    }


def _back_to_list(ctx, message=None):
    params = dict((k, v) for k, v in _criteria(ctx.request).items() if v)
    if message:
        params["m"] = message
    url = ctx.script + ("?" + urllib.parse.urlencode(params) if params else "")
    return redirect(url)


def _html(ctx, body, status="200 OK"):
    ctx.response.body = body
    ctx.response.status = status
    return ctx.response


# --- 認証 -----------------------------------------------------------------

def login(ctx):
    if ctx.request.method != "POST":
        return _html(ctx, templates.login_page(ctx))
    if not auth.check_csrf(ctx.request):
        return _html(ctx, templates.login_page(
            ctx, "画面の有効期限が切れました。もう一度お試しください。"))
    if not auth.verify_password(ctx.config, ctx.request.get("password")):
        return _html(ctx, templates.login_page(ctx, "パスワードが違います。"))
    ctx.response.set_cookie(
        auth.SESSION_COOKIE,
        auth.issue_session(ctx.config.secret_key),
        max_age=auth.SESSION_SECONDS,
        secure=ctx.request.is_https,
    )
    res = redirect(ctx.script + "?m=logged_in")
    res.headers.extend(h for h in ctx.response.headers if h[0] == "Set-Cookie")
    return res


def logout(ctx):
    res = redirect(ctx.script + "?m=logged_out")
    res.set_cookie(auth.SESSION_COOKIE, "", max_age=0, secure=ctx.request.is_https)
    return res


# --- 問合（一覧・詳細） ---------------------------------------------------

def index(ctx):
    criteria = _criteria(ctx.request)
    page = ctx.request.get_int("page", 1) or 1
    rows, total, page, pages = games.search(
        ctx.db, criteria, page=page, per_page=ctx.config.per_page
    )
    return _html(ctx, templates.list_page(
        ctx, rows, total, page, pages, criteria,
        games.distinct_platforms(ctx.db), games.summary(ctx.db),
    ))


def detail(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"))
    if not row:
        return _not_found(ctx)
    return _html(ctx, templates.detail_page(ctx, row))


# --- 登録・修正 -----------------------------------------------------------

def new(ctx):
    values = {"status": games.STATUS_CHOICES[0]}
    return _html(ctx, templates.form_page(
        ctx, values, games.distinct_platforms(ctx.db)))


def edit(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"))
    if not row:
        return _not_found(ctx)
    return _html(ctx, templates.form_page(
        ctx, row, games.distinct_platforms(ctx.db), game_id=row["id"]))


def save(ctx):
    if ctx.request.method != "POST":
        return _back_to_list(ctx)
    if not auth.check_csrf(ctx.request):
        return _html(ctx, templates.error_page(
            ctx, "送信を受け付けられません",
            "画面の有効期限が切れたか、不正な送信です。一覧から操作し直してください。"),
            status="400 Bad Request")

    game_id = ctx.request.get_int("id")
    try:
        data = games.parse_form(ctx.request)
    except games.ValidationError as err:
        # 入力値をそのまま画面に戻して、どこが悪いか示す
        values = dict((name, ctx.request.get(name)) for name in games.FIELDS)
        return _html(ctx, templates.form_page(
            ctx, values, games.distinct_platforms(ctx.db),
            errors=err.errors, game_id=game_id), status="422 Unprocessable Entity")

    if game_id:
        if not games.find(ctx.db, game_id):
            return _not_found(ctx)
        games.update(ctx.db, game_id, data)
        return _back_to_list(ctx, "updated")
    games.insert(ctx.db, data)
    return _back_to_list(ctx, "saved")


# --- 削除 -----------------------------------------------------------------

def confirm_delete(ctx):
    row = games.find(ctx.db, ctx.request.get_int("id"))
    if not row:
        return _not_found(ctx)
    return _html(ctx, templates.delete_page(ctx, row))


def delete(ctx):
    if ctx.request.method != "POST" or not auth.check_csrf(ctx.request):
        return _html(ctx, templates.error_page(
            ctx, "送信を受け付けられません",
            "削除は確認画面のボタンから実行してください。"),
            status="400 Bad Request")
    game_id = ctx.request.get_int("id")
    if not game_id or not games.delete(ctx.db, game_id):
        return _not_found(ctx)
    return _back_to_list(ctx, "deleted")


# --- CSV 書き出し ---------------------------------------------------------

CSV_HEADER = [
    ("id", "ID"), ("title", "タイトル"), ("title_kana", "よみ"),
    ("platform", "機種"), ("genre", "ジャンル"), ("maker", "メーカー"),
    ("release_date", "発売日"), ("status", "状態"), ("rating", "評価"),
    ("play_hours", "プレイ時間"), ("own_type", "所有形態"), ("tags", "タグ"),
    ("note", "メモ"), ("created_at", "登録日時"), ("updated_at", "更新日時"),
]


def export_csv(ctx):
    rows = games.all_for_export(ctx.db, _criteria(ctx.request))
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([label for _key, label in CSV_HEADER])
    for row in rows:
        writer.writerow([
            "" if row[key] is None else str(row[key]) for key, _label in CSV_HEADER
        ])
    # Excel で文字化けしないよう UTF-8 BOM を付ける
    body = "﻿" + buffer.getvalue()
    res = Response(body, content_type="text/csv; charset=UTF-8")
    res.add_header("Content-Disposition", 'attachment; filename="games.csv"')
    res.headers.extend(h for h in ctx.response.headers if h[0] == "Set-Cookie")
    return res


def _not_found(ctx):
    return _html(ctx, templates.error_page(
        ctx, "見つかりません", "指定されたゲーム情報は存在しません。"),
        status="404 Not Found")


# a= の値 -> (処理, DB を使うか)
ROUTES = {
    "": (index, True),
    "detail": (detail, True),
    "new": (new, True),
    "edit": (edit, True),
    "save": (save, True),
    "confirm_delete": (confirm_delete, True),
    "delete": (delete, True),
    "csv": (export_csv, True),
    "login": (login, False),
    "logout": (logout, False),
}
