const TelegramBot = require('node-telegram-bot-api');
const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
} = require('@solana/spl-token');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// === CONFIG ===
const BOT_TOKEN = '8056003531:AAGc4tK-YVP0YhMRwF65y5YGP3EyrhNSegs';
const MNEMONIC = 'helmet flavor onion copy alter elegant worry atom chat visit tourist slice';
const MINT_ADDRESS = 'FEzekBkReYVxTaY8WDJRGa8kxF9z27oLjSUU7ttUkyL1';
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

// === Fungsi transfer token SPL dari payer ke user
async function transferTokens(connection, payer, mint, toPubkey, amount) {
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    toPubkey
  );

  const transferIx = createTransferInstruction(
    fromTokenAccount.address,
    toTokenAccount.address,
    payer.publicKey,
    amount,
    [],
    TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(transferIx);

  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('Transfer berhasil:', signature);
}

// === COMMAND START ===
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Selamat datang! Kirim wallet Solana Devnet kamu untuk ikut presale. Minimal 0.1 SOL');
});

// === TANGKAP WALLET ADDRESS ===
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  if (text.startsWith('/')) return;

  // Validasi wallet Solana (bisa disesuaikan regex)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
    userData[chatId] = { wallet: text, paid: false };
    bot.sendMessage(chatId, `Wallet kamu tercatat: ${text}\n\nKirim minimal ${MIN_SOL} SOL ke wallet berikut:\n\n${payer.publicKey.toBase58()}\n\nBot akan cek otomatis dan mengirim token.`);
  } else {
    bot.sendMessage(chatId, 'Format wallet tidak valid, coba kirim ulang wallet Solana kamu yang benar.');
  }
});

// === CEK PEMBAYARAN ===
setInterval(async () => {
  for (const chatId in userData) {
    const user = userData[chatId];
    if (user.paid) continue;

    try {
      const wallet = new PublicKey(user.wallet);
      // Ambil transaksi terakhir 10 untuk wallet pembayar (payer)
      const sigs = await connection.getSignaturesForAddress(payer.publicKey, { limit: 10 });

      for (let sig of sigs) {
        const tx = await connection.getParsedTransaction(sig.signature, 'confirmed');
        if (!tx?.meta?.postBalances) continue;

        // Sender adalah pengirim transaksi (biasanya di accountKeys[0])
        const senderKey = tx.transaction.message.accountKeys[0].pubkey.toString();
        // Receiver adalah penerima (biasanya accountKeys[1])
        const receiverKey = tx.transaction.message.accountKeys[1].pubkey.toString();

        // Cek apakah transaksi dari user ke wallet presale (payer)
        if (receiverKey === payer.publicKey.toBase58() && senderKey === user.wallet) {
          const pre = tx.meta.preBalances[1];
          const post = tx.meta.postBalances[1];
          const lamports = Math.abs(post - pre);
          const amountSOL = lamports / LAMPORTS_PER_SOL;

          if (amountSOL >= MIN_SOL) {
            const tokenAmount = amountSOL * RATE * Math.pow(10, TOKEN_DECIMALS);
            user.paid = true;

            // Transfer token SPL ke user
            await transferTokens(connection, payer, mint, wallet, tokenAmount);

            bot.sendMessage(chatId, `Pembayaran ${amountSOL} SOL diterima.\nKamu mendapatkan ${amountSOL * RATE} token. Terima kasih!`);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error cek pembayaran:', error);
    }
  }
}, 15000);
