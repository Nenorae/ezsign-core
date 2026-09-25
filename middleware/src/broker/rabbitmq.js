### `src/broker/rabbitmq.js` (Klien Asinkronisasi)

* **Peran:** Menjembatani Middleware dengan pekerja (*worker*) di belakang layar.
* **Spesifikasi Wajib:**
* Simpan saluran (*channel*) RabbitMQ dalam memori (*reuse channel*). Membuat saluran baru per *request* akan menghancurkan performa I/O.
* Buat fungsi `publishToQueue(queueName, payload)`.
* Ubah objek *payload* (JSON) menjadi *Buffer* sebelum dikirim. Aktifkan mode pesan persisten agar log tidak hilang saat RabbitMQ *restart*.
