# -*- coding: utf-8 -*-
"""games テーブルに対する登録・修正・削除・問合（検索）。

owner_id を指定すると、その利用者が登録した行だけを対象にする。
管理者は owner_id を None にして呼ぶことで全データを扱える。
一般利用者の経路では必ず owner_id を渡すため、URL の id を書き換えても
他人のデータには触れられない。

SQL は全てプレースホルダ経由。並び替えのカラム名は許可リストで固定し、
文字列連結でユーザ入力を SQL に混ぜない。
"""
import datetime
import decimal

from .errors import ValidationError

STATUS_CHOICES = ["未プレイ", "プレイ中", "クリア", "中断", "積み"]
OWN_CHOICES = ["パッケージ", "ダウンロード", "サブスク", "レンタル", "未所有"]

# 画面に出す並び替えの選択肢 -> 実際の ORDER BY 句
SORT_COLUMNS = {
    "updated": ("g.updated_at", "更新日時"),
    "title": ("g.title_kana, g.title", "タイトル"),
    "release": ("g.release_date", "発売日"),
    "rating": ("g.rating", "評価"),
    "hours": ("g.play_hours", "プレイ時間"),
}
DEFAULT_SORT = "updated"

# 文字数上限（DB 定義と合わせる）
MAX_LENGTHS = {
    "title": 255,
    "title_kana": 255,
    "platform": 64,
    "genre": 64,
    "maker": 128,
    "own_type": 16,
    "tags": 255,
    "note": 60000,
}

FIELDS = (
    "title", "title_kana", "platform", "genre", "maker", "release_date",
    "status", "rating", "play_hours", "own_type", "tags", "note",
)

# 登録者名を一緒に取るための結合。count でも同じ条件式を使えるようにしておく。
_FROM = "FROM games g LEFT JOIN users u ON u.id = g.user_id"


def _now():
    """DB に渡す現在時刻。ドライバ非依存にするため文字列で扱う。"""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# --- 入力検証 -------------------------------------------------------------

def parse_form(request):
    """フォーム入力を検証して、DB に渡せる dict にする。"""
    errors = {}
    data = {}

    for field in ("title", "title_kana", "platform", "genre", "maker", "tags", "note"):
        value = request.get(field)
        if len(value) > MAX_LENGTHS[field]:
            errors[field] = "%d 文字以内で入力してください" % MAX_LENGTHS[field]
        data[field] = value

    if not data["title"]:
        errors["title"] = "タイトルは必須です"

    status = request.get("status")
    data["status"] = status if status in STATUS_CHOICES else STATUS_CHOICES[0]

    own_type = request.get("own_type")
    data["own_type"] = own_type if own_type in OWN_CHOICES else ""

    raw_date = request.get("release_date")
    if raw_date:
        try:
            parsed = datetime.datetime.strptime(raw_date, "%Y-%m-%d").date()
            data["release_date"] = parsed.isoformat()
        except ValueError:
            errors["release_date"] = "YYYY-MM-DD の形式で入力してください"
            data["release_date"] = None
    else:
        data["release_date"] = None

    raw_rating = request.get("rating")
    if raw_rating:
        try:
            rating = int(raw_rating)
        except ValueError:
            errors["rating"] = "0〜5 の数字で入力してください"
            rating = None
        else:
            if not 0 <= rating <= 5:
                errors["rating"] = "0〜5 の範囲で入力してください"
                rating = None
        data["rating"] = rating
    else:
        data["rating"] = None

    raw_hours = request.get("play_hours")
    if raw_hours:
        try:
            hours = decimal.Decimal(raw_hours)
        except decimal.InvalidOperation:
            errors["play_hours"] = "数字で入力してください"
            hours = None
        else:
            if hours < 0 or hours > decimal.Decimal("99999.9"):
                errors["play_hours"] = "0〜99999.9 の範囲で入力してください"
                hours = None
        data["play_hours"] = None if hours is None else str(hours)
    else:
        data["play_hours"] = None

    if errors:
        raise ValidationError(errors)
    return data


# --- 更新系（すべて owner_id で範囲を限定できる） -------------------------

def insert(db, user_id, data):
    columns = ["user_id"] + list(FIELDS) + ["created_at", "updated_at"]
    now = _now()
    values = [user_id] + [data[name] for name in FIELDS] + [now, now]
    sql = "INSERT INTO games (%s) VALUES (%s)" % (
        ", ".join(columns),
        ", ".join(["%s"] * len(columns)),
    )
    _, new_id = db.execute(sql, values)
    return new_id


def update(db, game_id, data, owner_id=None):
    assignments = ", ".join("%s = %%s" % name for name in FIELDS)
    sql = "UPDATE games SET %s, updated_at = %%s WHERE id = %%s" % assignments
    values = [data[name] for name in FIELDS] + [_now(), game_id]
    if owner_id is not None:
        sql += " AND user_id = %s"
        values.append(owner_id)
    affected, _ = db.execute(sql, values)
    return affected


