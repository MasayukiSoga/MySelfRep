# -*- coding: utf-8 -*-
"""HTML 生成。テンプレートエンジンは使わず、全ての埋め込み値を html.escape する。"""
import urllib.parse
from html import escape as e

from . import games


def _url(script, **params):
    clean = dict((k, v) for k, v in params.items() if v not in ("", None))
    if not clean:
        return script
    return script + "?" + urllib.parse.urlencode(clean)


def layout(ctx, body, page_title=None):
    title = page_title and ("%s - %s" % (page_title, ctx.config.title)) or ctx.config.title
    notices = "".join(
        '<p class="notice warn">%s</p>' % e(text) for text in ctx.config.warnings
    )
    if ctx.flash:
        notices += '<p class="notice ok">%s</p>' % e(ctx.flash)

    if ctx.logged_in and ctx.config.login_required:
        account = (
            '<form method="post" action="%s" class="inline">'
            '<input type="hidden" name="_csrf" value="%s">'
            '<button class="link" type="submit">ログアウト</button></form>'
            % (_url(ctx.script, a="logout"), e(ctx.csrf))
        )
    else:
        account = ""

    return (
        '<!DOCTYPE html>\n<html lang="ja">\n<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        '<title>%(title)s</title>\n'
        '<link rel="stylesheet" href="static/style.css">\n'
        '</head>\n<body>\n'
        '<header class="bar">\n'
        '<a class="brand" href="%(home)s">%(app)s</a>\n'
        '%(account)s\n'
        '</header>\n'
        '<main>\n%(notices)s%(body)s</main>\n'
        '<footer class="foot">ゲーム情報管理アプリ</footer>\n'
        '</body>\n</html>\n'
    ) % {
        "title": e(title),
        "home": e(ctx.script),
        "app": e(ctx.config.title),
        "account": account,
        "notices": notices,
        "body": body,
    }


def _field(label, name, value, *, kind="text", errors=None, hint="",
           maxlength=None, options=None, datalist=None, rows=None, extra=""):
    errors = errors or {}
    error = errors.get(name, "")
    attrs = ['name="%s"' % name, 'id="f_%s"' % name]
    if maxlength:
        attrs.append('maxlength="%d"' % maxlength)
    if extra:
        attrs.append(extra)

    if options is not None:
        choices = "".join(
            '<option value="%s"%s>%s</option>'
            % (e(opt), " selected" if opt == value else "", e(opt or "（未選択）"))
            for opt in options
        )
        control = "<select %s>%s</select>" % (" ".join(attrs), choices)
    elif rows:
        control = '<textarea %s rows="%d">%s</textarea>' % (
            " ".join(attrs), rows, e(value or "")
        )
    else:
        if datalist:
            attrs.append('list="l_%s"' % name)
        control = '<input type="%s" %s value="%s">' % (
            kind, " ".join(attrs), e(value if value is not None else "")
        )
        if datalist:
            control += '<datalist id="l_%s">%s</datalist>' % (
                name, "".join("<option value=\"%s\">" % e(item) for item in datalist)
            )

    parts = ['<div class="field%s">' % (" has-error" if error else "")]
    parts.append('<label for="f_%s">%s</label>' % (name, e(label)))
    parts.append(control)
    if hint:
        parts.append('<small class="hint">%s</small>' % e(hint))
    if error:
        parts.append('<small class="error">%s</small>' % e(error))
    parts.append("</div>")
    return "".join(parts)


def stars(rating):
    if rating is None:
        return '<span class="muted">—</span>'
    rating = int(rating)
    return '<span class="stars" title="%d / 5">%s%s</span>' % (
        rating, "★" * rating, "☆" * (5 - rating)
    )


def _fmt(value, suffix=""):
    if value is None or value == "":
        return '<span class="muted">—</span>'
    return e(str(value)) + e(suffix)


