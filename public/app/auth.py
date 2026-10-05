# -*- coding: utf-8 -*-
"""パスワードの保存・照合と、Cookie による継続・CSRF 対策。

サーバ側セッションを持たない（共用サーバでファイルロックを避けたい）ため、
利用者 ID と有効期限を HMAC 署名した Cookie を身分証として使う。
署名にはパスワードハッシュの指紋を混ぜてあるので、パスワードを変更すると
その利用者の既存セッションは自動的に無効になる。
"""
import base64
import hashlib
import hmac
import secrets
import time

SESSION_COOKIE = "gsess"
CSRF_COOKIE = "gcsrf"
SESSION_SECONDS = 60 * 60 * 24 * 14  # 14 日
PBKDF2_ROUNDS = 200000


# --- パスワード -----------------------------------------------------------

def hash_password(password, salt=None, rounds=PBKDF2_ROUNDS):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds
    )
    return "pbkdf2_sha256$%d$%s$%s" % (rounds, salt, digest.hex())


def verify_password_hash(stored, password):
    """保存済みハッシュと照合する。比較は定数時間で行う。"""
    if not stored or not password:
        return False
    try:
        algo, rounds, salt, _digest = stored.split("$", 3)
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    try:
        candidate = hash_password(password, salt=salt, rounds=int(rounds))
    except ValueError:
        return False
    return hmac.compare_digest(candidate, stored)


# --- セッション -----------------------------------------------------------

def _sign(secret, message):
    mac = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()).decode("ascii").rstrip("=")


def _fingerprint(password_hash):
    """パスワード変更を検知するための短い指紋。"""
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:16]


def issue_session(secret, user):
    expires = int(time.time()) + SESSION_SECONDS
    payload = "%d.%d" % (int(user["id"]), expires)
    signed = "%s.%s" % (payload, _fingerprint(user["password_hash"]))
    return "%s.%s" % (payload, _sign(secret, signed))


def parse_session(token):
    """Cookie から (利用者 ID, 有効期限) を取り出す。署名はまだ検証しない。"""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        user_id, expires = int(parts[0]), int(parts[1])
    except ValueError:
        return None
    if expires <= time.time():
        return None
    return user_id, expires


def verify_session(secret, token, user):
    """読み込んだ利用者行を使って署名を検証する。"""
    parsed = parse_session(token)
    if not parsed or not user or int(user["id"]) != parsed[0]:
        return False
    payload = "%d.%d" % parsed
    signed = "%s.%s" % (payload, _fingerprint(user["password_hash"]))
    return hmac.compare_digest(token.split(".")[2], _sign(secret, signed))


# --- CSRF -----------------------------------------------------------------

def ensure_csrf_token(request, response):
    """フォーム描画時に呼ぶ。Cookie が無ければ発行して、トークンを返す。"""
    token = request.cookies.get(CSRF_COOKIE, "")
    if not token or len(token) < 32:
        token = secrets.token_urlsafe(32)
        response.set_cookie(CSRF_COOKIE, token, secure=request.is_https)
    return token


def check_csrf(request):
    """二重送信 Cookie 方式。POST 値と Cookie の一致を確認する。"""
    sent = request.get("_csrf")
    stored = request.cookies.get(CSRF_COOKIE, "")
    return bool(sent) and bool(stored) and hmac.compare_digest(sent, stored)
