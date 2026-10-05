-- auto_migrate = true なら初回アクセス時に自動実行されるので、通常は手動実行不要。
-- phpMyAdmin から流し込みたい場合はこのファイルを使う（users を先に作ること）。

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username       VARCHAR(32)     NOT NULL,
  display_name   VARCHAR(64)     NOT NULL DEFAULT '',
  password_hash  VARCHAR(255)    NOT NULL,
  is_admin       TINYINT(1)      NOT NULL DEFAULT 0,
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  failed_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  locked_until   DATETIME            NULL,
  created_at     DATETIME        NOT NULL,
  last_login_at  DATETIME            NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS games (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  title        VARCHAR(255)    NOT NULL,
  title_kana   VARCHAR(255)    NOT NULL DEFAULT '',
  platform     VARCHAR(64)     NOT NULL DEFAULT '',
  genre        VARCHAR(64)     NOT NULL DEFAULT '',
  maker        VARCHAR(128)    NOT NULL DEFAULT '',
  release_date DATE                NULL,
  status       VARCHAR(16)     NOT NULL DEFAULT '未プレイ',
  rating       TINYINT UNSIGNED    NULL,
  play_hours   DECIMAL(6,1)        NULL,
  own_type     VARCHAR(16)     NOT NULL DEFAULT '',
  tags         VARCHAR(255)    NOT NULL DEFAULT '',
  note         TEXT                NULL,
  created_at   DATETIME        NOT NULL,
  updated_at   DATETIME        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  KEY idx_user_updated (user_id, updated_at),
  KEY idx_title (title),
  KEY idx_platform (platform),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
