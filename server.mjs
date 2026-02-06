import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;

// Storage paths
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'state.json');

await fs.mkdir(publicDir, { recursive: true });
await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/', express.static(publicDir));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9-_\.]/gi, '_')
      .slice(0, 40);
    const name = `${Date.now()}_${base}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// --- Simple JSON store helpers ---
async function readState() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      background: { ...base.background, ...(parsed.background || {}) },
      adBackground: { ...base.adBackground, ...(parsed.adBackground || {}) },
      weather: { ...base.weather, ...(parsed.weather || {}) },
    };
  } catch (e) {
    const initial = defaultState();
    await writeState(initial);
    return initial;
  }
}

async function writeState(state) {
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2));
  broadcast({ type: 'update' });
}

function defaultState() {
  return {
    settings: {
      logoUrl: '',
      sponsorTicker:
        'RELINKED, Ovalweb, Georg, Доширак-Кола — станьте спонсорами и вы! Подробнее в боте прямого эфира.',
      bluebarText: 'News repost >> (panorama thing)',
      lang: 'en',
      clocks: [
        { label: 'Europe-East', tz: 'Europe/Moscow' },
        { label: 'United States', tz: 'America/New_York' },
        { label: 'UTC (World)', tz: 'UTC' },
      ],
    },
    background: { type: 'image', url: '', enabled: true, mode: 'auto' },
    playlist: [
      { type: 'youtube', id: 'dQw4w9WgXcQ', title: 'Sample' },
    ],
    news: [
      {
        title: 'News title / Заголовок',
        description:
          'Описание новости. Добавьте несколько элементов — будет слайдшоу.',
      },
    ],
    tips: [
      'Секция подсказок — добавьте советы и справку.',
      'Элементы переключаются автоматически.',
    ],
    announcements: [
      { label: 'Объявление', text: 'Продам гараж и ещё много текста…' },
      { label: 'Реклама в строке', text: 'оцифровка VHS в одном месте / https://example.com' }
    ],
    weather: {
      cities: ['Moscow', 'New York', 'Tokyo'],
    },
    updatedAt: Date.now(),
  };
}

// --- SSE (Server-Sent Events) ---
const clients = new Set();
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: ping\n`);
  res.write(`data: ok\n\n`);

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(payload) {
  for (const res of clients) {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      clients.delete(res);
    }
  }
}

// --- API ---
app.get('/api/state', async (req, res) => {
  const state = await readState();
  res.json(state);
});

app.put('/api/settings', async (req, res) => {
  const state = await readState();
  state.settings = { ...state.settings, ...req.body };
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.settings);
});

app.put('/api/background', async (req, res) => {
  const state = await readState();
  state.background = { ...state.background, ...req.body };
  // normalize and allow disable
  if (typeof state.background.enabled !== 'boolean') state.background.enabled = true;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.background);
});

// Deprecated: Background Ad endpoint removed

app.put('/api/playlist', async (req, res) => {
  const state = await readState();
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array required' });
  state.playlist = req.body;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.playlist);
});

app.put('/api/news', async (req, res) => {
  const state = await readState();
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array required' });
  state.news = req.body;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.news);
});

app.put('/api/tips', async (req, res) => {
  const state = await readState();
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array required' });
  state.tips = req.body;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.tips);
});

app.put('/api/announcements', async (req, res) => {
  const state = await readState();
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array required' });
  state.announcements = req.body;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.announcements);
});

app.put('/api/weather/cities', async (req, res) => {
  const state = await readState();
  const { cities } = req.body || {};
  if (!Array.isArray(cities)) return res.status(400).json({ error: 'cities[] required' });
  state.weather.cities = cities;
  state.updatedAt = Date.now();
  await writeState(state);
  res.json(state.weather);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// Fallback to admin or viewer if needed
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/viewer', (req, res) => res.sendFile(path.join(publicDir, 'viewer.html')));

// --- Optional Telegram bot integration ---
import pkg from 'node-telegram-bot-api';
const TelegramBot = pkg;

function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const bot = new TelegramBot(token, { polling: true });

  function isAllowed(msg) {
    if (!allowed.length) return true; // allow all if not configured
    return allowed.includes(String(msg.chat.id));
  }

  bot.onText(/^\/start/, (msg) => {
    if (!isAllowed(msg)) return;
    bot.sendMessage(msg.chat.id, 'Broadcast bot online. Commands:\n/ticker <text>\n/blue <text>\n/news <title>|<desc>\n/announce <label>|<text>');
  });

  bot.onText(/^\/ticker\s+([\s\S]+)/, async (msg, match) => {
    if (!isAllowed(msg)) return;
    const state = await readState();
    state.settings.sponsorTicker = match[1].trim();
    state.updatedAt = Date.now();
    await writeState(state);
    bot.sendMessage(msg.chat.id, 'Ticker updated');
  });

  bot.onText(/^\/blue\s+([\s\S]+)/, async (msg, match) => {
    if (!isAllowed(msg)) return;
    const state = await readState();
    state.settings.bluebarText = match[1].trim();
    state.updatedAt = Date.now();
    await writeState(state);
    bot.sendMessage(msg.chat.id, 'Blue bar updated');
  });

  bot.onText(/^\/news\s+([^|]+)\|?([\s\S]*)$/, async (msg, m) => {
    if (!isAllowed(msg)) return;
    const title = m[1].trim();
    const description = (m[2]||'').trim();
    const state = await readState();
    state.news.unshift({ title, description });
    await writeState(state);
    bot.sendMessage(msg.chat.id, 'News item added');
  });

  bot.onText(/^\/announce\s+([^|]+)\|?([\s\S]*)$/, async (msg, m) => {
    if (!isAllowed(msg)) return;
    const label = m[1].trim();
    const text = (m[2]||'').trim();
    const state = await readState();
    state.announcements = state.announcements || [];
    state.announcements.unshift({ label, text });
    await writeState(state);
    bot.sendMessage(msg.chat.id, 'Announcement added');
  });

  console.log('Telegram bot polling enabled');
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Open /admin to manage and /viewer for the broadcast screen');
  initTelegramBot();
});
