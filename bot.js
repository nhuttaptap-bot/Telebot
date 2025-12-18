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

const isLogin = (id) => !!users[id];
const isAdmin = (id) => users[id]?.role === 'admin';

// ===== RANDOM (sẽ thay thuật toán sau) =====
const randomPredict = () => (Math.random() < 0.5 ? 'B' : 'P');

// ===== API =====
async function getData() {
  try {
    const res = await axios.get(API_URL, { timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
}

// ===== /START =====
bot.onText(/^\/start$/, (msg) => {
  const id = msg.chat.id;

  if (isLogin(id)) {
    return bot.sendMessage(id, '📖 Dùng /help để xem hướng dẫn');
  }

  bot.sendMessage(
    id,
    `🤖 CHÀO MỪNG\n\n🔐 Vui lòng nhập key để tiếp tục\n\n👉 /key <MÃ_KEY>`
  );
});

// ===== LOGIN KEY =====
bot.onText(/^\/key (.+)/, (msg, m) => {
  const id = msg.chat.id;
  const key = m[1].trim();

  // ADMIN
  if (key === ADMIN_KEY) {
    users[id] = { role: 'admin', history: {} };
    saveUsers();
    return bot.sendMessage(
      id,
      `👑 ĐĂNG NHẬP ADMIN THÀNH CÔNG\n\n📖 Dùng /help để xem bảng điều khiển`
    );
  }

  // USER
  const info = keys[key];
  if (!info) return bot.sendMessage(id, '❌ Key không tồn tại');
  if (Date.now() > info.expire) return bot.sendMessage(id, '⛔ Key đã hết hạn');

  users[id] = { role: 'user', history: {} };
  saveUsers();

  const days = Math.ceil((info.expire - Date.now()) / 86400000);
  bot.sendMessage(
    id,
    `✅ ĐĂNG NHẬP THÀNH CÔNG\n⏳ Key còn ${days} ngày\n\n📖 Dùng /help để xem hướng dẫn`
  );
});

// ===== ADMIN =====
bot.onText(/^\/genkey (\d+)/, (msg, m) => {
  const id = msg.chat.id;
  if (!isAdmin(id)) return;

  const days = parseInt(m[1]);
  const key = 'U-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  keys[key] = { expire: Date.now() + days * 86400000 };
  saveKeys();

  bot.sendMessage(id, `🔑 KEY: ${key}\n⏳ ${days} ngày`);
});

bot.onText(/^\/listkey$/, (msg) => {
  const id = msg.chat.id;
  if (!isAdmin(id)) return;

  let text = '📦 DANH SÁCH KEY\n\n';
  for (const k in keys) {
    const d = Math.ceil((keys[k].expire - Date.now()) / 86400000);
    text += `${k} | ${d} ngày\n`;
  }
  bot.sendMessage(id, text || 'Trống');
});

bot.onText(/^\/delkey (.+)/, (msg, m) => {
  const id = msg.chat.id;
  if (!isAdmin(id)) return;

  delete keys[m[1]];
  saveKeys();
  bot.sendMessage(id, '🗑️ Đã xoá key');
});

// ===== AUTO TABLE =====
let autoTimers = {};
let lastResults = {};
let predictions = {};

for (let i = 1; i <= 16; i++) {
  const table = `C${String(i).padStart(2, '0')}`;

  bot.onText(new RegExp(`^/${table.toLowerCase()}$`), async (msg) => {
    const id = msg.chat.id;
    if (!isLogin(id)) return bot.sendMessage(id, '🔐 Vui lòng nhập /key');

    const data = await getData();
    if (!data) return bot.sendMessage(id, '❌ API lỗi');

    const t = data.find(x => x.ban === table);
    if (!t) return;

    const predict = randomPredict();
    predictions[table] = predict;
    lastResults[table] = t.ket_qua;

    users[id].history[table] ||= [];
    saveUsers();

    bot.sendMessage(
      id,
      `🎰 BÀN: ${table}
🕒 PHIÊN: ${t.time}

📊 LỊCH SỬ:
${t.ket_qua}

🎯 DỰ ĐOÁN:
${predict === 'B' ? 'BANKER 🏦' : 'PLAYER 👤'}

📈 ĐỘ TIN CẬY:
50%`
    );

    if (!autoTimers[table]) {
      autoTimers[table] = setInterval(async () => {
        const d = await getData();
        const tb = d?.find(x => x.ban === table);
        if (!tb || tb.ket_qua === lastResults[table]) return;

        const result = tb.ket_qua.slice(-1).toUpperCase();
        const ok = result === predictions[table];

        users[id].history[table].push(ok);
        if (users[id].history[table].length > 20)
          users[id].history[table].shift();

        saveUsers();

        lastResults[table] = tb.ket_qua;
        predictions[table] = randomPredict();

        bot.sendMessage(
          id,
          `🔔 ${table} CÓ KẾT QUẢ

📊 Kết quả: ${result === 'B' ? 'BANKER 🏦' : 'PLAYER 👤'}
🎯 Dự đoán: ${ok ? 'ĐÚNG ✅' : 'SAI ❌'}`
        );
      }, 3000);
    }
  });
}

// ===== HISTORY =====
bot.onText(/^\/history (C\d{2})$/, (msg, m) => {
  const id = msg.chat.id;
  if (!isLogin(id)) return;

  const h = users[id].history[m[1]] || [];
  const win = h.filter(x => x).length;
  const lose = h.length - win;

  bot.sendMessage(
    id,
    `📊 ${m[1]}\n✅ Đúng: ${win}\n❌ Sai: ${lose}`
  );
});

// ===== STOP =====
bot.onText(/^\/stop(?: (C\d{2}))?$/, (msg, m) => {
  const id = msg.chat.id;
  if (!isLogin(id)) return;

  if (m[1]) {
    clearInterval(autoTimers[m[1]]);
    delete autoTimers[m[1]];
    return bot.sendMessage(id, `🛑 Đã dừng ${m[1]}`);
  }

  for (const t in autoTimers) clearInterval(autoTimers[t]);
  autoTimers = {};
  bot.sendMessage(id, '🛑 Đã dừng toàn bộ');
});

// ===== HELP =====
bot.onText(/^\/help$/, (msg) => {
  const id = msg.chat.id;
  if (!isLogin(id)) return;

  let text =
`📖 HƯỚNG DẪN USER

🎰 DỰ ĐOÁN
/c01 → Auto bàn C01
...
/c16 → Auto bàn C16

📊 THỐNG KÊ
/history C01 → Xem đúng / sai

🛑 ĐIỀU KHIỂN
/stop → Dừng tất cả
/stop C01 → Dừng riêng`;

  if (isAdmin(id)) {
    text +=
`
  
👑 ADMIN
/genkey <ngày>
/listkey
/delkey <key>`;
  }

  bot.sendMessage(id, text);
});

console.log('🚀 BOT CHẠY ỔN ĐỊNH');
