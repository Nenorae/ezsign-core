### `src/repository/ezsign_api.js` (Klien Eksternal)

* **Peran:** Berkomunikasi dengan *backend* Web2 lama.
* **Spesifikasi Wajib:**
* Buat fungsi asinkron untuk memverifikasi UUID.
* **Batas Waktu (Timeout):** Wajib atur *timeout* maksimal 100-200ms. Jika API luar lambat, gagalkan *request* secara internal. Jangan biarkan *thread* aplikasi Anda tersandera oleh *server* lain yang sedang bermasalah.
