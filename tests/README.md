# ローカル検証

アップロードする前に、PC 上で動作を確かめるための仕組みです。
**MySQL は不要**で、Python 標準ライブラリの `sqlite3` だけで動きます。
追加インストールは何もいりません。

## 1. テストを実行する

```sh
cd tests
python3 run_tests.py
```

200 項目あまりを 1 秒以内に確認して、最後に結果をまとめて表示します。
失敗した項目は一覧で表示されるので、どこが壊れたかすぐ分かります。

```
全 231 件成功  (0.4 秒)
```

一部だけ実行したいときは名前を指定します。

```sh
python3 run_tests.py preflight   # 設置前チェックだけ
python3 run_tests.py basic       # 基本操作だけ
python3 run_tests.py multi       # 複数人利用だけ
python3 run_tests.py security    # セキュリティと異常系だけ
python3 run_tests.py serve       # ローカル確認用サーバだけ
```

### 確認している内容

| テスト | 内容 |
| --- | --- |
| 設置前チェック | アップロードするファイルが揃っているか、文法が通るか、`index.cgi` の shebang と実行権限、`.htaccess` がソースを隠しているか、秘密情報を同梱していないか |
| 基本操作 | 登録 → 問合 → 修正 → 削除 → CSV の流れ、ページング、入力エラー、セッションの改ざん |
| 複数人利用 | 利用者ごとのデータ分離、他人のデータへの直接アクセス拒否、管理者権限、締め出し防止、パスワード変更、ログイン試行制限 |
| セキュリティと異常系 | XSS、SQL インジェクション、CSRF、設定不備の案内 |
| ローカル確認用サーバ | 振り分け、`static/` 外の配信拒否、ブラウザからの一連の操作 |

## 2. ブラウザで実際に触る

```sh
cd tests
python3 serve_local.py
```

`http://localhost:8800/index.cgi` が開きます。表示される**招待コード**で
アカウントを作れば、本番と同じ画面を操作できます。

```sh
python3 serve_local.py --port 9000     # ポートを変える
python3 serve_local.py --reset         # 入力したデータを消してやり直す
python3 serve_local.py --no-browser    # ブラウザを自動で開かない
```

入力したデータは `tests/local_data/local.sqlite3` に残るので、
サーバを止めても次に続けられます（このフォルダは Git 管理外です）。

> スマートフォンでの見え方を確かめたいときは、ブラウザの開発者ツールで
> 画面幅を 400px 程度に狭めてください。

## 3. 問題なければアップロードする

`public/` の中身をサーバに上げます。手順はリポジトリ直下の
[README.md](../README.md) を参照してください。

## 本番（MySQL）との違い

ローカルは SQLite で代用しているため、次の点は本番と差が出ます。
**設置前に一通り動くか確かめる**用途と割り切ってください。

- **型の厳密さ** — SQLite は型が緩いため、桁あふれや型不一致は検出されません
- **照合順序** — 大文字小文字や全角半角の一致判定が MySQL と異なります
- **移行処理** — `ALTER TABLE` によるテーブル移行は SQLite では確認できません
- **接続エラー** — 接続情報の誤りや権限不足は、実際のサーバでしか分かりません

テーブル定義は本番の `public/schema.sql` をその場で SQLite 用に変換して
使っています（`sqlite_backend.py`）。定義を二重に持っていないので、
`schema.sql` を直せばテストにも自動で反映されます。

## ファイル構成

```
tests/
├── run_tests.py          テストをまとめて実行する入口
├── serve_local.py        ブラウザ確認用の簡易サーバ
├── runner.py             結果表示の仕組み
├── client.py             アプリを呼び出す擬似ブラウザ
├── sqlite_backend.py     schema.sql を SQLite 用に変換して差し替える
├── test_preflight.py     設置前チェック
├── test_basic.py         基本操作
├── test_multiuser.py     複数人利用
├── test_security.py      セキュリティと異常系
└── test_serve_local.py   ローカル確認用サーバ
```

テストの書き方は `suite.check("説明", 条件)` だけです。

```python
suite.group("他人のデータへの直接アクセスを拒否する")
suite.check("詳細は 404", alice.get("detail", id=3).code == 404)
```
