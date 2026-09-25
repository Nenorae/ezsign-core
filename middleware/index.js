### `index.js` (Orkestrator Utama)

* **Peran:** Titik mula aplikasi (*entry point*).
* **Spesifikasi Wajib:**
* Lakukan *Dependency Injection* secara manual di sini. Inisialisasi koneksi basis data, koneksi RabbitMQ, dan pemuat konfigurasi.
* Suntikkan instansiasi *repository* dan *broker* ke dalam `logger_core.js`.
* Suntikkan `logger_core.js` ke dalam *router/server*.
* **Aturan Keras (Fail-Fast):** Jika koneksi ke DB atau RabbitMQ gagal saat *startup*, matikan proses secara paksa (`process.exit(1)`). Jangan biarkan peladen berjalan jika infrastrukturnya cacat.