def delete(db, game_id, owner_id=None):
    sql = "DELETE FROM games WHERE id = %s"
    params = [game_id]
    if owner_id is not None:
        sql += " AND user_id = %s"
        params.append(owner_id)
    affected, _ = db.execute(sql, params)
    return affected


def delete_all_of(db, owner_id):
    affected, _ = db.execute("DELETE FROM games WHERE user_id = %s", (owner_id,))
    return affected


def find(db, game_id, owner_id=None):
    if not game_id:
        return None
    sql = (
        "SELECT g.*, u.username AS owner_username, u.display_name AS owner_display "
        + _FROM + " WHERE g.id = %s"
    )
    params = [game_id]
    if owner_id is not None:
        sql += " AND g.user_id = %s"
        params.append(owner_id)
    return db.query_one(sql, params)


# --- 問合 -----------------------------------------------------------------

# LIKE のエスケープ文字。バックスラッシュは DB によって解釈が異なるため
# 使わず、ESCAPE 句で明示できる記号を選ぶ。
LIKE_ESCAPE = "!"


def _like(keyword):
    """LIKE のメタ文字をエスケープして部分一致パターンにする。"""
    escaped = keyword.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
    escaped = escaped.replace("%", LIKE_ESCAPE + "%")
    escaped = escaped.replace("_", LIKE_ESCAPE + "_")
    return "%" + escaped + "%"


def build_conditions(criteria, owner_id=None):
    where = []
    params = []

    # 一般利用者は常に自分の行だけ。管理者は owner_id=None で全件。
    if owner_id is not None:
        where.append("g.user_id = %s")
        params.append(owner_id)
    elif criteria.get("owner"):
        where.append("g.user_id = %s")
        params.append(criteria["owner"])

    if criteria.get("q"):
        pattern = _like(criteria["q"])
        columns = ("g.title", "g.title_kana", "g.maker", "g.tags", "g.note",
                   "g.platform", "g.genre")
        where.append("(" + " OR ".join(
            "%s LIKE %%s ESCAPE '%s'" % (c, LIKE_ESCAPE) for c in columns) + ")")
        params.extend([pattern] * len(columns))
    if criteria.get("platform"):
        where.append("g.platform = %s")
        params.append(criteria["platform"])
    if criteria.get("status"):
        where.append("g.status = %s")
        params.append(criteria["status"])

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def search(db, criteria, page=1, per_page=20, owner_id=None):
    """問合処理。(行リスト, 全件数, 現在ページ, 総ページ数) を返す。"""
    clause, params = build_conditions(criteria, owner_id)

    total_row = db.query_one("SELECT COUNT(*) AS n " + _FROM + clause, params)
    total = int(total_row["n"]) if total_row else 0

    column, _label = SORT_COLUMNS.get(criteria.get("sort"), SORT_COLUMNS[DEFAULT_SORT])
    direction = "ASC" if criteria.get("order") == "asc" else "DESC"
    pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, pages))
    offset = (page - 1) * per_page

    # NULL は常に末尾へ回したいので is-null 判定を第 1 ソートキーにする
    sql = (
        "SELECT g.*, u.username AS owner_username, u.display_name AS owner_display "
        + _FROM + clause
        + " ORDER BY (%s IS NULL) ASC, %s %s, g.id DESC LIMIT %%s OFFSET %%s"
        % (column.split(",")[0], column, direction)
    )
    rows = db.query(sql, params + [per_page, offset])
    return rows, total, page, pages


def all_for_export(db, criteria, owner_id=None):
    clause, params = build_conditions(criteria, owner_id)
    return db.query(
        "SELECT g.*, u.username AS owner_username, u.display_name AS owner_display "
        + _FROM + clause + " ORDER BY g.title_kana, g.title, g.id",
        params,
    )


def distinct_platforms(db, owner_id=None):
    clause, params = build_conditions({}, owner_id)
    extra = " AND g.platform <> ''" if clause else " WHERE g.platform <> ''"
    rows = db.query(
        "SELECT g.platform AS platform " + _FROM + clause + extra
        + " GROUP BY g.platform ORDER BY COUNT(*) DESC, g.platform LIMIT 100",
        params,
    )
    return [row["platform"] for row in rows]


def summary(db, owner_id=None):
    """一覧の上に出す件数サマリ。"""
    clause, params = build_conditions({}, owner_id)
    rows = db.query(
        "SELECT g.status AS status, COUNT(*) AS n " + _FROM + clause
        + " GROUP BY g.status",
        params,
    )
    counts = dict((row["status"], int(row["n"])) for row in rows)
    counts["合計"] = sum(counts.values())
    return counts
