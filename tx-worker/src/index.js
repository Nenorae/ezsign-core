// src/index.js (Orkestrator)
// - Menjadi titik awal (entry point) dari aplikasi.
// - Mengeksekusi kalibrasi nonce awal dengan melakukan kueri ke RPC Besu satu kali saat startup
//   untuk setiap alamat di WALLET_POOL.
// - Menyimpan status awal tersebut ke Redis sebelum mulai mendengarkan antrean.
// - Menjalankan cron job dan consumer setelah kalibrasi selesai.

require('dotenv').config();
const walletManager = require('./core/walletManager');
const txBuilder = require('./core/txBuilder');
const gapResolver = require('./jobs/gapResolver');
const besuService = require('./services/besu');
const redisService = require('./services/redis');
const vaultService = require('./services/vault');
const rabbitmqService = require('./services/rabbitmq');

/**
 * Langkah 4.2: Sinkronisasi Nonce Redis Saat Startup
 */
async function initializeNonceState() {
  console.log('[Init] Starting Redis Nonce Calibration...');
  const pool = walletManager.getPool();
  
  if (pool.length === 0) {
    throw new Error('Wallet Pool is empty. Please check WALLET_POOL configuration.');
  }

  for (const walletAddress of pool) {
    try {
      // Kueri ke RPC Besu satu kali saja pada saat startup
      const rpcNonce = await besuService.getTransactionCount(walletAddress);
      
      // Simpan ke Redis (Key: ezsign:wallet_nonces, Field: Address, Value: Nonce)
      await redisService.setNonce(walletAddress, rpcNonce);
      console.log(`[Init] Wallet ${walletAddress} synchronized with nonce: ${rpcNonce}`);
    } catch (error) {
      console.error(`[Init] Failed to sync nonce for wallet ${walletAddress}`, error.message);
      throw error; // Gagal startup jika sinkronisasi gagal
    }
  }
  console.log('[Init] Nonce Calibration Completed.');
}

/**
 * Alur utama dari Siklus Kerja TX-Worker
 * Mengolah pesan satu per satu (Strict FIFO)
 */
async function processMessage(msg, content) {
  try {
    // Kita gunakan deliveryTag dari RabbitMQ sebagai messageIndex
    // karena angkanya inkremental sekuensial.
    const messageIndex = msg.fields.deliveryTag;
    
    // Langkah 2: Round-Robin Wallet Selection
    const selectedWallet = walletManager.selectWallet(messageIndex);
    
    // Langkah 3: Atomic Nonce Fetching
    const assignedNonce = await redisService.getAndIncrementNonce(selectedWallet);
    
    // Validasi konten pesan 
    const encodedData = content.encodedData || content.data;
    if (!encodedData) {
      throw new Error('Message content missing encodedData');
    }
    
    // Langkah 4: Perakitan Transaksi Unsigned
    const unsignedTx = txBuilder.buildUnsignedTx(assignedNonce, encodedData);
    
    // Langkah 5: Delegasi Penandatanganan KMS
    const signedRawTx = await vaultService.signTransaction(selectedWallet, unsignedTx);
    
    // Langkah 6: Injeksi ke Jaringan
    const txHash = await besuService.sendRawTransaction(signedRawTx);
    
    console.log(`[Worker] Tx Injected! Hash: ${txHash}, Wallet: ${selectedWallet}, Nonce: ${assignedNonce}`);
    
    // Langkah 7: ACK, Timeout, dan DLQ (Kondisi Sukses)
    rabbitmqService.ack(msg);
  } catch (error) {
    console.error('[Worker] Error processing message:', error.message);
    
    // Analisis Langkah 7: ACK, Timeout, dan DLQ
    if (error.message.toLowerCase().includes('timeout') || error.message.includes('ECONNABORTED')) {
      // Jika respons timeout, tetap ACK pesan dan asumsikan transaksi tertunda di mempool. 
      // Jangan mengurangi nonce di Redis.
      console.log('[Worker] Timeout detected, assuming pending in mempool. ACKing message.');
      rabbitmqService.ack(msg);
    } else {
      // Jika respons gagal mutlak (misalnya reverted/invalid data), 
      // ACK pesan dan masukkan ke log/Dead Letter Queue untuk audit.
      // RabbitMQ nack(false) mengirimnya ke DLQ (jika terkonfigurasi pada queue).
      console.log('[Worker] Absolute failure, NACKing message to DLQ.');
      rabbitmqService.nack(msg, false); 
    }
  }
}

/**
 * Entry Point Aplikasi
 */
async function startWorker() {
  try {
    // 1. Inisialisasi State (Langkah 4.2)
    await initializeNonceState();
    
    // 2. Mulai Gap Resolver Cron (Langkah 6)
    gapResolver.start();

    // 3. Mulai Consume pesan dari RabbitMQ (Langkah 1)
    console.log('[Worker] Connecting and listening to tx_log_queue (Strict FIFO)...');
    await rabbitmqService.consume(processMessage);
    
  } catch (error) {
    console.error('[Worker] Fatal error during startup:', error);
    process.exit(1);
  }
}

startWorker();
