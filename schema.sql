CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT DEFAULT '', age INTEGER, stage TEXT DEFAULT '', city TEXT DEFAULT '', interests TEXT DEFAULT '',
  subjects TEXT DEFAULT '', skills TEXT DEFAULT '', goal TEXT DEFAULT '', target_university TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новый диалог',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS universities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT NOT NULL,
  programs TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_universities_name ON universities(name);
INSERT OR IGNORE INTO universities(name,city,description,programs) VALUES
  ('ННГУ им. Н. И. Лобачевского','Нижний Новгород','Демо-запись для прототипа. Актуальные программы и условия необходимо сверять с официальным сайтом вуза.','Программная инженерия;Прикладная информатика;Информационная безопасность'),
  ('НИУ ВШЭ — Нижний Новгород','Нижний Новгород','Демо-запись для прототипа. Актуальные программы, проходные баллы и условия необходимо сверять с официальным сайтом кампуса ВШЭ в Нижнем Новгороде.','Программная инженерия;Прикладная математика и информатика;Компьютерные науки и анализ данных;Бизнес-информатика'),
  ('НГТУ им. Р. Е. Алексеева','Нижний Новгород','Демо-запись для прототипа. Актуальные программы и условия необходимо сверять с официальным сайтом вуза.','Информатика и вычислительная техника;Радиотехника;Автоматизация технологических процессов');
