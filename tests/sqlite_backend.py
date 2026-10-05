# -*- coding: utf-8 -*-
"""ローカル検証用に、MySQL の代わりに SQLite でアプリを動かす差し替え。

本番の schema.sql をそのまま読み込んで SQLite 用に変換するので、
テーブル定義を二重に持たずに済む（定義のずれが起きない）。

MySQL との違いで注意が必要な点:
- 型の扱いが緩いため、桁あふれや型不一致は SQLite では検出されない
- 照合順序が異なるため、大文字小文字や全角半角の一致判定は本番と差が出る
- ALTER TABLE による移行処理は SQLite では検証できない
いずれも「設置前に一通り動くか確かめる」用途には十分な範囲。
"""
import os
import re
import sqlite3

# MySQL の型 -> SQLite の型。並び順に意味がある（INT UNSIGNED を INT より先に）
TYPE_RULES = [
    (r"\bINT\s+UNSIGNED\b", "INTEGER"),
    (r"\bTINYINT\s+UNSIGNED\b", "INTEGER"),
    (r"\bTINYINT\(\s*\d+\s*\)", "INTEGER"),
    (r"\bSMALLINT\b", "INTEGER"),
    (r"\bBIGINT\b", "INTEGER"),
    (r"\bVARCHAR\(\s*\d+\s*\)", "TEXT"),
    (r"\bDECIMAL\(\s*\d+\s*,\s*\d+\s*\)", "REAL"),
    (r"\bDATETIME\b", "TEXT"),
    (r"\bDATE\b", "TEXT"),
    (r"\bINT\b", "INTEGER"),
]


def _strip_comments(chunk):
    return "\n".join(
        line for line in chunk.splitlines() if not line.strip().startswith("--")
    ).strip()


def _split_items(text):
    """括弧の深さを見ながらカンマで分割する（VARCHAR(32) 等を壊さないため）。"""
    items, depth, buf = [], 0, []
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            items.append("".join(buf))
            buf = []
        else:
            buf.append(char)
    if "".join(buf).strip():
        items.append("".join(buf))
    return [item.strip() for item in items if item.strip()]


def _convert_type(column):
    for pattern, replacement in TYPE_RULES:
        column = re.sub(pattern, replacement, column, flags=re.I)
    return column


def translate_ddl(mysql_sql):
    """MySQL の CREATE TABLE 群を SQLite で実行できる文のリストに変換する。"""
    statements = []
    for chunk in mysql_sql.split(";"):
        body = _strip_comments(chunk)
        if not body:
            continue

        match = re.match(
            r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*\((.*)\)[^)]*$",
            body, re.S | re.I,
        )
        if not match:
            statements.append(body)
            continue

        table, inner = match.group(1), match.group(2)
        columns, indexes = [], []
        has_autoincrement = False

        for item in _split_items(inner):
            upper = item.upper()
            if upper.startswith("PRIMARY KEY"):
                # AUTO_INCREMENT 列が主キーを兼ねるので読み替える
                columns.append(("__primary__", item))
                continue
            if upper.startswith("UNIQUE KEY") or upper.startswith("UNIQUE INDEX"):
                cols = re.search(r"\((.*)\)", item, re.S)
                columns.append((None, "UNIQUE (%s)" % cols.group(1).strip()))
                continue
            if upper.startswith("KEY ") or upper.startswith("INDEX "):
                name = re.match(r"(?:KEY|INDEX)\s+(\w+)", item, re.I)
                cols = re.search(r"\((.*)\)", item, re.S)
                if name and cols:
                    indexes.append(
                        "CREATE INDEX IF NOT EXISTS %s_%s ON %s (%s)"
                        % (table, name.group(1), table, cols.group(1).strip())
                    )
                continue

            if re.search(r"AUTO_INCREMENT", item, re.I):
                column_name = item.split()[0]
                columns.append((None, "%s INTEGER PRIMARY KEY AUTOINCREMENT" % column_name))
                has_autoincrement = True
                continue
            columns.append((None, _convert_type(item)))

        # AUTO_INCREMENT が無いテーブルでは PRIMARY KEY 句を残す必要がある
        definitions = [
            text for marker, text in columns
            if not (marker == "__primary__" and has_autoincrement)
        ]
        statements.append(
            "CREATE TABLE IF NOT EXISTS %s (\n  %s\n)" % (table, ",\n  ".join(definitions))
        )
        statements.extend(indexes)
    return statements


class SqliteDatabase(object):
    """app.db.Database と同じインタフェースを SQLite で提供する。"""

    connection = None  # install() が差し込む共有接続

    def __init__(self, config):
        self.config = config

    def _sql(self, sql):
        return sql.replace("%s", "?")

    def query(self, sql, params=()):
        cursor = self.connection.execute(self._sql(sql), tuple(params))
        try:
            return [dict(row) for row in cursor.fetchall()]
        finally:
            cursor.close()

    def query_one(self, sql, params=()):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql, params=()):
        cursor = self.connection.execute(self._sql(sql), tuple(params))
        self.connection.commit()
        try:
            return cursor.rowcount, cursor.lastrowid
        finally:
            cursor.close()

    def close(self):
        pass  # 共有接続なので閉じない

    def ensure_schema(self, base_dir):
        pass  # install() 時に作成済み


def install(db_module, db_path, schema_path):
    """app.db.Database を SQLite 版に差し替え、テーブルを用意する。"""
    # ローカル確認用サーバは別スレッドで要求を処理するため、スレッド制限を外す。
    # 要求は 1 件ずつ順に処理されるので同時書き込みは起きない。
    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    with open(schema_path, "r", encoding="utf-8") as handle:
        for statement in translate_ddl(handle.read()):
            connection.execute(statement)
    connection.commit()

    SqliteDatabase.connection = connection
    db_module.Database = SqliteDatabase
    return connection
