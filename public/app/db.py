# -*- coding: utf-8 -*-
"""MySQL 接続のラッパ。

さくらの共用サーバではビルドが走らない純 Python の PyMySQL を推奨するが、
環境に既に入っているドライバがあればそれも使えるようにしておく。
いずれも paramstyle は %s なので SQL は共通化できる。
"""
import os

DRIVER_HINT = (
    "MySQL ドライバが見つかりません。SSH でログインして次を実行してください:\n"
    "  cd ~/www/game && python3 -m pip install -t vendor PyMySQL"
)


class DriverNotFound(Exception):
    pass


def _load_driver():
    try:
        import pymysql
        import pymysql.cursors

        return "pymysql", pymysql
    except ImportError:
        pass
    try:
        import MySQLdb
        import MySQLdb.cursors

        return "mysqldb", MySQLdb
    except ImportError:
        pass
    try:
        import mysql.connector

        return "connector", mysql.connector
    except ImportError:
        pass
    raise DriverNotFound(DRIVER_HINT)


class Database(object):
    def __init__(self, config):
        self.config = config
        self.kind, driver = _load_driver()
        if self.kind == "pymysql":
            import pymysql.cursors

            self._conn = driver.connect(
                host=config.db_host,
                port=config.db_port,
                user=config.db_user,
                password=config.db_password,
                database=config.db_name,
                charset="utf8mb4",
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=10,
            )
        elif self.kind == "mysqldb":
            import MySQLdb.cursors

            self._conn = driver.connect(
                host=config.db_host,
                port=config.db_port,
                user=config.db_user,
                passwd=config.db_password,
                db=config.db_name,
                charset="utf8mb4",
                cursorclass=MySQLdb.cursors.DictCursor,
            )
            self._conn.autocommit(True)
        else:
            self._conn = driver.connect(
                host=config.db_host,
                port=config.db_port,
                user=config.db_user,
                password=config.db_password,
                database=config.db_name,
                charset="utf8mb4",
                autocommit=True,
                connection_timeout=10,
            )

    def _cursor(self):
        if self.kind == "connector":
            return self._conn.cursor(dictionary=True)
        return self._conn.cursor()

    def query(self, sql, params=()):
        cur = self._cursor()
        try:
            cur.execute(sql, params)
            return list(cur.fetchall())
        finally:
            cur.close()

    def query_one(self, sql, params=()):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql, params=()):
        """INSERT / UPDATE / DELETE 用。(影響行数, 採番された id) を返す。"""
        cur = self._cursor()
        try:
            cur.execute(sql, params)
            return cur.rowcount, getattr(cur, "lastrowid", None)
        finally:
            cur.close()

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass

    # --- テーブルの自動作成と移行 ---------------------------------------

    def _existing_tables(self):
        rows = self.query(
            "SELECT table_name AS t FROM information_schema.tables "
            "WHERE table_schema = %s",
            (self.config.db_name,),
        )
        # ドライバによって列名の大小が異なることがあるため両方見る
        names = set()
        for row in rows:
            value = row.get("t") or row.get("TABLE_NAME") or row.get("table_name")
            if value:
                names.add(str(value).lower())
        return names

    def _columns(self, table):
        rows = self.query(
            "SELECT column_name AS c FROM information_schema.columns "
            "WHERE table_schema = %s AND table_name = %s",
            (self.config.db_name, table),
        )
        names = set()
        for row in rows:
            value = row.get("c") or row.get("COLUMN_NAME") or row.get("column_name")
            if value:
                names.add(str(value).lower())
        return names

    def ensure_schema(self, base_dir):
        """users / games テーブルを用意する。既存環境からの移行もここで行う。"""
        tables = self._existing_tables()

        if "users" not in tables or "games" not in tables:
            sql_path = os.path.join(base_dir, "schema.sql")
            with open(sql_path, "r", encoding="utf-8") as handle:
                script = handle.read()
            for chunk in script.split(";"):
                # 行頭コメントを落としてから、中身が残っている文だけ実行する
                body = "\n".join(
                    line for line in chunk.splitlines()
                    if not line.strip().startswith("--")
                ).strip()
                if body:
                    self.execute(body)
            tables = self._existing_tables()

        # 1 人用だった頃の games には user_id が無いので足す
        if "games" in tables and "user_id" not in self._columns("games"):
            self.execute(
                "ALTER TABLE games ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 0"
            )
            self.execute("ALTER TABLE games ADD INDEX idx_user (user_id)")
            # 既存データは最初の管理者の持ち物として引き継ぐ
            admin = self.query_one(
                "SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1"
            )
            if admin:
                self.execute(
                    "UPDATE games SET user_id = %s WHERE user_id = 0", (admin["id"],)
                )
