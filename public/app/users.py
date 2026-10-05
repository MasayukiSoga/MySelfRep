# -*- coding: utf-8 -*-
"""利用者アカウントの作成・認証・管理。

- アカウントは招待コードを知っている人だけが自分で作成できる
- 最初に作成されたアカウントが自動的に管理者になる
- 管理者は全データを扱えるが、自分自身の権限を落とすことはできない
  （誰も管理できない状態に陥るのを防ぐため）
"""
import datetime
import hmac
import re

from . import auth
from .errors import ValidationError

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,32}$")
MIN_PASSWORD_LENGTH = 8
MAX_DISPLAY_NAME = 64

# 連続して失敗したらしばらく受け付けない（パスワード総当たり対策）
MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15


def _now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# --- 取得 -----------------------------------------------------------------

def find_by_id(db, user_id):
    if not user_id:
        return None
    return db.query_one("SELECT * FROM users WHERE id = %s", (user_id,))


def find_by_username(db, username):
    if not username:
        return None
    return db.query_one("SELECT * FROM users WHERE username = %s", (username,))


def count_all(db):
    row = db.query_one("SELECT COUNT(*) AS n FROM users")
    return int(row["n"]) if row else 0


def count_admins(db, exclude_id=None):
    sql = "SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND is_active = 1"
    params = []
    if exclude_id:
        sql += " AND id <> %s"
        params.append(exclude_id)
    row = db.query_one(sql, params)
    return int(row["n"]) if row else 0


def list_all(db):
    """管理画面用。所有ゲーム数を添えて返す。"""
    return db.query(
        "SELECT u.*, "
        "(SELECT COUNT(*) FROM games g WHERE g.user_id = u.id) AS game_count "
        "FROM users u ORDER BY u.is_admin DESC, u.id"
    )


def choices_for_filter(db):
    """管理者向けの「登録者で絞り込む」用の一覧。"""
    rows = db.query(
        "SELECT id, username, display_name FROM users ORDER BY username"
    )
    return [(row["id"], label_of(row)) for row in rows]


def label_of(user):
    """画面に出す名前。表示名が未設定ならログイン名を使う。"""
    if not user:
        return "（削除済み）"
    return user.get("display_name") or user.get("username") or "（不明）"


def is_admin(user):
    return bool(user and int(user.get("is_admin") or 0))


# --- 検証 -----------------------------------------------------------------

def validate_username(db, username, errors, exclude_id=None):
    if not username:
        errors["username"] = "ログイン名は必須です"
        return
    if not USERNAME_PATTERN.match(username):
        errors["username"] = "半角英数字・ハイフン・アンダースコアの 3〜32 文字で入力してください"
        return
    existing = find_by_username(db, username)
    if existing and existing["id"] != exclude_id:
        errors["username"] = "このログイン名は既に使われています"


def validate_password(password, confirm, errors, field="password"):
    if not password:
        errors[field] = "パスワードは必須です"
        return
    if len(password) < MIN_PASSWORD_LENGTH:
        errors[field] = "%d 文字以上にしてください" % MIN_PASSWORD_LENGTH
        return
    if confirm is not None and password != confirm:
        errors[field + "_confirm"] = "パスワードが一致しません"


def validate_display_name(display_name, errors):
    if len(display_name) > MAX_DISPLAY_NAME:
        errors["display_name"] = "%d 文字以内で入力してください" % MAX_DISPLAY_NAME


# --- 作成・更新 -----------------------------------------------------------

def signup(db, config, invite_code, username, display_name, password, confirm):
    """招待コードを確認してアカウントを作る。最初の 1 人は管理者になる。"""
    errors = {}

    if not config.allow_signup:
        raise ValidationError({"invite_code": "現在、新規登録は受け付けていません"})
    if not config.invite_code or not hmac.compare_digest(
        invite_code or "", config.invite_code
    ):
        errors["invite_code"] = "招待コードが違います"

    validate_username(db, username, errors)
    validate_display_name(display_name, errors)
    validate_password(password, confirm, errors)
    if errors:
        raise ValidationError(errors)

    first_user = count_all(db) == 0
    _, new_id = db.execute(
        "INSERT INTO users (username, display_name, password_hash, is_admin, "
        "is_active, created_at) VALUES (%s, %s, %s, %s, 1, %s)",
        (username, display_name, auth.hash_password(password),
         1 if first_user else 0, _now()),
    )
    return new_id, first_user


def set_password(db, user_id, password):
    db.execute(
        "UPDATE users SET password_hash = %s, failed_count = 0, locked_until = NULL "
        "WHERE id = %s",
        (auth.hash_password(password), user_id),
    )


def set_display_name(db, user_id, display_name):
    db.execute(
        "UPDATE users SET display_name = %s WHERE id = %s", (display_name, user_id)
    )


def set_admin(db, user_id, flag):
    db.execute(
        "UPDATE users SET is_admin = %s WHERE id = %s", (1 if flag else 0, user_id)
    )


def set_active(db, user_id, flag):
    db.execute(
        "UPDATE users SET is_active = %s, failed_count = 0, locked_until = NULL "
        "WHERE id = %s",
        (1 if flag else 0, user_id),
    )


def delete(db, user_id):
    """利用者とその登録データをまとめて削除する。"""
    db.execute("DELETE FROM games WHERE user_id = %s", (user_id,))
    affected, _ = db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return affected


# --- ログイン -------------------------------------------------------------

def locked_until(user):
    """ロック中なら解除時刻を返す。"""
    raw = user.get("locked_until")
    if not raw:
        return None
    if isinstance(raw, str):
        try:
            raw = datetime.datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    return raw if raw > datetime.datetime.now() else None


def login(db, username, password):
    """認証を試みる。成功なら利用者行、失敗なら理由の文字列を返す。"""
    user = find_by_username(db, username)
    if not user:
        # 利用者の有無を悟られないよう、存在しない場合もハッシュ計算を行う
        auth.verify_password_hash(
            "pbkdf2_sha256$%d$0000$%s" % (auth.PBKDF2_ROUNDS, "0" * 64), password
        )
        return None, "ログイン名またはパスワードが違います。"

    until = locked_until(user)
    if until:
        return None, "試行回数が多すぎます。%s 以降に再度お試しください。" % until.strftime("%H:%M")

    if not auth.verify_password_hash(user["password_hash"], password):
        failed = int(user.get("failed_count") or 0) + 1
        if failed >= MAX_FAILED_ATTEMPTS:
            lock_at = datetime.datetime.now() + datetime.timedelta(minutes=LOCK_MINUTES)
            db.execute(
                "UPDATE users SET failed_count = %s, locked_until = %s WHERE id = %s",
                (failed, lock_at.strftime("%Y-%m-%d %H:%M:%S"), user["id"]),
            )
            return None, "試行回数が多すぎます。%d 分後に再度お試しください。" % LOCK_MINUTES
        db.execute(
            "UPDATE users SET failed_count = %s WHERE id = %s", (failed, user["id"])
        )
        return None, "ログイン名またはパスワードが違います。"

    if not int(user.get("is_active") or 0):
        return None, "このアカウントは利用停止中です。管理者にお問い合わせください。"

    db.execute(
        "UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = %s "
        "WHERE id = %s",
        (_now(), user["id"]),
    )
    return user, ""
