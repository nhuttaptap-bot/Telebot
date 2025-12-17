const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

const TOKEN = process.env.BOT_TOKEN;
const API_URL = 'https://bcrapj-6dju.onrender.com/data';

const bot = new TelegramBot(TOKEN, { polling: true });

// ================== BIẾN GLOBAL ==================
let lastResults = {};
let predictions = {};
let autoTimers = {};
let chatIds = {};
let activeTablesByChat = {}; // chatId -> Set(tableId)

// ================== RANDOM DỰ ĐOÁN ==================
function randomPredict() {
    return Math.random() < 0.5
        ? { prediction: 'B', reason: 'Random 50% - Banker' }
        : { prediction: 'P', reason: 'Random 50% - Player' };
}

// ================== LẤY API ==================
async function getData() {
    try {
        const response = await axios.get(API_URL, { timeout: 3000 });
        return response.data;
    } catch (error) {
        console.log('API Error:', error.message);
        return null;
    }
}

// ================== GỬI TIN NHẮN RANDOM ==================
function sendRandomMessage(tableId, chatId, table) {
    const analysis = randomPredict();

    let message = `🎰 ${tableId}\n`;
    message += `⏰ ${table.time}\n`;
    if (table.cau) message += `📋 ${table.cau}\n`;
    message += `\n📊 Kết quả hiện tại:\n\`${table.ket_qua}\`\n\n`;

    predictions[tableId] = analysis.prediction;
    message += `🎲 DỰ ĐOÁN TIẾP: ${analysis.prediction === 'B' ? 'BANKER 🏦' : 'PLAYER 👤'}\n`;
    message += `📝 ${analysis.reason}`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// ================== CHECK AUTO ==================
async function checkAndNotify(tableId) {
    const chatId = chatIds[tableId];
    if (!chatId) return;

    const data = await getData();
    if (!data) return;

    const table = data.find(t => t.ban === tableId);
    if (!table) return;

    const currentResult = table.ket_qua;
    const oldResult = lastResults[tableId];

    if (oldResult && currentResult !== oldResult) {
        const oldPrediction = predictions[tableId];
        const newLastChar = currentResult.slice(-1).toUpperCase();

        let notifyMsg = `🔔 ${tableId} CÓ KẾT QUẢ MỚI!\n`;
        notifyMsg += `⏰ ${table.time}\n\n`;
        notifyMsg += `📊 Kết quả: `;
        notifyMsg += newLastChar === 'B' ? 'BANKER 🏦\n' :
                     newLastChar === 'P' ? 'PLAYER 👤\n' : 'TIE ⚖️\n';

        if (oldPrediction && (newLastChar === 'B' || newLastChar === 'P')) {
            notifyMsg += `📈 Dự đoán trước: ${oldPrediction === 'B' ? 'BANKER' : 'PLAYER'} `;
            notifyMsg += oldPrediction === newLastChar ? '✅ ĐÚNG\n\n' : '❌ SAI\n\n';
        }

        bot.sendMessage(chatId, notifyMsg);

        setTimeout(() => {
            sendRandomMessage(tableId, chatId, table);
        }, 2000);

        lastResults[tableId] = currentResult;
    }
}

// ================== /c01 → /c16 ==================
for (let i = 1; i <= 16; i++) {
    const tableId = `C${i.toString().padStart(2, '0')}`;

    bot.onText(new RegExp(`^/${tableId.toLowerCase()}$`), async (msg) => {
        const chatId = msg.chat.id;

        const data = await getData();
        if (!data) return bot.sendMessage(chatId, '❌ Không kết nối API');

        const table = data.find(t => t.ban === tableId);
        if (!table) return bot.sendMessage(chatId, `❌ Không thấy ${tableId}`);

        sendRandomMessage(tableId, chatId, table);

        lastResults[tableId] = table.ket_qua;
        chatIds[tableId] = chatId;

        if (!activeTablesByChat[chatId]) {
            activeTablesByChat[chatId] = new Set();
        }
        activeTablesByChat[chatId].add(tableId);

        if (!autoTimers[tableId]) {
            autoTimers[tableId] = setInterval(() => {
                checkAndNotify(tableId);
            }, 3000);
        }
    });
}

// ================== /stop (DỪNG TẤT CẢ) ==================
bot.onText(/^\/stop$/, (msg) => {
    const chatId = msg.chat.id;
    const tables = activeTablesByChat[chatId];

    if (!tables || tables.size === 0) {
        return bot.sendMessage(chatId, 'ℹ️ Không có bàn nào đang chạy.');
    }

    for (const tableId of tables) {
        clearInterval(autoTimers[tableId]);
        delete autoTimers[tableId];
    }

    activeTablesByChat[chatId].clear();
    bot.sendMessage(chatId, '🛑 Đã DỪNG toàn bộ AUTO.');
});

// ================== /stop c01 ==================
bot.onText(/^\/stop\s+(c\d{2})$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const tableId = match[1].toUpperCase();

    if (!autoTimers[tableId]) {
        return bot.sendMessage(chatId, `ℹ️ ${tableId} không chạy.`);
    }

    clearInterval(autoTimers[tableId]);
    delete autoTimers[tableId];

    activeTablesByChat[chatId]?.delete(tableId);
    bot.sendMessage(chatId, `🛑 Đã DỪNG ${tableId}.`);
});

// ================== /status ==================
bot.onText(/^\/status$/, (msg) => {
    const chatId = msg.chat.id;
    const tables = activeTablesByChat[chatId];

    if (!tables || tables.size === 0) {
        return bot.sendMessage(chatId, 'ℹ️ Không có bàn nào đang chạy.');
    }

    bot.sendMessage(chatId, `📊 Đang chạy: ${[...tables].join(', ')}`);
});

// ================== /help ==================
bot.onText(/^\/help$/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
`🤖 HƯỚNG DẪN BOT

/c01 → /c16 : Bật auto bàn
/stop         : Dừng tất cả
/stop c01     : Dừng 1 bàn
/status       : Xem bàn đang chạy
/help         : Xem hướng dẫn

⚠️ Render Free có thể sleep khi không dùng`
    );
});

// ================== HTTP SERVER (CHO RENDER) ==================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.end('Bot is running');
}).listen(PORT);

console.log('🎲 BOT RANDOM 50% ĐANG CHẠY!');