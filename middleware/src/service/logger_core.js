### `src/service/logger_core.js` (Otak Logika Bisnis)

* **Peran:** Mengeksekusi seluruh alur pemrosesan data.
* **Spesifikasi Wajib:**
1. Terima *payload* mentah dari *controller*.
2. Panggil `ezsign_api.js` untuk memvalidasi UUID (Tunggu asinkron).
3. Panggil `crypto.js` untuk mencetak `User_Hash` (Sinkron instan).
4. Panggil `database.js` untuk merekam relasi UUID dan Hash (Tunggu asinkron).
5. Bentuk *QueuedPayload* baru. **Jangan pernah memasukkan UUID asli ke objek baru ini.**
6. **Cabang Logika:** Evaluasi `client_type`.
* Jika Web2: Lempar ke `web2_pending_signature_queue` via RabbitMQ.
* Jika Web3: Validasi ketersediaan `signature`, lalu lempar ke `web3_ready_queue`.

* **Larangan Mutlak:** Dilarang mengimpor atau menggunakan modul HTTP (Axios/Fetch) atau modul MariaDB/RabbitMQ langsung di file ini. Semuanya harus melalui *repository* dan *broker* yang disuntikkan.
