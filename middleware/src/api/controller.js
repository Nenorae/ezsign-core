### `src/api/controller.js` (Gerbang Validasi Murni)

* **Peran:** Menerima I/O HTTP, memvalidasi JSON, dan mengembalikan respons HTTP.
* **Spesifikasi Wajib:**
* **Tidak ada logika bisnis.** Anda dilarang melakukan pengecekan Web2/Web3 atau *hashing* di sini.
* **Validasi Agresif:** Karena Anda memakai Vanilla JS, Anda wajib menggunakan validator JSON Schema (bawaan Fastify atau Zod). Tolak *request* sebelum menyentuh memori dalam jika `client_type` bukan "web2" atau "web3", atau jika kolom `uuid` kosong.
* Teruskan *payload* yang sudah bersih ke `logger_core.js`.
* Kembalikan respons `202 Accepted` jika berhasil masuk antrean, atau proyeksikan *error* dari *service* menjadi `400 Bad Request` atau `500 Internal Server Error`.
