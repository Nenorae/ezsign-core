require('dotenv').config();
const axios = require('axios');

class VaultService {
  constructor() {
    this.vaultUrl = process.env.VAULT_ADDR || 'http://localhost:8200';
    this.vaultToken = process.env.VAULT_TOKEN || '';
  }

  /**
   * Langkah 5: Delegasi Penandatanganan KMS
   * Mengirim objek transaksi mentah ke HashiCorp Vault untuk ditandatangani.
   * 
   * @param {string} walletAddress - Alamat dompet (SELECTED_WALLET)
   * @param {Object} rawTxObject - Objek transaksi mentah (Unsigned)
   * @returns {Promise<string>} SIGNED_RAW_TX format heksadesimal RLP
   */
  async signTransaction(walletAddress, rawTxObject) {
    if (!this.vaultToken) {
      throw new Error('Vault token is not configured in environment variables.');
    }

    // Endpoint sesuai spesifikasi: POST ke Vault /transit/keys/{SELECTED_WALLET}/sign
    const endpoint = `${this.vaultUrl}/v1/transit/keys/${walletAddress}/sign`;
    
    try {
      const response = await axios.post(
        endpoint,
        {
          // Mengirim payload rawTxObject (dianggap hash/data yang dibutuhkan oleh plugin)
          transaction: rawTxObject 
        },
        {
          headers: {
            'X-Vault-Token': this.vaultToken,
            'Content-Type': 'application/json'
          }
        }
      );

      // Response: Vault mengembalikan SIGNED_RAW_TX dalam format heksadesimal RLP.
      // Disesuaikan dengan standar response KMS Ethereum Plugin
      const signedRawTx = response.data?.data?.signed_transaction; 
      
      if (!signedRawTx) {
         throw new Error("Invalid response from KMS, missing signed_transaction data.");
      }

      return signedRawTx;
    } catch (error) {
      console.error(`[Vault KMS] Error signing transaction for wallet ${walletAddress}`);
      // Lemparkan pesan spesifik untuk dihandle oleh caller
      throw new Error(error.response?.data?.errors?.join(', ') || error.message);
    }
  }
}

module.exports = new VaultService();
