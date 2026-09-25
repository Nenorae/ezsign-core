### `src/utils/crypto.js` (Mesin Pseudonimisasi)

* **Peran:** Merusak data mentah menjadi nilai statis yang aman.
* **Spesifikasi Wajib:**
* Wajib mengekspor fungsi sinkron murni. Tidak boleh ada `async/await`.
* Hanya gunakan modul bawaan `node:crypto`.
* Gunakan `crypto.createHmac('sha256', secretKey)` agar hasil *hash* tidak bisa dibongkar menggunakan *rainbow tables*.
