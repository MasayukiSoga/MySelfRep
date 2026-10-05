# -*- coding: utf-8 -*-
"""入力検証の共通例外。"""


class ValidationError(Exception):
    """項目名 -> メッセージ の辞書を持つ検証エラー。"""

    def __init__(self, errors):
        super(ValidationError, self).__init__("入力内容を確認してください")
        self.errors = errors