def list_page(ctx, rows, total, page, pages, criteria, platforms, counts):
    script = ctx.script
    sort_options = "".join(
        '<option value="%s"%s>%s</option>'
        % (key, " selected" if criteria.get("sort") == key else "", e(label))
        for key, (_col, label) in games.SORT_COLUMNS.items()
    )
    status_options = "".join(
        '<option value="%s"%s>%s</option>'
        % (e(opt), " selected" if criteria.get("status") == opt else "", e(opt or "すべて"))
        for opt in [""] + games.STATUS_CHOICES
    )
    platform_options = "".join(
        '<option value="%s"%s>%s</option>'
        % (e(opt), " selected" if criteria.get("platform") == opt else "", e(opt or "すべて"))
        for opt in [""] + platforms
    )
    order = criteria.get("order", "desc")

    search_form = (
        '<form class="search" method="get" action="%s">'
        '<input type="search" name="q" value="%s" placeholder="タイトル・メーカー・タグ・メモを検索">'
        '<select name="platform">%s</select>'
        '<select name="status">%s</select>'
        '<select name="sort">%s</select>'
        '<select name="order">'
        '<option value="desc"%s>降順</option><option value="asc"%s>昇順</option>'
        '</select>'
        '<button type="submit">問合</button>'
        '<a class="btn ghost" href="%s">条件クリア</a>'
        '</form>'
    ) % (
        e(script), e(criteria.get("q", "")), platform_options, status_options, sort_options,
        " selected" if order == "desc" else "", " selected" if order == "asc" else "",
        e(script),
    )

    chips = " ".join(
        '<span class="chip">%s <b>%d</b></span>' % (e(name), counts.get(name, 0))
        for name in ["合計"] + games.STATUS_CHOICES
        if counts.get(name)
    )

    if rows:
        items = []
        for row in rows:
            items.append(
                '<li class="card">'
                '<a class="card-title" href="%(detail)s">%(title)s</a>'
                '<div class="meta">'
                '<span class="tag">%(status)s</span>'
                '<span>%(platform)s</span>'
                '<span>%(rating)s</span>'
                '</div>'
                '<div class="meta sub"><span>発売 %(release)s</span>'
                '<span>プレイ %(hours)s</span><span>%(maker)s</span></div>'
                '<div class="row-actions">'
                '<a class="btn small" href="%(edit)s">修正</a>'
                '<a class="btn small danger" href="%(del)s">削除</a>'
                '</div>'
                '</li>'
                % {
                    "detail": e(_url(script, a="detail", id=row["id"])),
                    "title": e(row["title"]),
                    "status": e(row["status"]),
                    "platform": _fmt(row["platform"]),
                    "rating": stars(row["rating"]),
                    "release": _fmt(row["release_date"]),
                    "hours": _fmt(row["play_hours"], " 時間"),
                    "maker": _fmt(row["maker"]),
                    "edit": e(_url(script, a="edit", id=row["id"])),
                    "del": e(_url(script, a="confirm_delete", id=row["id"])),
                }
            )
        listing = '<ul class="cards">%s</ul>' % "".join(items)
    else:
        listing = (
            '<p class="empty">該当するゲームがありません。'
            '<a href="%s">1 件目を登録する</a></p>' % e(_url(script, a="new"))
        )

    nav = ""
    if pages > 1:
        links = []
        if page > 1:
            links.append(
                '<a class="btn" href="%s">前へ</a>'
                % e(_url(script, page=page - 1, **criteria))
            )
        links.append('<span class="pageinfo">%d / %d ページ</span>' % (page, pages))
        if page < pages:
            links.append(
                '<a class="btn" href="%s">次へ</a>'
                % e(_url(script, page=page + 1, **criteria))
            )
        nav = '<nav class="pager">%s</nav>' % "".join(links)

    return layout(ctx, (
        '<div class="toolbar">'
        '<a class="btn primary" href="%s">＋ 新規登録</a>'
        '<a class="btn ghost" href="%s">CSV 書き出し</a>'
        '</div>'
        '%s%s'
        '<p class="count">%d 件</p>'
        '%s%s'
    ) % (
        e(_url(script, a="new")), e(_url(script, a="csv", **criteria)),
        ('<div class="chips">%s</div>' % chips) if chips else "",
        search_form, total, listing, nav,
    ))


def detail_page(ctx, row):
    script = ctx.script
    rows = [
        ("タイトル", e(row["title"])),
        ("よみ", _fmt(row["title_kana"])),
        ("機種", _fmt(row["platform"])),
        ("ジャンル", _fmt(row["genre"])),
        ("メーカー", _fmt(row["maker"])),
        ("発売日", _fmt(row["release_date"])),
        ("状態", e(row["status"])),
        ("評価", stars(row["rating"])),
        ("プレイ時間", _fmt(row["play_hours"], " 時間")),
        ("所有形態", _fmt(row["own_type"])),
        ("タグ", _fmt(row["tags"])),
        ("メモ", ('<div class="note">%s</div>' % e(row["note"]).replace("\n", "<br>"))
                 if row["note"] else '<span class="muted">—</span>'),
        ("登録日時", _fmt(row["created_at"])),
        ("更新日時", _fmt(row["updated_at"])),
    ]
    body = "".join(
        '<div class="dl-row"><dt>%s</dt><dd>%s</dd></div>' % (e(label), value)
        for label, value in rows
    )
    return layout(ctx, (
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
        '<h1>%s</h1>'
        '<dl class="detail">%s</dl>'
        '<div class="toolbar">'
        '<a class="btn primary" href="%s">修正</a>'
        '<a class="btn danger" href="%s">削除</a>'
        '</div>'
    ) % (
        e(script), e(row["title"]), body,
        e(_url(script, a="edit", id=row["id"])),
        e(_url(script, a="confirm_delete", id=row["id"])),
    ), page_title=row["title"])


