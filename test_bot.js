const TelegramBot = require('node-telegram-bot-api');

const token = "8056003531:AAGc4tK-YVP0YhMRwF65y5YGP3EyrhNSegs";
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  console.log("Pesan diterima dari", chatId);
  bot.sendMessage(chatId, 'Bot aktif dan merespon pesan kamu!');
});
