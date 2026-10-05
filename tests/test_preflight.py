# -*- coding: utf-8 -*-
"""設置前チェック。アップロードする前に気づきたい問題を見る。"""
import io
import os
import py_compile
import tempfile

PUBLIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")

REQUIRED_FILES = [
    "index.cgi", ".htaccess", "schema.sql", "config.ini.sample",
    "requirements.txt", "static/style.css", "app/.htaccess",
    "app/main.py", "app/web.py", "app/config.py", "app/db.py",
    "app/auth.py", "app/users.py", "app/games.py", "app/errors.py",
    "app/templates.py", "app/views.py", "tools/make_secrets.py",
]


def test(suite):
    suite.group("アップロードするファイルが揃っている")
    for name in REQUIRED_FILES:
        path = os.path.join(PUBLIC, name)
        suite.check(name, os.path.isfile(path), "見つかりません: %s" % path)

    suite.group("Python の文法が通る")
    for root, _dirs, files in os.walk(PUBLIC):
        if "__pycache__" in root:
            continue
        for name in sorted(files):
            if not (name.endswith(".py") or name.endswith(".cgi")):
                continue
            path = os.path.join(root, name)
            relative = os.path.relpath(path, PUBLIC)
            try:
                py_compile.compile(path, cfile=tempfile.mktemp(), doraise=True)
                suite.check(relative, True)
            except py_compile.PyCompileError as err:
                suite.check(relative, False, str(err))

    suite.group("index.cgi の設定")
    with io.open(os.path.join(PUBLIC, "index.cgi"), encoding="utf-8") as handle:
        first_line = handle.readline().strip()
    suite.check("1 行目が shebang である", first_line.startswith("#!"), first_line)
    suite.check("python3 を指している", "python3" in first_line, first_line)
    suite.check("実行権限が付いている（755 相当）",
                os.access(os.path.join(PUBLIC, "index.cgi"), os.X_OK),
                "chmod 755 public/index.cgi を実行してください")

    suite.group(".htaccess がソースを隠している")
    with io.open(os.path.join(PUBLIC, ".htaccess"), encoding="utf-8") as handle:
        htaccess = handle.read()
    suite.check("CGI を有効にしている", "AddHandler cgi-script .cgi" in htaccess)
    for extension in ("py", "ini", "sql", "md"):
        suite.check(".%s を拒否している" % extension, extension in htaccess)
    suite.check("app/ にも拒否設定がある",
                os.path.isfile(os.path.join(PUBLIC, "app", ".htaccess")))

    suite.group("秘密情報を同梱していない")
    suite.check("config.ini が public/ に無い",
                not os.path.exists(os.path.join(PUBLIC, "config.ini")),
                "config.ini はサーバ上で作成します。リポジトリには置きません。")
    suite.check("private/ が public/ に無い",
                not os.path.exists(os.path.join(PUBLIC, "private")))
    with io.open(os.path.join(PUBLIC, "config.ini.sample"), encoding="utf-8") as handle:
        sample = handle.read()
    suite.check("見本の招待コードが空である", "invite_code =\n" in sample or
                "invite_code = \n" in sample or sample.rstrip().endswith("auto_migrate = true"))
