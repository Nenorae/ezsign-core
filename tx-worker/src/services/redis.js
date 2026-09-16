require('dotenv').config();
const { createClient } = require('redis');

class RedisService {
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    
    // Sesuai Spesifikasi: Struktur Hash dengan Key `ezsign:wallet_nonces`
    this.hashKey = 'ezsign:wallet_nonces';
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * Langkah 3: Atomic Nonce Fetching
   * Ambil dan tingkatkan nonce secara atomik di Redis untuk dompet yang terpilih.
   * 
   * @param {string} walletAddress - Alamat dompet yang dipilih (SELECTED_WALLET)
   * @returns {Promise<number>} ASSIGNED_NONCE (nonce mutlak untuk transaksi ini)
   */
  async getAndIncrementNonce(walletAddress) {
    await this.connect();
    
    // CURRENT_NONCE = HINCRBY ezsign:wallet_nonces SELECTED_WALLET 1
    const currentNonceStr = await this.client.hIncrBy(this.hashKey, walletAddress, 1);
    const currentNonce = parseInt(currentNonceStr, 10);
    
    // ASSIGNED_NONCE = CURRENT_NONCE - 1
    const assignedNonce = currentNonce - 1;
    
    return assignedNonce;
  }

  /**
   * Mengambil nonce spesifik dari Redis tanpa increment 
   * (Digunakan oleh fungsi Cron Gap Filler)
   * 
   * @param {string} walletAddress - Alamat dompet
   * @returns {Promise<number>} Nilai nonce di Redis
   */
  async getNonce(walletAddress) {
    await this.connect();
    const nonce = await this.client.hGet(this.hashKey, walletAddress);
    return nonce ? parseInt(nonce, 10) : 0;
  }

  /**
   * Langkah 4.2: Sinkronisasi Nonce Redis Saat Startup
   * 
   * @param {string} walletAddress - Alamat dompet
   * @param {number} rpcNonce - Nonce aktual dari RPC
   */
  async setNonce(walletAddress, rpcNonce) {
    await this.connect();
    // Simpan ke Redis dengan tipe struktur Hash, Field: Address, Value: Nonce
    await this.client.hSet(this.hashKey, walletAddress, rpcNonce);
  }
}

module.exports = new RedisService();
