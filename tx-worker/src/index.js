// src/index.js (Orkestrator)
// - Menjadi titik awal (entry point) dari aplikasi.
// - Mengeksekusi kalibrasi nonce awal dengan melakukan kueri ke RPC Besu satu kali saat startup
//   untuk setiap alamat di WALLET_POOL.
// - Menyimpan status awal tersebut ke Redis sebelum mulai mendengarkan antrean.
// - Menjalankan cron job dan consumer setelah kalibrasi selesai.
