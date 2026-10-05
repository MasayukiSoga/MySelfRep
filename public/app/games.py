# -*- coding: utf-8 -*-
"""games テーブルに対する登録・修正・削除・問合（検索）。

SQL は全てプレースホルダ経由。並び替えのカラム名は許可リストで固定し、
文字列連結でユーザ入力を SQL に混ぜない。
"""
import datetime
import decimal

STATUS_CHOICES = ["未プレイ", "プレイ中", "クリア", "中断", "積み"]
OWN_CHOICES = ["パッケージ", "ダウンロード", "サブスク", "レンタル", "未所有"]

# 画面に出す並び替えの選択肢 -> 実際の ORDER BY 句
SORT_COLUMNS = {
    "updated": ("updated_at", "更新日時"),
    "title": ("title_kana, title", "タイトル"),
    "release": ("release_date", "発売日"),
    "rating": ("rating", "評価"),
    "hours": ("play_hours", "プレイ時間"),
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


class ValidationError(Exception):
    def __init__(self, errors):
        super(ValidationError, self).__init__("入力内容を確認してください")
        self.errors = errors


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


FIELDS = (
    "title", "title_kana", "platform", "genre", "maker", "release_date",
    "status", "rating", "play_hours", "own_type", "tags", "note",
)


def _now():
    """DB に渡す現在時刻。ドライバ非依存にするため文字列で扱う。"""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def insert(db, data):
    now = _now()
    columns = list(FIELDS) + ["created_at", "updated_at"]
    values = [data[name] for name in FIELDS] + [now, now]
    sql = "INSERT INTO games (%s) VALUES (%s)" % (
        ", ".join(columns),
        ", ".join(["%s"] * len(columns)),
    )
    _, new_id = db.execute(sql, values)
    return new_id


def update(db, game_id, data):
    assignments = ", ".join("%s = %%s" % name for name in FIELDS)
    values = [data[name] for name in FIELDS] + [_now(), game_id]
    sql = "UPDATE games SET %s, updated_at = %%s WHERE id = %%s" % assignments
    affected, _ = db.execute(sql, values)
    return affected


def delete(db, game_id):
    affected, _ = db.execute("DELETE FROM games WHERE id = %s", (game_id,))
    return affected


def find(db, game_id):
    return db.query_one("SELECT * FROM games WHERE id = %s", (game_id,))


def _like(keyword):
    """LIKE のメタ文字をエスケープして部分一致パターンにする。"""
    escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return "%" + escaped + "%"


def build_conditions(criteria):
    where = []
    params = []
    if criteria.get("q"):
        pattern = _like(criteria["q"])
        columns = ("title", "title_kana", "maker", "tags", "note", "platform", "genre")
        where.append("(" + " OR ".join("%s LIKE %%s" % c for c in columns) + ")")
        params.extend([pattern] * len(columns))
    if criteria.get("platform"):
        where.append("platform = %s")
        params.append(criteria["platform"])
    if criteria.get("status"):
        where.append("status = %s")
        params.append(criteria["status"])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def search(db, criteria, page=1, per_page=20):
    """問合処理。(行リスト, 全件数, ページ数) を返す。"""
    clause, params = build_conditions(criteria)

    total_row = db.query_one("SELECT COUNT(*) AS n FROM games" + clause, params)
    total = int(total_row["n"]) if total_row else 0

    column, _label = SORT_COLUMNS.get(criteria.get("sort"), SORT_COLUMNS[DEFAULT_SORT])
    direction = "ASC" if criteria.get("order") == "asc" else "DESC"
    pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, pages))
    offset = (page - 1) * per_page

    # NULL は常に末尾へ回したいので is-null 判定を第 1 ソートキーにする
    sql = (
        "SELECT * FROM games%s ORDER BY (%s IS NULL) ASC, %s %s, id DESC LIMIT %%s OFFSET %%s"
        % (clause, column.split(",")[0], column, direction)
    )
    rows = db.query(sql, params + [per_page, offset])
    return rows, total, page, pages


def all_for_export(db, criteria):
    clause, params = build_conditions(criteria)
    return db.query(
        "SELECT * FROM games" + clause + " ORDER BY title_kana, title, id", params
    )


def distinct_platforms(db):
    rows = db.query(
        "SELECT platform FROM games WHERE platform <> '' "
        "GROUP BY platform ORDER BY COUNT(*) DESC, platform LIMIT 100"
    )
    return [row["platform"] for row in rows]


def summary(db):
    """トップに出す件数サマリ。"""
    rows = db.query("SELECT status, COUNT(*) AS n FROM games GROUP BY status")
    counts = dict((row["status"], int(row["n"])) for row in rows)
    counts["合計"] = sum(counts.values())
    return counts
