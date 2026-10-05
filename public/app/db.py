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

    def ensure_schema(self, base_dir):
        """games テーブルが無ければ schema.sql を流して作る。"""
        exists = self.query_one(
            "SELECT COUNT(*) AS n FROM information_schema.tables "
            "WHERE table_schema = %s AND table_name = 'games'",
            (self.config.db_name,),
        )
        if exists and int(exists["n"]) > 0:
            return
        sql_path = os.path.join(base_dir, "schema.sql")
        with open(sql_path, "r", encoding="utf-8") as handle:
            script = handle.read()
        for chunk in script.split(";"):
            # 行頭コメントを落としてから、中身が残っている文だけ実行する
            body = "\n".join(
                line for line in chunk.splitlines() if not line.strip().startswith("--")
            ).strip()
            if body:
                self.execute(body)
