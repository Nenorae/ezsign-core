### `src/utils/config.js` (Pemuat Konfigurasi & Logger)

* **Peran:** Validasi lingkungan dan pencatatan sistem internal.
* **Spesifikasi Wajib:**
* Muat berkas `.env`. Lakukan validasi ketat. Jika variabel `RABBITMQ_URL` atau `SECRET_KEY` tidak ada, lempar *error* mematikan.
* Ekspor modul *logging* internal (gunakan `Pino` karena ia 5x lebih cepat dari Winston). Dilarang keras menggunakan `console.log` di seluruh aplikasi ini; operasi `console.log` bersifat memblokir I/O dan akan merusak latensi.
