# -*- coding: utf-8 -*-
"""最小限のテスト実行基盤。外部ライブラリは使わない。"""
import sys
import time
import traceback

GREEN, RED, YELLOW, GRAY, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[0m"
if not sys.stdout.isatty():
    GREEN = RED = YELLOW = GRAY = RESET = ""


class Suite(object):
    def __init__(self, name):
        self.name = name
        self.groups = []

    def group(self, title):
        self.groups.append((title, []))
        return self

    def check(self, label, condition, detail=""):
        if not self.groups:
            self.group("その他")
        self.groups[-1][1].append((label, bool(condition), str(detail)))
        return bool(condition)


def run(suites):
    """(名前, 関数) のリストを順に実行して結果を表示する。"""
    total = failed = 0
    started = time.time()
    failures = []

    for name, function in suites:
        suite = Suite(name)
        print("\n%s%s%s" % (YELLOW, name, RESET))
        try:
            function(suite)
        except Exception:
            suite.group("実行中の例外")
            suite.check("テストが完走する", False, traceback.format_exc())

        for title, checks in suite.groups:
            if not checks:
                continue
            print("  %s%s%s" % (GRAY, title, RESET))
            for label, passed, detail in checks:
                total += 1
                if passed:
                    print("    %sOK%s   %s" % (GREEN, RESET, label))
                else:
                    failed += 1
                    failures.append((name, title, label, detail))
                    print("    %sNG%s   %s" % (RED, RESET, label))
                    if detail:
                        for line in detail.strip().splitlines()[:6]:
                            print("         %s%s%s" % (GRAY, line, RESET))

    elapsed = time.time() - started
    print("\n" + "-" * 56)
    if failed:
        print("%s失敗 %d 件%s / 全 %d 件  (%.1f 秒)"
              % (RED, failed, RESET, total, elapsed))
        print("\n失敗した項目:")
        for name, title, label, _detail in failures:
            print("  - [%s] %s / %s" % (name, title, label))
    else:
        print("%s全 %d 件成功%s  (%.1f 秒)" % (GREEN, total, RESET, elapsed))
    return 1 if failed else 0
