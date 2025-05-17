const bip39 = require('bip39');
const ed25519 = require('ed25519-hd-key');
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const mnemonic = "helmet flavor onion copy alter elegant worry atom chat visit tourist slice";

// Buat seed dari mnemonic
const seed = bip39.mnemonicToSeedSync(mnemonic);

// Derive keypair dari seed menggunakan path Solana
const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed).key;

// Buat Keypair langsung dari seed yang benar
const keypair = Keypair.fromSeed(derived); // Keypair otomatis berisi secret key valid

// Simpan secretKey (Uint8Array) ke file
fs.writeFileSync('presale-wallet.json', JSON.stringify(Array.from(keypair.secretKey), null, 2));
console.log("Berhasil buat presale-wallet.json dari mnemonic!");
