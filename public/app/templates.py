# -*- coding: utf-8 -*-
"""HTML 生成。テンプレートエンジンは使わず、全ての埋め込み値を html.escape する。"""
import urllib.parse
from html import escape as e

from . import games, users


def _url(script, **params):
    clean = dict((k, v) for k, v in params.items() if v not in ("", None))
    if not clean:
        return script
    return script + "?" + urllib.parse.urlencode(clean)


# --- 共通レイアウト -------------------------------------------------------

def layout(ctx, body, page_title=None):
    title = page_title and ("%s - %s" % (page_title, ctx.config.title)) or ctx.config.title
    notices = "".join(
        '<p class="notice warn">%s</p>' % e(text) for text in ctx.config.warnings
    )
    if ctx.flash:
        notices += '<p class="notice ok">%s</p>' % e(ctx.flash)

    if ctx.user:
        menu = ['<a href="%s">%s</a>' % (e(_url(ctx.script, a="account")),
                                         e(users.label_of(ctx.user)))]
        if ctx.is_admin:
            menu.append('<a href="%s">利用者管理</a>' % e(_url(ctx.script, a="users")))
        menu.append(
            '<form method="post" action="%s" class="inline">'
            '<input type="hidden" name="_csrf" value="%s">'
            '<button class="link" type="submit">ログアウト</button></form>'
            % (_url(ctx.script, a="logout"), e(ctx.csrf))
        )
        account = '<nav class="account">%s</nav>' % "".join(menu)
    else:
        account = ""

    badge = '<span class="badge">管理者</span>' if ctx.is_admin else ""

    return (
        '<!DOCTYPE html>\n<html lang="ja">\n<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        '<title>%(title)s</title>\n'
        '<link rel="stylesheet" href="static/style.css">\n'
        '</head>\n<body>\n'
        '<header class="bar">\n'
        '<a class="brand" href="%(home)s">%(app)s</a>%(badge)s\n'
        '%(account)s\n'
        '</header>\n'
        '<main>\n%(notices)s%(body)s</main>\n'
        '<footer class="foot">ゲーム情報管理アプリ</footer>\n'
        '</body>\n</html>\n'
    ) % {
        "title": e(title),
        "home": e(ctx.script),
        "app": e(ctx.config.title),
        "badge": badge,
        "account": account,
        "notices": notices,
        "body": body,
    }