def form_page(ctx, values, platforms, errors=None, game_id=None):
    errors = errors or {}
    heading = "ゲームを修正" if game_id else "ゲームを登録"
    hidden = '<input type="hidden" name="id" value="%d">' % game_id if game_id else ""

    fields = "".join([
        _field("タイトル *", "title", values.get("title"), errors=errors,
               maxlength=255, extra='required autofocus'),
        _field("よみ", "title_kana", values.get("title_kana"), errors=errors,
               maxlength=255, hint="並び替え用。ひらがな・カタカナで入力"),
        _field("機種", "platform", values.get("platform"), errors=errors,
               maxlength=64, datalist=platforms, hint="例: Switch / PS5 / PC"),
        _field("ジャンル", "genre", values.get("genre"), errors=errors, maxlength=64),
        _field("メーカー", "maker", values.get("maker"), errors=errors, maxlength=128),
        _field("発売日", "release_date", values.get("release_date"), errors=errors,
               kind="date"),
        _field("状態", "status", values.get("status"), errors=errors,
               options=games.STATUS_CHOICES),
        _field("評価", "rating", values.get("rating"), errors=errors, kind="number",
               extra='min="0" max="5" step="1"', hint="0〜5"),
        _field("プレイ時間", "play_hours", values.get("play_hours"), errors=errors,
               kind="number", extra='min="0" step="0.1"', hint="時間単位"),
        _field("所有形態", "own_type", values.get("own_type"), errors=errors,
               options=[""] + games.OWN_CHOICES),
        _field("タグ", "tags", values.get("tags"), errors=errors, maxlength=255,
               hint="カンマ区切りなど自由"),
        _field("メモ", "note", values.get("note"), errors=errors, rows=5),
    ])

    summary = ""
    if errors:
        summary = '<p class="notice warn">入力内容を確認してください。</p>'

    return layout(ctx, (
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
        '<h1>%s</h1>%s'
        '<form method="post" action="%s" class="edit">'
        '<input type="hidden" name="_csrf" value="%s">%s'
        '%s'
        '<div class="toolbar">'
        '<button class="btn primary" type="submit">保存</button>'
        '<a class="btn ghost" href="%s">キャンセル</a>'
        '</div>'
        '</form>'
    ) % (
        e(ctx.script), e(heading), summary,
        e(_url(ctx.script, a="save")), e(ctx.csrf), hidden, fields, e(ctx.script),
    ), page_title=heading)


def delete_page(ctx, row):
    return layout(ctx, (
        '<h1>削除の確認</h1>'
        '<p class="notice warn">「%s」を削除します。元に戻せません。</p>'
        '<form method="post" action="%s">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<input type="hidden" name="id" value="%d">'
        '<div class="toolbar">'
        '<button class="btn danger" type="submit">削除する</button>'
        '<a class="btn ghost" href="%s">やめる</a>'
        '</div>'
        '</form>'
    ) % (
        e(row["title"]), e(_url(ctx.script, a="delete")), e(ctx.csrf), row["id"],
        e(_url(ctx.script, a="detail", id=row["id"])),
    ), page_title="削除の確認")


def login_page(ctx, error=""):
    return layout(ctx, (
        '<div class="login">'
        '<h1>%s</h1>'
        '%s'
        '<form method="post" action="%s">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<div class="field"><label for="f_password">パスワード</label>'
        '<input type="password" id="f_password" name="password" required autofocus '
        'autocomplete="current-password"></div>'
        '<button class="btn primary wide" type="submit">ログイン</button>'
        '</form>'
        '</div>'
    ) % (
        e(ctx.config.title),
        ('<p class="notice warn">%s</p>' % e(error)) if error else "",
        e(_url(ctx.script, a="login")), e(ctx.csrf),
    ), page_title="ログイン")


def error_page(ctx, heading, message, status_note=""):
    return layout(ctx, (
        '<h1>%s</h1><p class="notice warn">%s</p>%s'
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
    ) % (
        e(heading), e(message),
        ('<pre class="trace">%s</pre>' % e(status_note)) if status_note else "",
        e(ctx.script),
    ), page_title=heading)
