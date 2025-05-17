const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');

// GANTI dengan public key wallet kamu (harus Devnet)
const WALLET_ADDRESS = 'C81MtLHr4iCVc7YnVNMiq4BiLi2hjX8zEPLqzSJgnEJh';

async function requestAirdrop() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const publicKey = new PublicKey(WALLET_ADDRESS);

  try {
    console.log(`Meminta 2 SOL ke: ${WALLET_ADDRESS} ...`);
    const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature, 'confirmed');

    const balance = await connection.getBalance(publicKey);
    console.log(`Airdrop berhasil. Saldo sekarang: ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (err) {
    console.error('Gagal airdrop:', err.message);
  }
}

requestAirdrop();
