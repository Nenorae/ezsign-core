Berdasarkan dokumen yang Anda berikan, berikut adalah analisis teknis komprehensif mengenai kebutuhan dan spesifikasi operasional *middleware* dari awal hingga akhir siklus pemrosesan.

Dalam arsitektur sistem ini, *middleware* (yang juga disebut sebagai *Logging Backend API*) beroperasi pada *Web2 Core Domain* dan bertindak sebagai jembatan yang mengintegrasikan platform ezSign (lingkungan Web2) dengan infrastruktur Web3 (jaringan blockchain). Tujuan utamanya adalah untuk memisahkan beban komputasi secara asinkron dan menerapkan penjangkaran identitas yang menjaga privasi pengguna (*privacy-preserving*).

### 1. Kebutuhan Fungsi Inti Middleware

*Middleware* memikul tiga fungsi operasional teknis absolut di dalam sistem:

* **Gerbang API (API Gateway)**: Berfungsi sebagai titik masuk utama untuk mengelola pemrosesan lalu lintas jaringan, serta menstandardisasi permintaan (*request*) yang masuk dari berbagai aplikasi multiklien.


* **Generator Hash Pengguna (*User Hash Generator*)**: Bertanggung jawab melakukan pseudonimisasi identitas melalui proses *hashing*. Proses ini mutlak diperlukan sebagai proteksi agar Data Identitas Pribadi (PII) tidak masuk dan terekspos secara mentah ke dalam jaringan *on-chain*.


* **Penjamin Kredensial Web2**: Bertugas mengeksekusi tanda tangan kriptografis simulasi. Hal ini memastikan bahwa muatan (*payload*) pengguna dari lingkungan Web2 memiliki otorisasi matematis yang valid untuk diproses di ekosistem Web3.



### 2. Alur Teknis Pemrosesan Middleware (Siklus End-to-End)

Siklus kerja *middleware* melibatkan transisi dari pemrosesan sinkron ke eksekusi asinkron, dengan alur teknis sebagai berikut:

* **Fase 1: Inisiasi Permintaan (Sinkron)**: Aplikasi mitra menginisiasi permintaan verifikasi identitas pengguna dengan mengirimkannya langsung menuju gerbang utama pemrosesan *middleware* (*Logging Backend API*).


* **Fase 2: Ekstraksi Identitas (Sinkron)**: *Middleware* mengeksekusi pemanggilan API menuju sistem ezSign. Tujuannya adalah untuk memvalidasi sekaligus mengekstraksi identitas universal pengguna, yang direpresentasikan dalam bentuk *Global ezSign UUID*.


* **Fase 3: Hashing Kriptografis & Pemetaan (Sinkron)**: Setelah menerima hasil validasi, *middleware* memproses data tersebut melalui mekanisme *hashing* kriptografis untuk menghasilkan *User_Hash* yang unik. Selanjutnya, *middleware* mencatat relasi pemetaan data ini ke dalam basis data relasional. Mekanisme ini memastikan bahwa hanya nilai *hash* terenkripsi beserta parameter otorisasi matematis yang akan diteruskan ke *Smart Contract*, tanpa sedikit pun mengekspos data mentah identitas pengguna.


* **Fase 4: Respons Klien (Sinkron)**: *Middleware* secara instan mendelegasikan respons kepada aplikasi mitra (klien) berupa informasi status pemrosesan awal.


* **Fase 5: Transmisi Antrean (Asinkron)**: *Middleware* membungkus data menjadi *payload* yang telah ditandatangani dengan bukti kriptografis (sebagai penjamin). *Payload* ini kemudian ditransmisikan dan didorong (*Push*) ke dalam antrean *Message Broker* (RabbitMQ) untuk dieksekusi secara asinkron oleh *TX-Worker* ke jaringan blockchain. Pendelegasian ke *Message Broker* ini secara signifikan mereduksi beban komputasi dari sisi klien dan memisahkan interaksi sinkron dari proses pencatatan *on-chain*.



### 3. Standar Metrik Kinerja dan Pengujian Absolut

Untuk menjamin keamanan dan efisiensi, *middleware* dirancang harus memenuhi metrik teknis absolut (pada parameter uji FUN-01 fokus *API Routing & Hashing*) sebagai berikut:

* *Middleware* harus memiliki tingkat galat (*error rate*) sebesar 0% ketika dihantam dengan beban 1000 permintaan.


* Waktu latensi untuk keseluruhan pemrosesan pemanggilan API tidak boleh melebihi 500 milidetik (< 500ms).


* Tingkat keberhasilan dalam menghasilkan *hash* yang unik harus mencapai 100%.


* Sebagai mitigasi keamanan data PII, *middleware* harus menjamin secara absolut bahwa 0 *byte* data identitas pribadi menembus ke dalam *Message Broker* (RabbitMQ).