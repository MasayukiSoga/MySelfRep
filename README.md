# ゲーム情報管理アプリ

さくらのレンタルサーバ（共用プラン）にアップロードするだけで公開できる、
ブラウザからゲーム情報を**登録・修正・削除・問合**できる Python アプリです。
スマートフォンのブラウザでもそのまま使えます。

## 特徴

- **追加インストールがほぼ不要** — Python 標準ライブラリ＋MySQL ドライバ 1 つだけ
- **フレームワーク不要** — Apache の CGI として動くので、設置は FTP アップロードのみ
- **`cgi` モジュール非依存** — Python 3.13 で削除されたモジュールを使っていないため、
  サーバ側の Python が更新されても壊れません（Python 3.8 以降で動作）
- **スマホ対応** — 1 カラムのカード表示、ダークモード対応、押しやすいボタン

## 画面と機能

| 機能 | 内容 |
| --- | --- |
| 問合（一覧・検索） | キーワード（タイトル／よみ／メーカー／タグ／メモ）、機種、状態で絞り込み。並び替え・ページング付き |
| 登録 | タイトル必須。機種・ジャンル・メーカー・発売日・状態・評価・プレイ時間・所有形態・タグ・メモ |
| 修正 | 一覧／詳細から編集。入力エラーは項目ごとに表示 |
| 削除 | 確認画面を経由。POST + CSRF トークンがないと実行されません |
| CSV 書き出し | 絞り込み結果をそのまま Excel で開ける UTF-8（BOM 付き）で出力 |
| ログイン | 共有パスワード 1 本。署名付き Cookie で 14 日間保持 |

## 設置手順

### 1. データベースを用意する

さくらのサーバコントロールパネル →「Webサイト/データ」→「データベース」で
MySQL データベースを 1 つ作成します。表示される次の値を控えてください。

- データベースサーバ（例: `mysql3001.db.sakura.ne.jp`）
- データベース名（例: `yourname_game`）
- ユーザ名 / パスワード

> 文字コードは **UTF-8（utf8mb4）** を選んでください。

### 2. ファイルをアップロードする

`public/` の**中身**を FTP で公開ディレクトリ配下に置きます（例: `~/www/game/`）。

```
~/www/game/
├── index.cgi          ← パーミッション 755
├── .htaccess
├── app/               ← アプリ本体（Web からは見えません）
├── static/style.css
├── tools/make_password.py
├── schema.sql
├── config.ini         ← 次の手順で作成（パーミッション 600）
└── requirements.txt
```

`index.cgi` のパーミッションを **755** にしてください。

### 3. `index.cgi` の 1 行目をサーバに合わせる

SSH でログインして Python の場所を確認します。

```sh
which python3
```

表示されたパスを `index.cgi` の 1 行目（shebang）に書きます。

```python
#!/usr/local/bin/python3
```

### 4. MySQL ドライバを入れる

```sh
cd ~/www/game
python3 -m pip install -t vendor PyMySQL
```

`vendor/` に入れるのでサーバ全体を汚しません。PyMySQL は純 Python 実装なので
コンパイルが走らず、共用サーバでも問題なく入ります。

### 5. 設定ファイルを作る

```sh
cd ~/www/game
cp config.ini.sample config.ini
python3 tools/make_password.py      # secret_key と password_hash を生成
```

出力された 3 行を `config.ini` の `[app]` に貼り付け、
`[database]` に手順 1 の接続情報を記入します。

```sh
chmod 600 config.ini
```

### 6. ブラウザで開く

`https://あなたのドメイン/game/` にアクセスします。
`games` テーブルは初回アクセス時に自動作成されます
（手動で作る場合は `schema.sql` を phpMyAdmin から実行してください）。

## 設定項目（config.ini）

| 項目 | 説明 |
| --- | --- |
| `[app] title` | 画面に表示するアプリ名 |
| `[app] secret_key` | Cookie 署名用の秘密鍵。空なら `private/secret.key` を自動生成 |
| `[app] login_required` | ログイン必須にするか。**インターネット公開時は必ず `true`** |
| `[app] password_hash` | `tools/make_password.py` が出力するハッシュ（推奨） |
| `[app] password` | 平文パスワード。お試し用。設定すると画面に警告が出ます |
| `[app] per_page` | 一覧 1 ページあたりの件数（5〜100） |
| `[app] auto_migrate` | 起動時に `games` テーブルを自動作成するか |

## セキュリティ上の作り

- **SQL インジェクション対策** — 値は全てプレースホルダ経由。並び替えのカラム名は
  サーバ側の許可リストから選ぶ方式で、ユーザ入力を SQL に連結しません
- **XSS 対策** — HTML に出力する全ての値を `html.escape` でエスケープ
- **CSRF 対策** — 二重送信 Cookie 方式。登録・修正・削除・ログアウトは POST のみ受け付けます
- **パスワード** — PBKDF2-HMAC-SHA256（20 万回）で保存。比較は定数時間
- **Cookie** — `HttpOnly` / `SameSite=Lax`、HTTPS 接続時は `Secure` を付与
- **ソース非公開** — `.htaccess` で `.py` `.ini` `.sql` `.md` を拒否。`app/` と `tools/` は
  ディレクトリ単位でも拒否（二重防御）
- **エラー内容の隠蔽** — 例外の詳細はサーバのエラーログにのみ出力し、画面には出しません

## 構成

```
public/
├── index.cgi            入口（これだけが Web から実行される）
├── app/
│   ├── main.py          全体の組み立て・例外処理
│   ├── web.py           CGI のリクエスト/レスポンス処理
│   ├── config.py        config.ini の読み込み
│   ├── db.py            MySQL 接続（PyMySQL / MySQLdb / mysql-connector に対応）
│   ├── auth.py          ログインと CSRF
│   ├── games.py         登録・修正・削除・問合（SQL とバリデーション）
│   ├── templates.py     HTML 生成
│   └── views.py         画面ごとの処理とルーティング
├── static/style.css
├── tools/make_password.py
└── schema.sql
```

## 困ったとき

| 症状 | 対処 |
| --- | --- |
| 500 Internal Server Error | `index.cgi` の 1 行目のパスとパーミッション 755 を確認 |
| 「MySQL ドライバが未導入です」 | 手順 4 の `pip install -t vendor PyMySQL` を実行 |
| 「セットアップが未完了です」 | `config.ini` の設置と記入内容を確認 |
| 文字化けする | データベースの文字コードが utf8mb4 か確認 |
| その他のエラー | サーバのエラーログに詳細が出力されます |