def _field(label, name, value, *, kind="text", errors=None, hint="",
           maxlength=None, options=None, datalist=None, rows=None, extra=""):
    errors = errors or {}
    error = errors.get(name, "") or errors.get(name + "_confirm", "")
    attrs = ['name="%s"' % name, 'id="f_%s"' % name]
    if maxlength:
        attrs.append('maxlength="%d"' % maxlength)
    if extra:
        attrs.append(extra)

    if options is not None:
        choices = "".join(
            '<option value="%s"%s>%s</option>'
            % (e(str(val)), " selected" if str(val) == str(value or "") else "", e(text))
            for val, text in options
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
            kind, " ".join(attrs), e("" if value is None else str(value))
        )
        if datalist:
            control += '<datalist id="l_%s">%s</datalist>' % (
                name, "".join('<option value="%s">' % e(item) for item in datalist)
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


def _plain_options(values, blank_label=None):
    """文字列の選択肢を (値, 表示) の組に変換する。"""
    options = []
    if blank_label is not None:
        options.append(("", blank_label))
    options.extend((v, v) for v in values)
    return options


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


def _owner_label(row):
    return row.get("owner_display") or row.get("owner_username") or "（削除済み）"


# --- 一覧 -----------------------------------------------------------------

def list_page(ctx, rows, total, page, pages, criteria, platforms, counts, owners):
    script = ctx.script
    selects = [
        ("platform", _plain_options(platforms, "すべての機種")),
        ("status", _plain_options(games.STATUS_CHOICES, "すべての状態")),
        ("sort", [(key, label) for key, (_c, label) in games.SORT_COLUMNS.items()]),
        ("order", [("desc", "降順"), ("asc", "昇順")]),
    ]
    if ctx.is_admin:
        selects.insert(0, ("owner", [("", "すべての登録者")] + list(owners)))

    def select_html(name, options):
        current = str(criteria.get(name) or "")
        return '<select name="%s">%s</select>' % (name, "".join(
            '<option value="%s"%s>%s</option>'
            % (e(str(val)), " selected" if str(val) == current else "", e(text))
            for val, text in options
        ))

    search_form = (
        '<form class="search" method="get" action="%s">'
        '<input type="search" name="q" value="%s" placeholder="タイトル・メーカー・タグ・メモを検索">'
        '%s'
        '<button type="submit">問合</button>'
        '<a class="btn ghost" href="%s">条件クリア</a>'
        '</form>'
    ) % (
        e(script), e(criteria.get("q", "")),
        "".join(select_html(name, opts) for name, opts in selects),
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
            owner = ('<span class="owner">%s</span>' % e(_owner_label(row))) \
                if ctx.is_admin else ""
            items.append(
                '<li class="card">'
                '<a class="card-title" href="%(detail)s">%(title)s</a>'
                '<div class="meta">'
                '<span class="tag">%(status)s</span>'
                '<span>%(platform)s</span>'
                '<span>%(rating)s</span>'
                '%(owner)s'
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
                    "owner": owner,
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
            links.append('<a class="btn" href="%s">前へ</a>'
                         % e(_url(script, page=page - 1, **criteria)))
        links.append('<span class="pageinfo">%d / %d ページ</span>' % (page, pages))
        if page < pages:
            links.append('<a class="btn" href="%s">次へ</a>'
                         % e(_url(script, page=page + 1, **criteria)))
        nav = '<nav class="pager">%s</nav>' % "".join(links)

    scope = ""
    if ctx.is_admin:
        scope = ('<p class="scope">管理者として全利用者のデータを表示しています。</p>')

    return layout(ctx, (
        '<div class="toolbar">'
        '<a class="btn primary" href="%s">＋ 新規登録</a>'
        '<a class="btn ghost" href="%s">CSV 書き出し</a>'
        '</div>'
        '%s%s%s'
        '<p class="count">%d 件</p>'
        '%s%s'
    ) % (
        e(_url(script, a="new")), e(_url(script, a="csv", **criteria)),
        scope, ('<div class="chips">%s</div>' % chips) if chips else "",
        search_form, total, listing, nav,
    ))


# --- 詳細 -----------------------------------------------------------------

def detail_page(ctx, row):
    script = ctx.script
    items = [
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
    ]
    if ctx.is_admin:
        items.append(("登録者", e(_owner_label(row))))
    items.extend([
        ("登録日時", _fmt(row["created_at"])),
        ("更新日時", _fmt(row["updated_at"])),
    ])
    body = "".join(
        '<div class="dl-row"><dt>%s</dt><dd>%s</dd></div>' % (e(label), value)
        for label, value in items
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


# --- 登録・修正フォーム ---------------------------------------------------

def form_page(ctx, values, platforms, errors=None, game_id=None, owner=None):
    errors = errors or {}
    heading = "ゲームを修正" if game_id else "ゲームを登録"
    hidden = '<input type="hidden" name="id" value="%d">' % game_id if game_id else ""

    fields = "".join([
        _field("タイトル *", "title", values.get("title"), errors=errors,
               maxlength=255, extra="required autofocus"),
        _field("よみ", "title_kana", values.get("title_kana"), errors=errors,
               maxlength=255, hint="並び替え用。ひらがな・カタカナで入力"),
        _field("機種", "platform", values.get("platform"), errors=errors,
               maxlength=64, datalist=platforms, hint="例: Switch / PS5 / PC"),
        _field("ジャンル", "genre", values.get("genre"), errors=errors, maxlength=64),
        _field("メーカー", "maker", values.get("maker"), errors=errors, maxlength=128),
        _field("発売日", "release_date", values.get("release_date"), errors=errors,
               kind="date"),
        _field("状態", "status", values.get("status"), errors=errors,
               options=_plain_options(games.STATUS_CHOICES)),
        _field("評価", "rating", values.get("rating"), errors=errors, kind="number",
               extra='min="0" max="5" step="1"', hint="0〜5"),
        _field("プレイ時間", "play_hours", values.get("play_hours"), errors=errors,
               kind="number", extra='min="0" step="0.1"', hint="時間単位"),
        _field("所有形態", "own_type", values.get("own_type"), errors=errors,
               options=_plain_options(games.OWN_CHOICES, "（未選択）")),
        _field("タグ", "tags", values.get("tags"), errors=errors, maxlength=255,
               hint="カンマ区切りなど自由"),
        _field("メモ", "note", values.get("note"), errors=errors, rows=5),
    ])

    banner = '<p class="notice warn">入力内容を確認してください。</p>' if errors else ""
    if owner:
        banner += ('<p class="notice info">%s さんのデータを管理者として編集しています。</p>'
                   % e(owner))

    return layout(ctx, (
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
        '<h1>%s</h1>%s'
        '<form method="post" action="%s" class="edit">'
        '<input type="hidden" name="_csrf" value="%s">%s%s'
        '<div class="toolbar">'
        '<button class="btn primary" type="submit">保存</button>'
        '<a class="btn ghost" href="%s">キャンセル</a>'
        '</div>'
        '</form>'
    ) % (
        e(ctx.script), e(heading), banner,
        e(_url(ctx.script, a="save")), e(ctx.csrf), hidden, fields, e(ctx.script),
    ), page_title=heading)


def delete_page(ctx, row):
    owner = ""
    if ctx.is_admin:
        owner = '<p class="notice info">登録者: %s</p>' % e(_owner_label(row))
    return layout(ctx, (
        '<h1>削除の確認</h1>'
        '<p class="notice warn">「%s」を削除します。元に戻せません。</p>%s'
        '<form method="post" action="%s">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<input type="hidden" name="id" value="%d">'
        '<div class="toolbar">'
        '<button class="btn danger" type="submit">削除する</button>'
        '<a class="btn ghost" href="%s">やめる</a>'
        '</div>'
        '</form>'
    ) % (
        e(row["title"]), owner, e(_url(ctx.script, a="delete")), e(ctx.csrf), row["id"],
        e(_url(ctx.script, a="detail", id=row["id"])),
    ), page_title="削除の確認")


# --- ログイン・新規登録 ---------------------------------------------------

def login_page(ctx, error="", username=""):
    signup_link = ""
    if ctx.config.allow_signup:
        signup_link = (
            '<p class="alt">アカウントをお持ちでない方は '
            '<a href="%s">招待コードで新規登録</a></p>'
            % e(_url(ctx.script, a="signup"))
        )
    return layout(ctx, (
        '<div class="panel narrow">'
        '<h1>ログイン</h1>%s'
        '<form method="post" action="%s">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<div class="field"><label for="f_username">ログイン名</label>'
        '<input type="text" id="f_username" name="username" value="%s" required '
        'autofocus autocapitalize="none" autocomplete="username"></div>'
        '<div class="field"><label for="f_password">パスワード</label>'
        '<input type="password" id="f_password" name="password" required '
        'autocomplete="current-password"></div>'
        '<button class="btn primary wide" type="submit">ログイン</button>'
        '</form>%s'
        '</div>'
    ) % (
        ('<p class="notice warn">%s</p>' % e(error)) if error else "",
        e(_url(ctx.script, a="login")), e(ctx.csrf), e(username), signup_link,
    ), page_title="ログイン")


def signup_page(ctx, values=None, errors=None, first_user=False):
    values = values or {}
    errors = errors or {}
    intro = (
        '<p class="notice info">最初に登録したアカウントが管理者になります。</p>'
        if first_user else
        '<p class="alt">管理者から受け取った招待コードを入力してください。</p>'
    )
    fields = "".join([
        _field("招待コード *", "invite_code", values.get("invite_code"),
               errors=errors, extra="required"),
        _field("ログイン名 *", "username", values.get("username"), errors=errors,
               maxlength=32, extra='required autocapitalize="none"',
               hint="半角英数字・ハイフン・アンダースコアの 3〜32 文字"),
        _field("表示名", "display_name", values.get("display_name"), errors=errors,
               maxlength=64, hint="画面に表示される名前。日本語も使えます"),
        _field("パスワード *", "password", "", errors=errors, kind="password",
               extra='required autocomplete="new-password"',
               hint="%d 文字以上" % users.MIN_PASSWORD_LENGTH),
        _field("パスワード（確認）*", "password_confirm", "", errors=errors,
               kind="password", extra='required autocomplete="new-password"'),
    ])
    return layout(ctx, (
        '<div class="panel narrow">'
        '<h1>新規登録</h1>%s'
        '<form method="post" action="%s" class="stack">'
        '<input type="hidden" name="_csrf" value="%s">%s'
        '<button class="btn primary wide" type="submit">登録する</button>'
        '</form>'
        '<p class="alt"><a href="%s">ログイン画面へ戻る</a></p>'
        '</div>'
    ) % (
        intro, e(_url(ctx.script, a="signup")), e(ctx.csrf), fields,
        e(_url(ctx.script, a="login")),
    ), page_title="新規登録")


def signup_closed_page(ctx):
    return layout(ctx, (
        '<div class="panel narrow">'
        '<h1>新規登録</h1>'
        '<p class="notice warn">現在、新規登録は受け付けていません。'
        '管理者にお問い合わせください。</p>'
        '<p class="alt"><a href="%s">ログイン画面へ戻る</a></p>'
        '</div>'
    ) % e(_url(ctx.script, a="login")), page_title="新規登録")


# --- 自分のアカウント設定 -------------------------------------------------

def account_page(ctx, errors=None, values=None):
    errors = errors or {}
    values = values or {}
    return layout(ctx, (
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
        '<h1>アカウント設定</h1>'
        '<dl class="detail">'
        '<div class="dl-row"><dt>ログイン名</dt><dd>%s</dd></div>'
        '<div class="dl-row"><dt>権限</dt><dd>%s</dd></div>'
        '<div class="dl-row"><dt>登録日時</dt><dd>%s</dd></div>'
        '</dl>'

        '<div class="panel">'
        '<h2>表示名を変更</h2>'
        '<form method="post" action="%s" class="stack">'
        '<input type="hidden" name="_csrf" value="%s">%s'
        '<button class="btn primary" type="submit">表示名を保存</button>'
        '</form>'
        '</div>'

        '<div class="panel">'
        '<h2>パスワードを変更</h2>'
        '<p class="alt">変更すると、他の端末のログイン状態は解除されます。</p>'
        '<form method="post" action="%s" class="stack">'
        '<input type="hidden" name="_csrf" value="%s">%s'
        '<button class="btn primary" type="submit">パスワードを保存</button>'
        '</form>'
        '</div>'
    ) % (
        e(ctx.script),
        e(ctx.user["username"]),
        "管理者" if ctx.is_admin else "一般利用者",
        _fmt(ctx.user.get("created_at")),

        e(_url(ctx.script, a="account_name")), e(ctx.csrf),
        _field("表示名", "display_name",
               values.get("display_name", ctx.user.get("display_name")),
               errors=errors, maxlength=64),

        e(_url(ctx.script, a="account_password")), e(ctx.csrf),
        "".join([
            _field("現在のパスワード *", "current_password", "", errors=errors,
                   kind="password", extra='required autocomplete="current-password"'),
            _field("新しいパスワード *", "password", "", errors=errors, kind="password",
                   extra='required autocomplete="new-password"',
                   hint="%d 文字以上" % users.MIN_PASSWORD_LENGTH),
            _field("新しいパスワード（確認）*", "password_confirm", "", errors=errors,
                   kind="password", extra='required autocomplete="new-password"'),
        ]),
    ), page_title="アカウント設定")


# --- 利用者管理（管理者のみ） ---------------------------------------------

def users_page(ctx, rows):
    cards = []
    for row in rows:
        me = int(row["id"]) == int(ctx.user["id"])
        flags = []
        if int(row.get("is_admin") or 0):
            flags.append('<span class="badge">管理者</span>')
        if not int(row.get("is_active") or 0):
            flags.append('<span class="badge stop">停止中</span>')
        if me:
            flags.append('<span class="badge self">自分</span>')

        def post_button(action, label, extra_class="", confirm=None):
            attrs = ' onclick="return confirm(\'%s\')"' % confirm if confirm else ""
            return (
                '<form method="post" action="%s" class="inline">'
                '<input type="hidden" name="_csrf" value="%s">'
                '<input type="hidden" name="id" value="%d">'
                '<button class="btn small %s" type="submit"%s>%s</button>'
                '</form>'
                % (e(_url(ctx.script, a=action)), e(ctx.csrf), row["id"],
                   extra_class, attrs, e(label))
            )

        actions = ['<a class="btn small" href="%s">パスワード再設定</a>'
                   % e(_url(ctx.script, a="user_password", id=row["id"]))]
        if me:
            # 自分の権限は変更できない（管理者が 0 人になるのを防ぐ）
            actions.append('<span class="muted small">自分の権限と状態は'
                           '変更できません</span>')
        else:
            if int(row.get("is_admin") or 0):
                actions.append(post_button("user_demote", "管理者から外す"))
            else:
                actions.append(post_button("user_promote", "管理者にする"))
            if int(row.get("is_active") or 0):
                actions.append(post_button("user_deactivate", "利用停止"))
            else:
                actions.append(post_button("user_activate", "停止解除"))
            actions.append('<a class="btn small danger" href="%s">削除</a>'
                           % e(_url(ctx.script, a="user_delete_confirm", id=row["id"])))

        cards.append(
            '<li class="card">'
            '<div class="card-head"><span class="card-title">%s</span>%s</div>'
            '<div class="meta sub">'
            '<span>ログイン名 %s</span>'
            '<span>登録ゲーム %d 件</span>'
            '<span>最終ログイン %s</span>'
            '</div>'
            '<div class="row-actions wrap">%s</div>'
            '</li>'
            % (
                e(users.label_of(row)), "".join(flags), e(row["username"]),
                int(row.get("game_count") or 0),
                "—" if not row.get("last_login_at") else e(str(row["last_login_at"])),
                "".join(actions),
            )
        )

    state = "受け付けています" if ctx.config.allow_signup else "停止しています"
    return layout(ctx, (
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
        '<h1>利用者管理</h1>'
        '<p class="alt">新規登録は現在 <b>%s</b>（config.ini の allow_signup）。'
        '利用者は %d 人です。</p>'
        '<ul class="cards">%s</ul>'
    ) % (e(ctx.script), e(state), len(rows), "".join(cards)),
        page_title="利用者管理")


def user_password_page(ctx, target, errors=None):
    errors = errors or {}
    return layout(ctx, (
        '<p class="back"><a href="%s">← 利用者管理へ</a></p>'
        '<h1>パスワード再設定</h1>'
        '<p class="notice info">%s さんのパスワードを管理者として再設定します。'
        'このアカウントの既存のログイン状態は解除されます。</p>'
        '<form method="post" action="%s" class="stack panel">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<input type="hidden" name="id" value="%d">%s'
        '<div class="toolbar">'
        '<button class="btn primary" type="submit">再設定する</button>'
        '<a class="btn ghost" href="%s">やめる</a>'
        '</div>'
        '</form>'
    ) % (
        e(_url(ctx.script, a="users")), e(users.label_of(target)),
        e(_url(ctx.script, a="user_password")), e(ctx.csrf), target["id"],
        "".join([
            _field("新しいパスワード *", "password", "", errors=errors, kind="password",
                   extra='required autocomplete="new-password"',
                   hint="%d 文字以上" % users.MIN_PASSWORD_LENGTH),
            _field("新しいパスワード（確認）*", "password_confirm", "", errors=errors,
                   kind="password", extra='required autocomplete="new-password"'),
        ]),
        e(_url(ctx.script, a="users")),
    ), page_title="パスワード再設定")


def user_delete_page(ctx, target, game_count):
    return layout(ctx, (
        '<p class="back"><a href="%s">← 利用者管理へ</a></p>'
        '<h1>利用者の削除</h1>'
        '<p class="notice warn">%s さん（ログイン名 %s）と、この方が登録した'
        'ゲーム情報 %d 件をまとめて削除します。元に戻せません。</p>'
        '<form method="post" action="%s">'
        '<input type="hidden" name="_csrf" value="%s">'
        '<input type="hidden" name="id" value="%d">'
        '<div class="toolbar">'
        '<button class="btn danger" type="submit">削除する</button>'
        '<a class="btn ghost" href="%s">やめる</a>'
        '</div>'
        '</form>'
    ) % (
        e(_url(ctx.script, a="users")), e(users.label_of(target)),
        e(target["username"]), game_count,
        e(_url(ctx.script, a="user_delete")), e(ctx.csrf), target["id"],
        e(_url(ctx.script, a="users")),
    ), page_title="利用者の削除")


def error_page(ctx, heading, message, status_note=""):
    return layout(ctx, (
        '<h1>%s</h1><p class="notice warn">%s</p>%s'
        '<p class="back"><a href="%s">← 一覧へ</a></p>'
    ) % (
        e(heading), e(message),
        ('<pre class="trace">%s</pre>' % e(status_note)) if status_note else "",
        e(ctx.script),
    ), page_title=heading)
