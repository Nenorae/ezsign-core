### `src/utils/errors.js` (Kamus Eksepsi)

* **Peran:** Standardisasi kegagalan karena Anda tidak memakai TypeScript.
* **Spesifikasi Wajib:**
* Tulis kelas-kelas *Error* kustom. Contoh: `class ValidationFailError extends Error {}`, `class ExternalAPIError extends Error {}`.
* Gunakan kelas ini di `logger_core.js` saat *throw*, agar `controller.js` bisa mendeteksi tipe *error* dan menentukan apakah harus merespons HTTP 400 atau 500.
