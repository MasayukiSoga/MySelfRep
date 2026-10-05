# -*- coding: utf-8 -*-
"""共有パスワード 1 本のログインと、Cookie による継続・CSRF 対策。

サーバ側セッションを持たない（共用サーバでファイルロックを避けたい）ため、
有効期限込みで HMAC 署名した Cookie を身分証として使う。
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


def hash_password(password, salt=None, rounds=PBKDF2_ROUNDS):
    """config.ini に書く password_hash を作る。"""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds
    )
    return "pbkdf2_sha256$%d$%s$%s" % (rounds, salt, digest.hex())


def verify_password(config, password):
    if not password:
        return False
    if config.password_hash:
        try:
            algo, rounds, salt, _ = config.password_hash.split("$", 3)
        except ValueError:
            return False
        if algo != "pbkdf2_sha256":
            return False
        candidate = hash_password(password, salt=salt, rounds=int(rounds))
        return hmac.compare_digest(candidate, config.password_hash)
    if config.plain_password:
        return hmac.compare_digest(password, config.plain_password)
    return False


def _sign(secret, message):
    mac = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()).decode("ascii").rstrip("=")


def issue_session(secret):
    expires = int(time.time()) + SESSION_SECONDS
    payload = "%d" % expires
    return "%s.%s" % (payload, _sign(secret, payload))


def check_session(secret, token):
    if not token:
        return False
    payload, _, signature = token.rpartition(".")
    if not payload or not hmac.compare_digest(signature, _sign(secret, payload)):
        return False
    try:
        return int(payload) > time.time()
    except ValueError:
        return False


def is_logged_in(config, request):
    if not config.login_required:
        return True
    return check_session(config.secret_key, request.cookies.get(SESSION_COOKIE, ""))


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
