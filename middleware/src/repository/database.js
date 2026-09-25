### `src/repository/database.js` (Akses Basis Data SQL)

* **Peran:** Lapisan persistensi tunggal untuk MariaDB/PostgreSQL.
* **Spesifikasi Wajib:**
* Gunakan *Connection Pooling* (seperti `pg` atau `mysql2/promise`). Dilarang membuat koneksi baru setiap kali *request* masuk.
* Buat fungsi `saveMapping(uuid, userHash)`.
* Tulis kueri murni menggunakan *prepared statements* untuk mencegah *SQL Injection*.
