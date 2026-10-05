# -*- coding: utf-8 -*-
"""config.ini の読み込みと、Cookie 署名鍵の用意。"""
import configparser
import hashlib
import os
import secrets


class ConfigError(Exception):
    pass


class Config(object):
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.path = os.path.join(base_dir, "config.ini")
        self.warnings = []

        if not os.path.exists(self.path):
            raise ConfigError(
                "config.ini がありません。config.ini.sample をコピーして "
                "データベース接続情報を記入してください。"
            )

        parser = configparser.ConfigParser()
        parser.read(self.path, encoding="utf-8")
        self._parser = parser

        self.db_host = self._get("database", "host")
        self.db_port = int(self._get("database", "port", "3306") or 3306)
        self.db_name = self._get("database", "name")
        self.db_user = self._get("database", "user")
        self.db_password = self._get("database", "password")
        if not (self.db_host and self.db_name and self.db_user):
            raise ConfigError("config.ini の [database] host / name / user を設定してください。")

        self.title = self._get("app", "title", "ゲーム情報管理")
        self.allow_signup = self._bool("app", "allow_signup", True)
        self.invite_code = self._get("app", "invite_code")
        self.per_page = max(5, min(100, int(self._get("app", "per_page", "20") or 20)))
        self.auto_migrate = self._bool("app", "auto_migrate", True)
        self.secret_key = self._get("app", "secret_key") or self._load_or_create_secret()

        if self.allow_signup and not self.invite_code:
            raise ConfigError(
                "allow_signup = true ですが invite_code が未設定です。"
                "tools/make_secrets.py で招待コードを生成して config.ini に設定してください。"
            )
        if self.invite_code and len(self.invite_code) < 8:
            self.warnings.append(
                "招待コードが短すぎます。推測されにくい 12 文字以上にしてください。"
            )

    def _get(self, section, option, default=""):
        try:
            return self._parser.get(section, option).strip()
        except (configparser.NoSectionError, configparser.NoOptionError):
            return default

    def _bool(self, section, option, default):
        raw = self._get(section, option, "").lower()
        if raw in ("true", "yes", "on", "1"):
            return True
        if raw in ("false", "no", "off", "0"):
            return False
        return default

    def _load_or_create_secret(self):
        """secret_key 未設定時のフォールバック。

        private/secret.key に乱数を保存して使い回す。書き込めない環境では
        config.ini の内容から鍵を導出する（同じサーバなら毎回同じ値になる）。
        """
        key_path = os.path.join(self.base_dir, "private", "secret.key")
        try:
            if os.path.exists(key_path):
                with open(key_path, "r", encoding="utf-8") as handle:
                    saved = handle.read().strip()
                if saved:
                    return saved
            os.makedirs(os.path.dirname(key_path), exist_ok=True)
            generated = secrets.token_hex(32)
            with open(key_path, "w", encoding="utf-8") as handle:
                handle.write(generated)
            os.chmod(key_path, 0o600)
            return generated
        except OSError:
            self.warnings.append(
                "secret_key が未設定で private/secret.key も作成できませんでした。"
                "config.ini に secret_key を設定してください。"
            )
            seed = "|".join([self.db_password, self.invite_code, self.db_name])
            return hashlib.sha256(seed.encode("utf-8")).hexdigest()
