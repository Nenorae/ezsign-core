require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const amqp = require("amqplib");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = process.env.RABBITMQ_QUEUE || "ezsign_logging_queue";
const SALT_SECRET = process.env.SALT_SECRET || "default_salt";

let channel = null;

// ==========================================
// 1. KONEKSI RABBITMQ (Channel Reuse)
// ==========================================
async function initRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Pastikan antrean bersifat durable agar pesan aman saat broker restart
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
    });

    console.log(`[RabbitMQ] Terhubung & Antrean "${QUEUE_NAME}" siap.`);
  } catch (error) {
    console.error("[RabbitMQ] Gagal menghubungkan ke Broker:", error.message);
    process.exit(1);
  }
}

// ==========================================
// 2. FUNGSI LOGIKA VALIDATOR & HASHING (SIMULASI)
// ==========================================
function processIdentityValidation(identityPayload) {
  const { identityNumber, fullName, docType } = identityPayload;

  // Pseudonimisasi PII: Menghasilkan User_Hash dengan Salted SHA-256
  const rawData = `${identityNumber}:${fullName}:${SALT_SECRET}`;
  const userHash = "0x" + crypto.createHash("sha256").update(rawData).digest("hex");

  // Simulasi Penjamin Kredensial: Mock Signature (65-byte hex)
  const mockSignature = "0x" + crypto.randomBytes(65).toString("hex");

  return {
    userHash,
    docType: docType || "KTP",
    signature: mockSignature,
    validatedAt: Math.floor(Date.now() / 1000),
  };
}

// ==========================================
// 3. ENDPOINT UTAMA: REQUEST VERIFIKASI IDENTITAS
// ==========================================
app.post("/api/v1/verify-identity", async (req, res) => {
  const startTime = Date.now();
  const { identityNumber, fullName, docType, metadata } = req.body;

  // Validasi input awal
  if (!identityNumber || !fullName) {
    return res.status(400).json({
      success: false,
      message: "Parameter identityNumber dan fullName wajib diisi.",
    });
  }

  try {
    // Step A: Eksekusi Pseudonimisasi & Simulator Validasi (Sinkron)
    const validationResult = processIdentityValidation({ identityNumber, fullName, docType });

    // Step B: Susun Payload On-Chain (0 byte PII tembus ke antrean)
    const loggingPayload = {
      userHash: validationResult.userHash,
      docType: validationResult.docType,
      signature: validationResult.signature,
      timestamp: validationResult.validatedAt,
      metadata: metadata || {},
    };

    // Step C: Publikasi Payload ke RabbitMQ (Asinkron)
    if (!channel) {
      throw new Error("Channel RabbitMQ belum siap.");
    }

    const messageBuffer = Buffer.from(JSON.stringify(loggingPayload));
    channel.sendToQueue(QUEUE_NAME, messageBuffer, {
      persistent: true, // Pesan tersimpan persisten ke disk oleh RabbitMQ
    });

    const processingLatencyMs = Date.now() - startTime;

    // Step D: Kembalikan respons instan ke Klien / Wallet (< 500ms)
    return res.status(200).json({
      success: true,
      status: "VALIDATED_AND_QUEUED",
      latencyMs: processingLatencyMs,
      data: {
        userHash: validationResult.userHash,
        signature: validationResult.signature,
        queuedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Middleware Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal memproses validasi identitas ke antrean logging.",
    });
  }
});

// ==========================================
// 4. START SERVER
// ==========================================
app.listen(PORT, async () => {
  console.log(`[Middleware API] Berjalan pada http://localhost:${PORT}`);
  await initRabbitMQ();
});
