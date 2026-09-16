// src/jobs/gapResolver.js (Mitigasi Anomali)
// - Dieksekusi oleh cron setiap 60 detik.
// - Mengevaluasi selisih antara nonce di RPC node dan di Redis.
// - Memaksa injeksi transaksi kosong (transfer 0 ETH ke diri sendiri) pada nonce spesifik
//   jika selisih melebihi angka 5 untuk memecah kebuntuan mempool.
