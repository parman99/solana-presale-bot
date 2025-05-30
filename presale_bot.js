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

// === CONFIG ===
const BOT_TOKEN = '8056003531:AAGc4tK-YVP0YhMRwF65y5YGP3EyrhNSegs';
const MNEMONIC = 'helmet flavor onion copy alter elegant worry atom chat visit tourist slice';
const MINT_ADDRESS = '6jVJVxLeK6HrkLEiyVfUM4WPco5XnzLpiQA6t24zs7Zz';
const TOKEN_DECIMALS = 9;
const RATE = 100000; // 1 SOL = 100,000 token
const MIN_SOL = 0.1;

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
    userData[chatId] = { wallet: text };
    bot.sendMessage(chatId, `Wallet kamu tercatat: ${text}\n\nKirim minimal ${MIN_SOL} SOL ke wallet berikut:\n\n${payer.publicKey.toBase58()}\n\nBot akan cek otomatis dan mengirim token.`);
  }
});

// === CEK PEMBAYARAN ===
setInterval(async () => {
  for (const chatId in userData) {
    const user = userData[chatId];
    if (user.paid) continue;

    const wallet = new PublicKey(user.wallet);
    const sigs = await connection.getSignaturesForAddress(payer.publicKey, { limit: 10 });

    for (let sig of sigs) {
      const tx = await connection.getParsedTransaction(sig.signature, 'confirmed');
      if (!tx?.meta?.postBalances) continue;

      const senderKey = tx.transaction.message.accountKeys[0].pubkey.toString();
      const receiverKey = tx.transaction.message.accountKeys[1].pubkey.toString();

      if (receiverKey === payer.publicKey.toBase58() && senderKey === user.wallet) {
        const pre = tx.meta.preBalances[1];
        const post = tx.meta.postBalances[1];
        const lamports = Math.abs(post - pre);
        const amountSOL = lamports / LAMPORTS_PER_SOL;

        if (amountSOL >= MIN_SOL) {
          const tokenAmount = amountSOL * RATE;
          user.paid = true;

          const userTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            mint,
            wallet
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

          bot.sendMessage(chatId, `Pembayaran ${amountSOL} SOL diterima.\nKamu mendapatkan ${tokenAmount} token. Terima kasih!`);
        }
      }
    }
  }
}, 15000);
