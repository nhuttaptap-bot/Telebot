const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.BOT_TOKEN;
const API_URL = 'https://bcrapj-6dju.onrender.com/data';

const bot = new TelegramBot(TOKEN, { polling: true });

// Biến global
let lastResults = {};
let predictions = {};
let autoTimers = {};
let chatIds = {};

// RANDOM DỰ ĐOÁN
function randomPredict() {
    // Random 50% Banker, 50% Player
    const random = Math.random();
    
    if (random < 0.5) {
        return {
            prediction: 'B',
            reason: 'Random 50% - Banker'
        };
    } else {
        return {
            prediction: 'P', 
            reason: 'Random 50% - Player'
        };
    }
}

// Lấy API
async function getData() {
    try {
        const response = await axios.get(API_URL, { timeout: 3000 });
        return response.data;
    } catch (error) {
        console.log('API Error:', error.message);
        return null;
    }
}

// Gửi tin nhắn RANDOM
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

// Kiểm tra auto
async function checkAndNotify(tableId) {
    const chatId = chatIds[tableId];
    if (!chatId) return;
    
    const data = await getData();
    if (!data) return;
    
    const table = data.find(t => t.ban === tableId);
    if (!table) return;
    
    const currentResult = table.ket_qua;
    const oldResult = lastResults[tableId];
    
    // Nếu CÓ kết quả mới
    if (oldResult && currentResult !== oldResult) {
        const oldPrediction = predictions[tableId];
        const newLastChar = currentResult[currentResult.length - 1].toUpperCase();
        
        // 1. Gửi thông báo KẾT QUẢ MỚI
        let notifyMsg = `🔔 ${tableId} CÓ KẾT QUẢ MỚI!\n`;
        notifyMsg += `⏰ ${table.time}\n\n`;
        notifyMsg += `📊 Kết quả: `;
        notifyMsg += newLastChar === 'B' ? 'BANKER 🏦\n' :
                     newLastChar === 'P' ? 'PLAYER 👤\n' : 'TIE ⚖️\n';
        
        if (oldPrediction && (newLastChar === 'B' || newLastChar === 'P')) {
            const isCorrect = (oldPrediction === newLastChar);
            notifyMsg += `📈 Dự đoán trước: ${oldPrediction === 'B' ? 'BANKER' : 'PLAYER'} `;
            notifyMsg += isCorrect ? '✅ ĐÚNG\n\n' : '❌ SAI\n\n';
        }
        
        bot.sendMessage(chatId, notifyMsg, { parse_mode: 'Markdown' });
        
        // 2. ĐỢI 2 GIÂY rồi gửi tin nhắn RANDOM mới
        setTimeout(() => {
            sendRandomMessage(tableId, chatId, table);
        }, 2000);
        
        // Cập nhật
        lastResults[tableId] = currentResult;
    }
}

// Xử lý lệnh /c01 đến /c16
for (let i = 1; i <= 16; i++) {
    const tableId = `C${i.toString().padStart(2, '0')}`;
    
    bot.onText(new RegExp(`^/${tableId.toLowerCase()}$`), async (msg) => {
        const chatId = msg.chat.id;
        
        // Lấy dữ liệu
        const data = await getData();
        if (!data) {
            bot.sendMessage(chatId, '❌ Không kết nối API');
            return;
        }
        
        const table = data.find(t => t.ban === tableId);
        if (!table) {
            bot.sendMessage(chatId, `❌ Không thấy ${tableId}`);
            return;
        }
        
        // Gửi tin nhắn RANDOM lần đầu
        sendRandomMessage(tableId, chatId, table);
        
        // Lưu kết quả hiện tại
        lastResults[tableId] = table.ket_qua;
        chatIds[tableId] = chatId;
        
        // BẬT AUTO nếu chưa bật
        if (!autoTimers[tableId]) {
            autoTimers[tableId] = setInterval(() => {
                checkAndNotify(tableId);
            }, 3000);
            
            console.log(`✅ AUTO START: ${tableId} - Chat: ${chatId}`);
        }
    });
}

console.log('🎲 BOT RANDOM 50% ĐANG CHẠY!');
console.log('Sử dụng: /c01 đến /c16');