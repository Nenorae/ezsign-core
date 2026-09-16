// src/config.js (Manajemen Konfigurasi)
// - Menyimpan konfigurasi statis seperti ukuran WALLET_POOL, alamat Smart Contract,
//   BESU_CHAIN_ID, dan ABI untuk fungsi Log Saved.

require('dotenv').config();

const config = {
  // Konfigurasi Jaringan (Node 5/6 Hyperledger Besu)
  besu: {
    rpcUrl: process.env.BESU_RPC_URL || 'http://localhost:8545',
    chainId: process.env.BESU_CHAIN_ID ? parseInt(process.env.BESU_CHAIN_ID, 10) : undefined,
  },

  // Konfigurasi Message Broker
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    queueName: 'tx_log_queue'
  },

  // Konfigurasi HashiCorp Vault (KMS)
  vault: {
    url: process.env.VAULT_ADDR || 'http://localhost:8200',
    token: process.env.VAULT_TOKEN || ''
  },

  // Konfigurasi Redis (State Store)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    hashKey: 'ezsign:wallet_nonces'
  },

  // Konfigurasi Parameter Transaksi & Smart Contract
  tx: {
    smartContractAddress: process.env.SMART_CONTRACT_ADDRESS || '',
    // Parameter Absolut untuk Zero-Gas Network
    gasLimit: 500000,
    gasPrice: 0
  },

  // Konfigurasi Wallet Pool
  wallet: {
    get pool() {
      const walletsEnv = process.env.WALLET_POOL || '';
      return walletsEnv.split(',').map(w => w.trim()).filter(w => w !== '');
    }
  },

  // Definisi ABI statis
  abi: {
    // Sesuai dengan "<ENCODED_ABI_LOG_SAVED_FUNCTION>" pada perakitan
    // Parameter aktual disesuaikan dengan arsitektur kontrak ezSign
    LOG_SAVED_FUNCTION: process.env.ABI_LOG_SAVED_FUNCTION || 'logSaved(string,string,uint256)' 
  }
};

module.exports = config;
