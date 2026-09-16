// src/services/redis.js (State Management)
// - Mengeksekusi operasi inkrementasi atomik dengan perintah HINCRBY ezsign:wallet_nonces.
// - Memastikan tidak ada kondisi race-condition saat menentukan ASSIGNED_NONCE.
