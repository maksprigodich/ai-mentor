require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const db = new Database(path.join(__dirname, 'ai-mentor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Сессия истекла' }); }
}
function getProfile(userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || null;
}
function getChats(userId) {
  return db.prepare('SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
}
function getMessages(chatId, userId) {
  return db.prepare(`SELECT m.id, m.role, m.content, m.created_at FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.chat_id=? AND c.user_id=? ORDER BY m.id`).all(chatId, userId);
}

app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Укажи корректный email' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Такой аккаунт уже существует' });
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email, hash);
  const user = { id: info.lastInsertRowid, email };
  return res.json({ token: sign(user), user });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id,email,password_hash FROM users WHERE email=?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Неверный email или пароль' });
  return res.json({ token: sign(user), user: { id: user.id, email: user.email } });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,email,created_at FROM users WHERE id=?').get(req.user.id);
  res.json({ user, profile: getProfile(req.user.id) });
});

app.put('/api/account/password', auth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 6) return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
  const user = db.prepare('SELECT id,password_hash FROM users WHERE id=?').get(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ error: 'Текущий пароль неверен' });
  if (await bcrypt.compare(newPassword, user.password_hash)) return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  res.json({ ok: true });
});

app.put('/api/account/email', auth, async (req, res) => {
  const password = String(req.body.password || '');
  const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(newEmail)) return res.status(400).json({ error: 'Укажи корректный email' });
  const user = db.prepare('SELECT id,email,password_hash FROM users WHERE id=?').get(req.user.id);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Пароль неверен' });
  if (newEmail === user.email) return res.status(400).json({ error: 'Это уже твой текущий email' });
  if (db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(newEmail, req.user.id)) return res.status(409).json({ error: 'Этот email уже используется' });
  db.prepare('UPDATE users SET email=? WHERE id=?').run(newEmail, req.user.id);
  const updated = { id: req.user.id, email: newEmail };
  res.json({ token: sign(updated), user: updated });
});

app.get('/api/account/export', auth, (req, res) => {
  const user = db.prepare('SELECT id,email,created_at FROM users WHERE id=?').get(req.user.id);
  const chats = getChats(req.user.id).map(c => ({ ...c, messages: getMessages(c.id, req.user.id) }));
  res.json({ exported_at: new Date().toISOString(), user, profile: getProfile(req.user.id), chats });
});

app.delete('/api/account', auth, async (req, res) => {
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id,password_hash FROM users WHERE id=?').get(req.user.id);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Пароль неверен' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  res.json({ ok: true });
});

app.put('/api/profile', auth, (req, res) => {
  const p = req.body || {};
  const fields = {
    name: String(p.name || '').trim(), age: Number(p.age) || null, stage: String(p.stage || '').trim(),
    city: String(p.city || '').trim(), interests: String(p.interests || '').trim(), subjects: String(p.subjects || '').trim(),
    skills: String(p.skills || '').trim(), goal: String(p.goal || '').trim(), target_university: String(p.target_university || '').trim()
  };
  db.prepare(`INSERT INTO profiles(user_id,name,age,stage,city,interests,subjects,skills,goal,target_university)
    VALUES(@user_id,@name,@age,@stage,@city,@interests,@subjects,@skills,@goal,@target_university)
    ON CONFLICT(user_id) DO UPDATE SET name=@name,age=@age,stage=@stage,city=@city,interests=@interests,subjects=@subjects,skills=@skills,goal=@goal,target_university=@target_university,updated_at=CURRENT_TIMESTAMP`).run({ user_id: req.user.id, ...fields });
  res.json({ profile: getProfile(req.user.id) });
});

app.get('/api/universities', auth, (req, res) => {
  const city = String(req.query.city || '').trim().toLowerCase();
  const rows = db.prepare('SELECT * FROM universities ORDER BY city,name').all();
  res.json({ universities: city ? rows.filter(x => x.city.toLowerCase().includes(city)) : rows });
});

app.post('/api/chats', auth, (req, res) => {
  const title = String(req.body.title || 'Новый диалог').trim().slice(0, 120) || 'Новый диалог';
  const info = db.prepare('INSERT INTO chats(user_id,title) VALUES(?,?)').run(req.user.id, title);
  res.json({ chat: db.prepare('SELECT id,title,created_at,updated_at FROM chats WHERE id=?').get(info.lastInsertRowid) });
});

