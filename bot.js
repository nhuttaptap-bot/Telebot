// =============================== // TELEGRAM BOT FULL – FINAL VERSION // ADMIN + USER + KEY + HISTORY + STATS + STOP + HELP // ===============================

const TelegramBot = require('node-telegram-bot-api'); const axios = require('axios'); const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN; const ADMIN_KEY = process.env.ADMIN_KEY; const API_URL = 'https://bcrapj-6dju.onrender.com/data';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== FILE ===== const USERS_FILE = './users.json'; const KEYS_FILE = './keys.json'; if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}'); if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '{}'); let users = JSON.parse(fs.readFileSync(USERS_FILE)); let keys = JSON.parse(fs.readFileSync(KEYS_FILE));

// ===== MEMORY ===== let autoTimers = {}; let lastResults = {}; let predictions = {};

const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); const saveKeys = () => fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));

const isAdmin = (id) => users[id]?.role === 'admin'; const isLogin = (id) => users[id];

// ===== PREDICT ===== const randomPredict = () => (Math.random() < 0.5 ? 'B' : 'P');

// ===== API ===== async function getData() { try { const res = await axios.get(API_URL, { timeout: 3000 }); return res.data; } catch { return null; } }

// ===== LOGIN ===== bot.onText(/^/key (.+)/, (msg, m) => { const id = msg.chat.id; const key = m[1];

if (key === ADMIN_KEY) { users[id] = { role: 'admin', key, usedKeys: [key], history: {} }; saveUsers(); return bot.sendMessage(id, '👑 Đăng nhập ADMIN thành công'); }

const info = keys[key]; if (!info) return bot.sendMessage(id, '❌ Key không tồn tại'); if (Date.now() > info.expire) return bot.sendMessage(id, '⛔ Key đã hết hạn');

users[id] = users[id] || { usedKeys: [], history: {} }; users[id].role = 'user'; users[id].key = key; if (!users[id].usedKeys.includes(key)) users[id].usedKeys.push(key); saveUsers();

const days = Math.ceil((info.expire - Date.now()) / 86400000); bot.sendMessage(id, ✅ Đăng nhập thành công\n⏳ Còn ${days} ngày); });

// ===== ADMIN KEY CONTROL ===== bot.onText(/^/genkey (\d+)/, (msg, m) => { const id = msg.chat.id; if (!isAdmin(id)) return; const days = parseInt(m[1]); const key = 'U-' + Math.random().toString(36).substring(2, 10).toUpperCase(); keys[key] = { expire: Date.now() + days * 86400000 }; saveKeys(); bot.sendMessage(id, 🔑 Key: ${key}\n⏳ ${days} ngày); });

bot.onText(/^/listkey$/, (msg) => { const id = msg.chat.id; if (!isAdmin(id)) return; let text = '📦 DANH SÁCH KEY\n'; for (const k in keys) { const d = Math.ceil((keys[k].expire - Date.now()) / 86400000); text += ${k} | ${d} ngày\n; } bot.sendMessage(id, text || 'Trống'); });

bot.onText(/^/delkey (.+)/, (msg, m) => { const id = msg.chat.id; if (!isAdmin(id)) return; delete keys[m[1]]; saveKeys(); bot.sendMessage(id, '🗑️ Đã xoá key'); });

bot.onText(/^/userinfo (\d+)/, (msg, m) => { const id = msg.chat.id; if (!isAdmin(id)) return; const u = users[m[1]]; if (!u) return bot.sendMessage(id, '❌ Không tìm thấy user'); bot.sendMessage(id, 🆔 ${m[1]}\n🔑 Key: ${u.key}\n📦 Đã dùng ${u.usedKeys.length} key); });

// ===== TABLE COMMAND ===== for (let i = 1; i <= 16; i++) { const table = C${String(i).padStart(2, '0')}; bot.onText(new RegExp(^/${table.toLowerCase()}$), async (msg) => { const id = msg.chat.id; if (!isLogin(id)) return bot.sendMessage(id, '🔐 Vui lòng nhập /key');

const data = await getData();
if (!data) return bot.sendMessage(id, '❌ API lỗi');
const t = data.find(x => x.ban === table);
if (!t) return;

const predict = randomPredict();
predictions[table] = predict;
lastResults[table] = t.ket_qua;

users[id].history[table] = users[id].history[table] || [];
saveUsers();

bot.sendMessage(id, `🎰 ${table}\n📊 ${t.ket_qua}\n🎯 Dự đoán: ${predict}`);

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

    bot.sendMessage(id, `🔔 ${table} ra ${result} ${ok ? '✅' : '❌'}`);
  }, 3000);
}

}); }

// ===== HISTORY ===== bot.onText(/^/history (C\d{2})/, (msg, m) => { const id = msg.chat.id; if (!isLogin(id)) return; const h = users[id].history[m[1]] || []; const win = h.filter(x => x).length; const lose = h.length - win; bot.sendMessage(id, 📊 ${m[1]}\n✅ Đúng: ${win}\n❌ Sai: ${lose}); });

// ===== STOP ===== bot.onText(/^/stop(?: (C\d{2}))?/, (msg, m) => { const id = msg.chat.id; if (m[1]) { clearInterval(autoTimers[m[1]]); delete autoTimers[m[1]]; return bot.sendMessage(id, 🛑 Đã dừng ${m[1]}); } for (const t in autoTimers) clearInterval(autoTimers[t]); autoTimers = {}; bot.sendMessage(id, '🛑 Đã dừng toàn bộ'); });

// ===== HELP ===== bot.onText(/^/help$/, (msg) => { const id = msg.chat.id; let text = '📖 USER\n/key <key>\n/c01→/c16\n/history Cxx\n/stop'; if (isAdmin(id)) text += '\n\n👑 ADMIN\n/genkey <ngày>\n/listkey\n/delkey <key>\n/userinfo <id>'; bot.sendMessage(id, text); });

console.log('🚀 BOT FULL FINAL ĐANG CHẠY');