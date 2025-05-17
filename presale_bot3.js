require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  transfer
} = require('@solana/spl-token');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// === ENV CONFIG ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const MNEMONIC = process.env.MNEMONIC;
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const TOKEN_DECIMALS = 9;
const RATE = 100000; // 1 SOL = 100,000 token
const MIN_SOL = 0.1;

if (!BOT_TOKEN || !MNEMONIC) {
  console.error('ERROR: BOT_TOKEN atau MNEMONIC belum diset di environment variables!');
  process.exit(1);
}

// === INIT ===
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const mint = new PublicKey(MINT_ADDRESS);

// === WALLET DARI MNEMONIC ===
function getKeypairFromMnemonic(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = "m/44'/501'/0'/0'";
  const derivedSeed = derivePath(path, seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
}
const payer = getKeypairFromMnemonic(MNEMONIC);

// === USER STORAGE ===
const userData = {};

// === COMMAND START ===
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Selamat datang! Kirim wallet Solana Devnet kamu untuk ikut presale. Minimal 0.1 SOL');
});

// === TANGKAP WALLET ADDRESS ===
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  if (text.startsWith('/')) return;

  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
    userData[chatId] = { wallet: text, paid: false };
    console.log(`[+] Wallet user ${text} dicatat dari chatId ${chatId}`);
    bot.sendMessage(chatId, `Wallet kamu tercatat: ${text}\n\nKirim minimal ${MIN_SOL} SOL ke wallet berikut:\n\n${payer.publicKey.toBase58()}\n\nBot akan cek otomatis dan mengirim token.`);
  }
});

// === LISTEN TRANSAKSI MASUK REAL-TIME ===
connection.onLogs(payer.publicKey, async (logInfo) => {
  try {
    const signature = logInfo.signature;
    const tx = await connection.getParsedTransaction(signature, 'confirmed');
    if (!tx?.meta?.postBalances) return;

    const senderKey = tx.transaction.message.accountKeys[0].pubkey.toString();
    const receiverKey = tx.transaction.message.accountKeys[1].pubkey.toString();

    if (receiverKey === payer.publicKey.toBase58()) {
      console.log(`[LOG] Transaksi baru dari ${senderKey} diterima! Signature: ${signature}`);

      const userEntry = Object.entries(userData).find(([_, data]) => data.wallet === senderKey && !data.paid);
      if (!userEntry) {
        console.log(`[!] Tidak ditemukan user yang cocok untuk ${senderKey} atau sudah dibayar.`);
        return;
      }

      const [chatId, user] = userEntry;

      const pre = tx.meta.preBalances[1];
      const post = tx.meta.postBalances[1];
      const lamports = Math.abs(post - pre);
      const amountSOL = lamports / LAMPORTS_PER_SOL;

      console.log(`[+] Pembayaran sebesar ${amountSOL} SOL diterima dari ${senderKey}`);

      if (amountSOL >= MIN_SOL) {
        const tokenAmount = amountSOL * RATE;
        user.paid = true;

        const userWallet = new PublicKey(user.wallet);

        const userTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          userWallet
        );

        const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey
        );

        await transfer(
          connection,
          payer,
          payerTokenAccount.address,
          userTokenAccount.address,
          payer,
          tokenAmount * Math.pow(10, TOKEN_DECIMALS)
        );

        console.log(`[+] Token sebesar ${tokenAmount} berhasil dikirim ke ${user.wallet}`);
        bot.sendMessage(chatId, `Pembayaran ${amountSOL} SOL diterima!\nKamu mendapatkan ${tokenAmount} token. Terima kasih!`);
      } else {
        console.log(`[!] Pembayaran dari ${senderKey} kurang dari ${MIN_SOL} SOL.`);
      }
    }
  } catch (err) {
    console.error('Listener Error:', err.message);
  }
}, 'confirmed');
