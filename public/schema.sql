-- auto_migrate = true なら自動実行されるので、通常は手動実行不要。
-- phpMyAdmin から流し込みたい場合はこのファイルを使う。

CREATE TABLE IF NOT EXISTS games (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
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
  KEY idx_title (title),
  KEY idx_platform (platform),
  KEY idx_status (status),
  KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
