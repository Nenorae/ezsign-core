### `src/api/server.js` (Infrastruktur Peladen)

* **Peran:** Mengatur kerangka kerja HTTP (wajib menggunakan Fastify, bukan Express).
* **Spesifikasi Wajib:**
* Registrasi *middleware* dasar: penanganan *CORS*, pembatasan laju (*rate limiting*), dan ID korelasi (untuk melacak *request*).
* Daftarkan *route* dari `controller.js`.
* Tangani *error* tingkat global agar tidak mengekspos *stack trace* mentah ke pengguna jika terjadi *uncaught exception*.
