require('dotenv').config();
const axios = require('axios');

class BesuService {
  constructor() {
    // Sesuai spesifikasi: Node 5/6 Hyperledger Besu melalui HTTP port 8545
    this.rpcUrl = process.env.BESU_RPC_URL || 'http://localhost:8545';
  }

  /**
   * Langkah 6: Injeksi ke Jaringan
   * Mengirim transaksi mentah yang sudah ditandatangani ke jaringan Besu
   * 
   * @param {string} signedRawTx - Transaksi RLP heksadesimal yang ditandatangani KMS
   * @returns {Promise<string>} TxHash dari transaksi
   */
  async sendRawTransaction(signedRawTx) {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction', // Sesuai spesifikasi eth_sendRawTx
      params: [signedRawTx],
      id: new Date().getTime()
    };

    try {
      const response = await axios.post(this.rpcUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.error) {
        throw new Error(response.data.error.message || JSON.stringify(response.data.error));
      }
      return response.data.result; // Mengembalikan TxHash
    } catch (error) {
      throw error;
    }
  }

  /**
   * Langkah 4.2: Sinkronisasi Nonce Redis Saat Startup
   * Mengambil nonce dari RPC saat startup. Lakukan kueri HANYA satu kali saja.
   * 
   * @param {string} address - Alamat dompet
   * @returns {Promise<number>} Current nonce
   */
  async getTransactionCount(address) {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
      id: new Date().getTime()
    };

    try {
      const response = await axios.post(this.rpcUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.error) {
        throw new Error(response.data.error.message || JSON.stringify(response.data.error));
      }
      // Result dari JSON-RPC adalah hex string
      return parseInt(response.data.result, 16);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new BesuService();