app.get('/api/chats', auth, (req, res) => res.json({ chats: getChats(req.user.id) }));
app.get('/api/chats/:id/messages', auth, (req, res) => res.json({ messages: getMessages(Number(req.params.id), req.user.id) }));
app.delete('/api/chats/:id', auth, (req, res) => {
  const chatId = Number(req.params.id);
  const chat = db.prepare('SELECT id FROM chats WHERE id=? AND user_id=?').get(chatId, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  db.prepare('DELETE FROM chats WHERE id=?').run(chatId);
  res.json({ ok: true });
});

function buildSystemPrompt(profile, webContext) {
  const target = (profile?.target_university || '').trim();
  const targetNote = target ? `\n\nЦЕЛЕВОЙ ВУЗ ПОЛЬЗОВАТЕЛЯ: "${target}". Если ниже в открытых источниках есть релевантные результаты по нему — используй именно их. Если релевантных результатов нет, честно скажи, что не нашёл свежих данных по этому конкретному вузу, и не подменяй его каким-то другим вузом или направлением.` : '';
  const sourcesBlock = webContext
    ? `\n\nАКТУАЛЬНЫЕ ДАННЫЕ ИЗ ОТКРЫТЫХ ИСТОЧНИКОВ (результаты веб-поиска по сообщению пользователя; это единственный источник конкретных фактов — проходных баллов, программ, сроков, цен):\n${webContext}`
    : `\n\nВеб-поиск по этому сообщению не дал результатов (или временно недоступен) — отвечай только на основе общих знаний, явно предупреди, что не смог проверить актуальные данные, и посоветуй свериться с официальным сайтом.`;
  return `Ты — AI-Mentor, спокойный и практичный наставник по образованию и карьере.\n\nПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:\n${JSON.stringify(profile || {}, null, 2)}${targetNote}${sourcesBlock}\n\nПравила:\n- Проходные баллы, цены, сроки, программы обучения — бери только из блока открытых источников выше, никогда не выдумывай их.\n- Если нужных данных нет в открытых источниках, честно скажи об этом и предложи проверить официальный сайт вуза.\n- Кратко указывай, на какой источник опираешься (по названию сайта), но не перегружай ответ ссылками.\n- Отвечай на русском.\n- Не перегружай ответ: 2–6 коротких абзацев или списков.\n- Если пользователь только начинает путь, объясняй без сложных терминов.\n- Старайся завершать ответ конкретным следующим шагом.\n- Учитывай профиль и не задавай уже известные вопросы.\n- Ты не принимаешь решения за пользователя, а помогаешь сравнить варианты.`;
}

async function searchWeb(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key || !query) return null;
  const domains = String(process.env.SEARCH_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: 5, include_answer: false, ...(domains.length ? { include_domains: domains } : {}) })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return null;
    return results.map((r, i) => `${i + 1}. ${r.title || 'Без названия'}\n   Источник: ${r.url}\n   ${String(r.content || '').slice(0, 500)}`).join('\n\n');
  } catch {
    return null;
  }
}

async function callAI(messages, profile, webContext) {
  const url = process.env.AI_API_URL;
  const key = process.env.AI_API_KEY;
  if (!url || !key) {
    return 'Я уже подключён к серверной части AI-Mentor, но AI-провайдер пока не настроен. Добавь AI_API_KEY в .env — после этого ответы будут генерироваться настоящей моделью, а не скриптом.';
  }
  const body = {
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: buildSystemPrompt(profile, webContext) }, ...messages.slice(-12)],
    temperature: 0.6
  };
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Не удалось получить ответ модели.';
}

app.post('/api/chats/:id/message', auth, async (req, res) => {
  const chatId = Number(req.params.id);
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Пустое сообщение' });
  const chat = db.prepare('SELECT * FROM chats WHERE id=? AND user_id=?').get(chatId, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  db.prepare('INSERT INTO messages(chat_id,role,content) VALUES(?,?,?)').run(chatId, 'user', content);
  db.prepare('UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(chatId);
  const history = getMessages(chatId, req.user.id).map(m => ({ role: m.role, content: m.content }));
  const profile = getProfile(req.user.id);
  const searchQuery = [content, profile?.target_university, profile?.city].filter(Boolean).join(' — ');
  const webContext = await searchWeb(searchQuery);
  try {
    const answer = await callAI(history, profile, webContext);
    db.prepare('INSERT INTO messages(chat_id,role,content) VALUES(?,?,?)').run(chatId, 'assistant', answer);
    db.prepare('UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(chatId);
    res.json({ message: { role: 'assistant', content: answer } });
  } catch (error) {
    console.error('[AI] Ошибка обращения к провайдеру:', error.message);
    res.status(502).json({ error: 'AI-провайдер временно недоступен', details: error.message });
  }
});

app.get('/api/dashboard', auth, (req, res) => {
  const profile = getProfile(req.user.id);
  const chats = getChats(req.user.id);
  const messages = db.prepare(`SELECT COUNT(*) AS count FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.user_id=? AND m.role='user'`).get(req.user.id).count;
  res.json({ profile, stats: { chats: chats.length, userMessages: messages }, chats: chats.slice(0, 5) });
});

app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`AI-Mentor running on http://localhost:${PORT}`));
