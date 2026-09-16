// src/core/txBuilder.js (Perakit Payload)
// - Membangun objek transaksi Ethereum mentah.
// - Memastikan beban gasPrice diisi dengan 0 secara absolut karena berjalan di Zero-Gas Network.

require('dotenv').config();

class TxBuilder {
  constructor() {
    this.smartContractAddress = process.env.SMART_CONTRACT_ADDRESS || '';
    
    // Parse chain ID dari environment, default fallback jika dibutuhkan
    this.chainId = process.env.BESU_CHAIN_ID ? parseInt(process.env.BESU_CHAIN_ID, 10) : undefined;
    
    // Konstanta sesuai spesifikasi "Batasan Absolut" dan "Langkah 4"
    this.gasLimit = 500000;
    this.gasPrice = 0;
  }

  /**
   * Merakit objek transaksi Ethereum mentah (Unsigned Transaction)
   * Tidak ada perhitungan dinamis biaya gas karena berada di jaringan Zero-Gas.
   * 
   * @param {number} nonce - ASSIGNED_NONCE mutlak hasil atomic fetching dari Redis
   * @param {string} encodedData - Payload ABI encoded (contoh: untuk ENCODED_ABI_LOG_SAVED_FUNCTION)
   * @returns {Object} Objek transaksi mentah untuk didelegasikan ke KMS
   */
  buildUnsignedTx(nonce, encodedData) {
    if (!this.smartContractAddress) {
      throw new Error('SMART_CONTRACT_ADDRESS is missing in environment variables.');
    }
    
    if (this.chainId === undefined || isNaN(this.chainId)) {
      throw new Error('BESU_CHAIN_ID is missing or invalid in environment variables.');
    }

    if (typeof nonce !== 'number' || nonce < 0) {
      throw new Error('Invalid nonce provided to TxBuilder.');
    }

    return {
      to: this.smartContractAddress,
      data: encodedData,
      nonce: nonce,
      gasLimit: this.gasLimit,
      gasPrice: this.gasPrice,
      chainId: this.chainId
    };
  }
}

module.exports = new TxBuilder();
