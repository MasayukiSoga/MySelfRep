# -*- coding: utf-8 -*-
"""アプリ全体の組み立て。index.cgi から run() が呼ばれる。

処理の順序:
  設定読み込み → DB 接続 → テーブル用意 → Cookie から利用者を特定
  → 権限チェック → 各画面の処理
"""
import traceback

from . import auth, db as db_module, templates, users, views
from .config import Config, ConfigError
from .web import Request, Response, redirect


class _SetupConfig(object):
    """設定が読めない時でもレイアウトを描けるようにする最小限の代替。"""
    title = "ゲーム情報管理"
    warnings = []
    allow_signup = False
    per_page = 20


def _bare_context(request, config=None):
    ctx = views.Context.__new__(views.Context)
    ctx.config = config or _SetupConfig()
    ctx.request = request
    ctx.response = Response()
    ctx.db = None
    ctx.user = None
    ctx.script = request.script_url
    ctx.csrf = ""
    ctx.flash = ""
    return ctx


def _setup_page(request, heading, message, detail=""):
    ctx = _bare_context(request)
    return Response(
        templates.error_page(ctx, heading, message, detail),
        status="500 Internal Server Error",
    )


def _current_user(config, request, db):
    """Cookie から利用者を特定する。無効なら None。"""
    token = request.cookies.get(auth.SESSION_COOKIE, "")
    parsed = auth.parse_session(token)
    if not parsed:
        return None
    user = users.find_by_id(db, parsed[0])
    if not user or not auth.verify_session(config.secret_key, token, user):
        return None
    if not int(user.get("is_active") or 0):
        return None
    return user


def run(base_dir):
    request = Request()

    try:
        config = Config(base_dir)
    except ConfigError as err:
        _setup_page(request, "セットアップが未完了です", str(err)).send()
        return

    action = request.get("a")
    route = views.ROUTES.get(action)
    if route is None:
        redirect(request.script_url).send()
        return
    handler, login_required, admin_only = route

    database = None
    try:
        database = db_module.Database(config)
        if config.auto_migrate:
            database.ensure_schema(base_dir)

        user = _current_user(config, request, database)
        ctx = views.Context(config, request, Response(), db=database, user=user)

        if login_required and not user:
            # 利用者が 1 人もいなければ、最初の登録へ案内する
            if users.count_all(database) == 0 and config.allow_signup:
                ctx.response.body = templates.signup_page(ctx, first_user=True)
            else:
                ctx.response.body = templates.login_page(ctx)
            ctx.response.status = "401 Unauthorized"
            ctx.response.send()
            return

        if admin_only and not ctx.is_admin:
            ctx.response.body = templates.error_page(
                ctx, "権限がありません",
                "この画面は管理者のみが利用できます。")
            ctx.response.status = "403 Forbidden"
            ctx.response.send()
            return

        handler(ctx).send()

    except db_module.DriverNotFound as err:
        _setup_page(request, "MySQL ドライバが未導入です", str(err)).send()
    except Exception:
        # 本番で接続情報などを晒さないよう、詳細はサーバログにだけ出す
        import sys
        sys.stderr.write(traceback.format_exc())
        _setup_page(
            request,
            "エラーが発生しました",
            "処理を完了できませんでした。設定とデータベース接続を確認してください。"
            "詳細はサーバのエラーログに記録されています。",
        ).send()
    finally:
        if database is not None:
            database.close()
