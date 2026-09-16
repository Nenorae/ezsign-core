// src/services/rabbitmq.js (Consumer)
// - Mendengarkan dan mengekstraksi pesan secara berurutan (strict FIFO) dari antrean tx_log_queue.
// - Menangani logika ACK saat mendapat TxHash atau saat timeout jaringan.
// - Mengarahkan pesan gagal mutlak (reverted) ke Dead Letter Queue untuk audit.
