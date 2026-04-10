-- =============================================
-- قاعدة بيانات نظام الأرشفة — كلية الصيدلة
-- =============================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─── المستخدمون ───────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE,
  full_name   TEXT    NOT NULL,
  password    TEXT    NOT NULL,          -- bcrypt hash
  role        TEXT    NOT NULL DEFAULT 'admin',
                                         -- dean | admin | faculty | student | readonly
  department  TEXT,
  email       TEXT,
  phone       TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',  -- active | inactive | suspended
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  last_login  TEXT
);

-- ─── الطلاب ───────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_code    TEXT    NOT NULL UNIQUE,   -- e.g. 2021-PH-001
  full_name       TEXT    NOT NULL,
  department      TEXT,
  academic_year   TEXT,
  gpa             REAL    DEFAULT 0,
  status          TEXT    DEFAULT 'active',  -- active | graduate | suspended
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  enroll_year     INTEGER,
  advisor         TEXT,
  created_at      TEXT    DEFAULT (datetime('now','localtime'))
);

-- ─── الوثائق ──────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  doc_type        TEXT    NOT NULL,
                  -- shahada | qaboul | idari | bahth | aqd | other
  folder_path     TEXT    NOT NULL,          -- المسار الفعلي على القرص
  file_name       TEXT    NOT NULL,          -- اسم الملف المحفوظ
  file_size       INTEGER DEFAULT 0,         -- بالبايت
  pages           INTEGER DEFAULT 1,
  ocr_text        TEXT,                      -- النص المستخرج
  linked_type     TEXT,                      -- student | staff | general
  linked_id       INTEGER,                   -- foreign key اختياري
  linked_name     TEXT,
  dpi             INTEGER DEFAULT 300,
  scanned_by      INTEGER REFERENCES users(id),
  scan_date       TEXT    DEFAULT (datetime('now','localtime')),
  status          TEXT    DEFAULT 'done'     -- done | ocr_pending | error
);

-- ─── سجل النشاط ───────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  details     TEXT,
  doc_id      INTEGER REFERENCES documents(id),
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);

-- ─── إعدادات النظام ───────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- ─── بيانات أولية ─────────────────────────
INSERT OR IGNORE INTO users (username, full_name, password, role, department)
VALUES ('admin', 'مدير النظام', '$2b$10$defaulthash', 'dean', 'إدارة الكلية');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('archive_root',    'C:/PharmacyArchive'),
  ('scanner_dpi',     '300'),
  ('ocr_language',    'ara'),
  ('auto_classify',   '1'),
  ('backup_path',     'C:/PharmacyArchive/Backup'),
  ('college_name',    'كلية الصيدلة — جامعة البصرة'),
  ('app_version',     '1.0.0');

-- ─── فهارس للأداء ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_docs_type    ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_linked  ON documents(linked_id, linked_type);
CREATE INDEX IF NOT EXISTS idx_docs_date    ON documents(scan_date);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(student_code);
CREATE INDEX IF NOT EXISTS idx_log_date     ON activity_log(created_at);
