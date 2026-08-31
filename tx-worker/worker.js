require("dotenv").config({ path: "../.env" });
const amqp = require("amqplib");
const { ethers } = require("ethers");

// Konfigurasi RabbitMQ
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = process.env.RABBITMQ_QUEUE || "ezsign_logging_queue";

// Konfigurasi Blockchain (Hyperledger Besu RPC-Only Node 5)
const RPC_URL = process.env.BESU_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.SMART_CONTRACT_ADDRESS;

if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.error("[Fatal Error] MASTER_WALLET_PRIVATE_KEY dan SMART_CONTRACT_ADDRESS harus diisi di .env");
  process.exit(1);
}

// Inisialisasi Ethers.js
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI Minimalis - Sesuaikan dengan file Solidity milikmu
// Merujuk pada Tabel 3.7: recordVerification() adalah fungsi utama pencetak jejak audit
const contractABI = ["function recordVerification(bytes32 userHash, string docType, bytes signature, uint256 timestamp, string metadata) public returns (bool)"];
const ezSignContract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

async function startWorker() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Memaksa proses antrean berjalan sekuensial (satu per satu)
    // Ini adalah pengamanan mekanis paling primitif untuk mencegah balapan (race condition) pada Nonce
    channel.prefetch(1);
    console.log(`[TX-Worker] Menunggu pesan di antrean "${QUEUE_NAME}"...`);
    console.log(`[TX-Worker] Terhubung ke RPC Besu: ${RPC_URL}`);
    console.log(`[TX-Worker] Menggunakan Master Wallet: ${wallet.address}`);

    channel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (msg !== null) {
          const payload = JSON.parse(msg.content.toString());
          console.log(`\n[TX-Worker] Memproses UserHash: ${payload.userHash}`);

          try {
            // Mendapatkan Nonce terbaru secara dinamis dari jaringan
            const currentNonce = await provider.getTransactionCount(wallet.address, "pending");

            // Eksekusi fungsi Smart Contract (eth_sendRawTx dibungkus secara otomatis oleh Ethers.js)
            const txResponse = await ezSignContract.recordVerification(
              payload.userHash,
              payload.docType,
              payload.signature,
              payload.timestamp,
              JSON.stringify(payload.metadata),
              { nonce: currentNonce } // Manajemen nonce terisolasi per transaksi
            );

            console.log(`[TX-Worker] Transaksi dikirim. TxHash: ${txResponse.hash}`);

            // Menunggu konsensus jaringan (Finalitas blok QBFT)
            const receipt = await txResponse.wait();
            console.log(`[TX-Worker] Transaksi Sukses! Terkonfirmasi di Blok: ${receipt.blockNumber}`);

            // Hapus pesan dari antrean HANYA jika transaksi blockchain berhasil
            channel.ack(msg);
          } catch (txError) {
            console.error("[TX-Worker] Gagal menginjeksi transaksi ke Jaringan Besu:", txError.message);
            // Kembalikan pesan ke antrean jika gagal, mencegah data hilang
            channel.nack(msg);
          }
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error("[TX-Worker] Kesalahan Kritis:", error.message);
    process.exit(1);
  }
}

startWorker();
