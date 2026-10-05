# -*- coding: utf-8 -*-
"""アプリ全体の組み立て。index.cgi から run() が呼ばれる。"""
import traceback

from . import auth, db as db_module, templates, views
from .config import Config, ConfigError
from .web import Request, Response, redirect


class _SetupConfig(object):
    """設定が読めない時でもレイアウトを描けるようにする最小限の代替。"""
    title = "ゲーム情報管理"
    login_required = True
    warnings = []
    per_page = 20


def _setup_page(request, heading, message, detail=""):
    ctx = views.Context.__new__(views.Context)
    ctx.config = _SetupConfig()
    ctx.request = request
    ctx.response = Response()
    ctx.db = None
    ctx.script = request.script_url
    ctx.logged_in = False
    ctx.csrf = ""
    ctx.flash = ""
    res = Response(
        templates.error_page(ctx, heading, message, detail),
        status="500 Internal Server Error",
    )
    return res


def run(base_dir):
    request = Request()

    try:
        config = Config(base_dir)
    except ConfigError as err:
        _setup_page(request, "セットアップが未完了です", str(err)).send()
        return

    response = Response()
    ctx = views.Context(config, request, response, db=None)

    action = request.get("a")
    route = views.ROUTES.get(action)
    if route is None:
        redirect(ctx.script).send()
        return
    handler, needs_db = route

    # 未ログインならログイン画面へ寄せる（ログイン処理自体は通す）
    if not ctx.logged_in and action not in ("login", "logout"):
        ctx.response.body = templates.login_page(ctx)
        ctx.response.send()
        return

    database = None
    try:
        if needs_db:
            database = db_module.Database(config)
            if config.auto_migrate:
                database.ensure_schema(base_dir)
            ctx.db = database
        handler(ctx).send()
    except db_module.DriverNotFound as err:
        _setup_page(request, "MySQL ドライバが未導入です", str(err)).send()
    except Exception:
        # 本番で接続情報などを晒さないよう、詳細はサーバログにだけ出す
        detail = traceback.format_exc()
        import sys
        sys.stderr.write(detail)
        _setup_page(
            request,
            "エラーが発生しました",
            "処理を完了できませんでした。設定とデータベース接続を確認してください。"
            "詳細はサーバのエラーログに記録されています。",
        ).send()
    finally:
        if database is not None:
            database.close()
