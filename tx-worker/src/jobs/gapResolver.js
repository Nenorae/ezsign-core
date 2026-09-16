const walletManager = require('../core/walletManager');
const besuService = require('../services/besu');
const redisService = require('../services/redis');
const vaultService = require('../services/vault');
const txBuilder = require('../core/txBuilder');

class GapResolver {
  constructor() {
    this.intervalId = null;
  }

  /**
   * Memulai cron job Gap Filler setiap 60 detik
   */
  start() {
    // 60.000 ms = 60 detik
    this.intervalId = setInterval(() => this.run(), 60000);
    console.log('[Gap Resolver] Started cron job (evaluating every 60s)');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async run() {
    const pool = walletManager.getPool();
    for (const walletAddress of pool) {
      try {
        await this.checkAndResolve(walletAddress);
      } catch (error) {
        console.error(`[Gap Resolver] Error evaluating wallet ${walletAddress}:`, error.message);
      }
    }
  }

  /**
   * Langkah 6: Mitigasi Anomali Nonce
   * Evaluasi selisih antara nonce di RPC node dan nonce di Redis
   * 
   * @param {string} walletAddress - Alamat dompet dari Wallet Pool
   */
  async checkAndResolve(walletAddress) {
    const rpcNonce = await besuService.getTransactionCount(walletAddress);
    const redisNonce = await redisService.getNonce(walletAddress);

    // Jika Redis_Nonce - RPC_Nonce > 5
    if ((redisNonce - rpcNonce) > 5) {
      console.warn(`[Gap Resolver] Gap detected on ${walletAddress}. RPC: ${rpcNonce}, Redis: ${redisNonce}`);
      
      // Identifikasi nonce spesifik yang hilang di mempool (yaitu nonce yang ditunggu oleh RPC).
      const missingNonce = rpcNonce;

      // Paksa injeksi Transaksi Kosong berupa transfer 0 ETH ke diri sendiri menggunakan nonce yang hilang.
      const emptyTx = {
        to: walletAddress,
        data: '0x',
        value: '0x0',
        nonce: missingNonce,
        gasLimit: 500000,
        gasPrice: 0,
        chainId: txBuilder.chainId
      };

      console.log(`[Gap Resolver] Injecting empty transaction (0 ETH to self) for missing nonce ${missingNonce}...`);
      
      const signedRawTx = await vaultService.signTransaction(walletAddress, emptyTx);
      const txHash = await besuService.sendRawTransaction(signedRawTx);
      
      console.log(`[Gap Resolver] Successfully injected empty transaction. Dam opened! TxHash: ${txHash}`);
    }
  }
}

module.exports = new GapResolver();
