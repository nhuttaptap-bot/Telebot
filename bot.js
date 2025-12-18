const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY;
const API_URL = 'https://bcrapj-6dju.onrender.com/data';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== FILE =====
const USERS_FILE = './users.json';
const KEYS_FILE = './keys.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '{}');

let users = JSON.parse(fs.readFileSync(USERS_FILE));
let keys = JSON.parse(fs.readFileSync(KEYS_FILE));

const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const saveKeys = () => fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));

const isAdmin = (id) => users[id]?.role === 'admin';
const isLogin = (id) => !!users[id];

// ===== AUTO TIMER (THEO USER) =====
let autoTimers = {}; // { userId: { C01: timer } }
let lastResults = {};
let predictions = {};

// ===== UTILS =====
const randomPredict = () => (Math.random() < 0.5 ? 'B' : 'P');

async function getData() {
  try {
    const res = await axios.get(API_URL, { timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
}

// ===== AUTH CHECK =====
function checkExpire(userId) {
  const key = users[userId]?.key;
  if (!key || users[userId].role === 'admin') return true;
  if (!keys[key]) return false;
  if (Date.now() > keys[key].expire) {
    delete users[userId];
    saveUsers();
    return false;
  }
  return true;
}

// ===== LOGIN =====
bot.onText(/^\/key (.+)/, (msg, m) => {
  const id = msg.chat.id;
  const key = m[1];

  // ADMIN
  if (key === ADMIN_KEY) {
    users[id] = { role: 'admin', key, history: {} };
    saveUsers();
    return bot.sendMessage(id, '👑 Đăng nhập ADMIN thành công');
  }

  // USER
  const info = keys[key];
  if (!info) return bot.sendMessage(id, '❌ Key không tồn tại');
  if (Date.now() > info.expire) return bot.sendMessage(id, '⛔ Key đã hết hạn');

  users[id] = { role: 'user', key, history: {} };
  saveUsers();

  const days = Math.ceil((info.expire - Date.now()) / 86400000);
  bot.sendMessage(id, `✅ Đăng nhập thành công\n⏳ Còn ${days} ngày`);
});

// ===== ADMIN =====
bot.onText(/^\/genkey (\d+)/, (msg, m) => {
  const id = msg.chat.id;
  if (!isAdmin(id)) return;

  const days = +m[1];
  const key = 'U-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  keys[key] = { expire: Date.now() + days * 86400000 };
  saveKeys();

  bot.sendMessage(id, `🔑 ${key}\n⏳ ${days} ngày`);
});

bot.onText(/^\/listkey$/, (msg) => {
  const id = msg.chat.id;
  if (!isAdmin(id)) return;

  let text = '📦 KEY\n';
  for (const k in keys) {
    const d = Math.ceil((keys[k].expire - Date.now()) / 86400000);
    text += `${k} | ${d} ngày\n`;
  }
  bot.sendMessage(id, text || 'Trống');
});

bot.onText(/^\/delkey (.+)/, (msg, m) => {
  const adminId = msg.chat.id;
  if (!isAdmin(adminId)) return;

  const key = m[1];
  if (!keys[key]) {
    return bot.sendMessage(adminId, '❌ Key không tồn tại');
  }

  // Logout user đang dùng key
  for (const uid in users) {
    if (users[uid].key === key) {
      if (autoTimers[uid]) {
        for (const t in autoTimers[uid]) {
          clearInterval(autoTimers[uid][t]);
        }
        delete autoTimers[uid];
      }
      delete users[uid];
    }
  }

  delete keys[key];
  saveUsers();
  saveKeys();

  bot.sendMessage(adminId, `🗑️ Đã xoá key: ${key}`);
});

// ===== TABLE =====
for (let i = 1; i <= 16; i++) {
  const table = `C${String(i).padStart(2, '0')}`;

  bot.onText(new RegExp(`^/${table.toLowerCase()}$`), async (msg) => {
    const id = msg.chat.id;
    if (!isLogin(id)) return bot.sendMessage(id, '🔐 Nhập /key');
    if (!checkExpire(id)) return bot.sendMessage(id, '⛔ Key hết hạn');

    autoTimers[id] ||= {};
    users[id].history[table] ||= [];

    if (autoTimers[id][table]) {
      return bot.sendMessage(id, '⚠️ Bàn này đang chạy');
    }

    const data = await getData();
    if (!data) return bot.sendMessage(id, '❌ API lỗi');

    const t = data.find(x => x.ban === table);
    if (!t) return;

    predictions[`${id}-${table}`] = randomPredict();
    lastResults[`${id}-${table}`] = t.ket_qua;

    bot.sendMessage(id, `🎰 ${table}\n📊 ${t.ket_qua}\n🎯 Dự đoán: ${predictions[`${id}-${table}`]}`);

    autoTimers[id][table] = setInterval(async () => {
      const d = await getData();
      const tb = d?.find(x => x.ban === table);
      if (!tb || tb.ket_qua === lastResults[`${id}-${table}`]) return;

      const result = tb.ket_qua.slice(-1).toUpperCase();
      const ok = result === predictions[`${id}-${table}`];

      users[id].history[table].push(ok);
      if (users[id].history[table].length > 20)
        users[id].history[table].shift();

      saveUsers();

      lastResults[`${id}-${table}`] = tb.ket_qua;
      predictions[`${id}-${table}`] = randomPredict();

      bot.sendMessage(id, `🔔 ${table} ra ${result} ${ok ? '✅' : '❌'}`);
    }, 3000);
  });
}

// ===== HISTORY =====
bot.onText(/^\/history (C\d{2})/, (msg, m) => {
  const id = msg.chat.id;
  if (!isLogin(id)) return;

  const h = users[id].history[m[1]] || [];
  const win = h.filter(Boolean).length;
  const lose = h.length - win;

  bot.sendMessage(id, `📊 ${m[1]}\n✅ ${win}\n❌ ${lose}`);
});

// ===== STOP =====
bot.onText(/^\/stop(?: (C\d{2}))?$/, (msg, m) => {
  const id = msg.chat.id;
  if (!autoTimers[id]) return;

  if (m[1]) {
    clearInterval(autoTimers[id][m[1]]);
    delete autoTimers[id][m[1]];
    return bot.sendMessage(id, `🛑 Dừng ${m[1]}`);
  }

  for (const t in autoTimers[id]) clearInterval(autoTimers[id][t]);
  delete autoTimers[id];

  bot.sendMessage(id, '🛑 Dừng toàn bộ');
});

// ===== HELP =====
bot.onText(/^\/help$/, (msg) => {
  const id = msg.chat.id;
  let text =
    '📖 USER\n' +
    '/key <key>\n' +
    '/c01 → /c16\n' +
    '/history Cxx\n' +
    '/stop';

  if (isAdmin(id)) {
    text +=
      '\n\n👑 ADMIN\n' +
      '/genkey <ngày>\n' +
      '/listkey';
  }

  bot.sendMessage(id, text);
});

console.log('🚀 BOT PRO ĐANG CHẠY');