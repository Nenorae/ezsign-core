// src/core/walletManager.js (Alokasi Dompet)
// - Memilih wallet menggunakan logika round-robin berbasis indeks pesan
//   dari 10 alamat dompet yang tersedia.

require('dotenv').config();

class WalletManager {
  constructor() {
    // WALLET_POOL sebaiknya dikonfigurasi melalui environment variable (dipisahkan koma)
    // berdasarkan 10 public address yang dibangkitkan dari HashiCorp Vault.
    const walletsEnv = process.env.WALLET_POOL || '';
    this.walletPool = walletsEnv.split(',').map(w => w.trim()).filter(w => w !== '');
    
    if (this.walletPool.length === 0) {
      console.warn('Warning: WALLET_POOL is empty. Please configure wallet pool in environment variables.');
    }
  }

  /**
   * Memilih wallet menggunakan logika round-robin berbasis indeks pesan
   * (SELECTED_WALLET = WALLET_POOL[ MESSAGE_INDEX % POOL_SIZE ])
   * 
   * @param {number} messageIndex - Indeks urutan pesan dari RabbitMQ
   * @returns {string} Alamat wallet yang terpilih
   */
  selectWallet(messageIndex) {
    if (this.walletPool.length === 0) {
      throw new Error('Wallet pool is empty. Cannot select wallet.');
    }
    // Pastikan messageIndex adalah bilangan bulat tak negatif
    const index = Math.abs(Math.floor(messageIndex));
    const poolSize = this.walletPool.length;
    
    return this.walletPool[index % poolSize];
  }

  /**
   * Mendapatkan seluruh daftar alamat dompet di dalam pool.
   * Sangat berguna untuk sinkronisasi kueri Nonce ke Redis saat Startup (Langkah 4.2).
   * 
   * @returns {string[]} Array string berisikan alamat dompet (public addresses)
   */
  getPool() {
    return this.walletPool;
  }
}

module.exports = new WalletManager();
