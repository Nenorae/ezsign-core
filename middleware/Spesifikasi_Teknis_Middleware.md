# Spesifikasi Teknis Middleware (Logging Backend API) pada Sistem ezSign

Dokumen ini menguraikan spesifikasi teknis, fungsi inti, alur komunikasi, dan metrik operasional untuk komponen **Middleware (Logging Backend API)** berdasarkan desain arsitektur sistem pencatatan audit asinkron.

## 1. Deskripsi dan Peran Utama
Middleware (Logging Backend API) adalah komponen krusial pada lapisan **Web2 Core Domain**. Bertindak sebagai gerbang akses utama (entry point) yang menstandardisasi lalu lintas permintaan multi-klien dan menjembatani interaksi sinkron dari pengguna ekosistem Web2 maupun Web3 menuju ekosistem pencatatan asinkron di Web3.

Peran utama komponen ini adalah menerapkan penjangkaran identitas privasi-preservatif (*privacy-preserving*) agar data mentah (PII) tidak terekspos.

## 2. Pemisahan Alur Data (Branching Logic): Klien Web2 vs Klien Web3
Terdapat pemisahan fungsional yang mutlak pada Middleware terkait perlakuan kredensial kriptografis dari klien pengirim. Middleware harus mengisolasi alur data antara pengguna Web2 dan Web3:

### A. Alur Klien Web3 (Native Crypto Wallet)
*   **Kondisi Klien:** Pengguna Web3 berinteraksi menggunakan dompet kriptografis mandiri dan memiliki pasangan kunci (Public/Private Key).
*   **Pemrosesan Middleware:** 
    Klien Web3 telah menandatangani *payload* mereka sendiri di sisi klien (*client-side*). Middleware **TIDAK PERLU** mengintervensi atau menyuntikkan otorisasi tambahan. Middleware hanya melakukan validasi awal lalu meneruskan *payload* tersebut ke antrean.

### B. Alur Klien Web2 (Tanpa Kredensial Kriptografis)
*   **Kondisi Klien:** Pengguna Web2 berinteraksi secara konvensional tanpa dompet digital atau pasangan kunci kriptografis.
*   **Pemrosesan Middleware (Penjamin Kredensial Web2):**
    Karena validasi *on-chain* (Smart Contract) membutuhkan verifikasi matematis via `ecrecover`, *payload* mentah dari Web2 akan langsung ditolak. Oleh karena itu, Middleware wajib bertindak sebagai **Penjamin Kredensial Web2**. Middleware harus mengeksekusi **tanda tangan kriptografis simulasi** secara *server-side* pada *payload* pengguna Web2 agar dianggap valid saat diproses di jaringan Web3.

## 3. Fungsi Inti dan Mekanisme Teknis
*   **Gerbang API Utama (API Gateway):** Menstandardisasi dan mengelola lalu lintas *request* dari berbagai klien.
*   **Generator User Hash (Pseudonimisasi):** Mengeksekusi *hashing* kriptografis terhadap identitas pengguna menjadi `User_Hash`.
*   **Penjamin Kredensial Web2:** Melakukan eksekusi tanda tangan kriptografis simulasi. Fungsi ini hanya diaktifkan untuk alur data klien Web2.

## 4. Alur Pemrosesan (Fase Transisi Sinkron ke Asinkron)
1.  **Request Verifikasi:** Middleware menerima inisiasi permintaan secara sinkron dari Aplikasi Mitra.
2.  **Validasi Eksternal:** Mengeksekusi pemanggilan ke API ezSign untuk memvalidasi dan mengekstraksi UUID pengguna.
3.  **Hashing & Pemetaan Relasional:** Memproses UUID menjadi *User Hash* dan mencatat relasi pemetaannya ke basis data (MariaDB/PostgreSQL).
4.  **Injeksi Kredensial (Cabang Logika):** 
    *   Jika sumber adalah Web2: Middleware menyuntikkan tanda tangan kriptografis simulasi ke dalam *payload*.
    *   Jika sumber adalah Web3: Lewati tahap injeksi ini.
5.  **Respons Instan:** Memberikan respons instan (status pemrosesan) kepada klien secara sinkron.
6.  **Publish ke Broker:** Mentransmisikan *payload* yang telah final ke dalam antrean *Message Broker* (RabbitMQ) untuk diproses oleh TX-Worker secara asinkron.

## 5. Spesifikasi Teknis Absolut & Metrik Kinerja
Kinerja Middleware diukur melalui skenario (FUN-01):
*   **Proteksi PII Mutlak:** Sebanyak 0 byte data mentah (PII) yang diizinkan tembus ke antrean RabbitMQ.
*   **Latensi Pemrosesan:** Waktu pemrosesan API wajib di bawah 500ms.
*   **Stabilitas Operasional:** Tingkat *error rate* 0% dari 1000 *request* konkuren. Tingkat keunikan *hash* harus mencapai 100%.

**Lalu lintas Web2 (Pengguna tanpa dompet):** Middleware melempar log ke RabbitMQ, lalu TX-Worker mengambil alih untuk menandatanganinya menggunakan Wallet Pool.  

**Lalu lintas Web3 (Pengguna dengan dompet):** Middleware memvalidasi payload yang sudah ditandatangani oleh klien, lalu langsung menyuntikkannya ke RPC Besu. TX-Worker sama sekali tidak boleh menyentuh alur ini. Jangan mengotori worker ini dengan beban di luar domain utamanya.