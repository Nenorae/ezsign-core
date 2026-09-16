# Spesifikasi Teknis TX-Worker pada Sistem ezSign

## 1. Deskripsi dan Peran Utama

TX-Worker adalah komponen inti pada lapisan **Web3 & Logging Domain** yang bertugas mengeksekusi proses asinkronisasi pencatatan log on-chain. Peran utamanya adalah memisahkan beban (*decoupling*) antara interaksi pengguna Web2 yang bersifat sinkron dengan proses kriptografis di Web3.

Dengan mengambil alih kompleksitas injeksi transaksi, TX-Worker memastikan perangkat klien terbebas dari beban komputasi dan biaya gas jaringan, serta mencegah lonjakan latensi pada API utama ezSign.

---

## 2. Batasan Absolut

TX-Worker beroperasi dengan aturan berikut:

- Eksekusi bersifat **asinkron penuh**.
- TX-Worker **dilarang keras** memiliki akses langsung ke *private key*.
- TX-Worker **dilarang keras** menanyakan *nonce* terkini ke RPC Node Besu saat runtime.
- Seluruh transaksi dieksekusi dengan `gasPrice = 0` pada Zero-Gas Network.
- Tidak ada manajemen saldo token.
- Beban komputasi dan biaya gas yang dibebankan ke perangkat pengguna/klien wajib nol (0).
- Operasi penandatanganan oleh KMS harus memiliki tingkat keberhasilan 100%.
- TX-Worker tidak berkomunikasi langsung dengan *Validator Nodes* (Node 1-4).
- Transmisi hanya diarahkan ke RPC Node eksternal, yaitu Node 5/6 Hyperledger Besu.

---

## 3. Komponen dan Infrastruktur

Komponen pendukung TX-Worker:

- **Message Broker:** RabbitMQ dengan queue `tx_log_queue`.
- **KMS:** HashiCorp Vault dengan Ethereum Plugin.
- **Wallet Pool:** 10 alamat publik yang berasal dari *private key* internal Vault.
- **State Store Nonce:** Redis.
- **Tx Builder:** Modul internal untuk merangkum payload dari antrean menjadi instruksi Smart Contract yang sah.
- **RPC Endpoint:** Node 5/6 Hyperledger Besu melalui HTTP port `8545`.
- **Gap Resolver:** Cron job untuk menangani anomali nonce.

---

## 4. Inisialisasi State & Wallet Pool

Sebelum TX-Worker mulai mengonsumsi pesan, *wallet pool* harus disiapkan dan *nonce* awal disinkronkan ke Redis.

### 4.1 Konfigurasi Vault KMS

1. Bangkitkan 10 *private key* eksklusif secara internal di dalam HashiCorp Vault.
2. Ekstrak 10 Alamat Publik dari kunci-kunci tersebut.
3. Kumpulan alamat ini membentuk `WALLET_POOL`.
4. Berikan TX-Worker token akses Vault dengan policy yang HANYA mengizinkan endpoint penandatanganan (`/sign`).
5. Akses ekspor kunci diblokir.

### 4.2 Sinkronisasi Nonce Redis Saat Startup

Saat TX-Worker melakukan *booting* atau *restart*, ia harus mengkalibrasi ulang status *nonce* untuk setiap dompet ke Redis.

- Lakukan kueri ke RPC Besu **satu kali saja** pada saat startup untuk setiap alamat di `WALLET_POOL`.
- Simpan ke Redis dengan tipe struktur Hash:
  - **Key:** `ezsign:wallet_nonces`
  - **Field:** `<0xAddress...>`
  - **Value:** `<Current_Nonce_From_RPC>`

---

## 5. Alur Pemrosesan dan Komunikasi Antar-Sistem

Siklus kerja TX-Worker beroperasi secara asinkron dengan alur sebagai berikut:

### Langkah 1: Consume
TX-Worker secara pasif mendengarkan dan mengekstraksi pesan log secara berurutan (*strict FIFO*) dari RabbitMQ.

### Langkah 2: Round-Robin Wallet Selection
TX-Worker memilih alamat dompet secara *round-robin* berbasis thread atau menggunakan counter modular di Redis.

```text
SELECTED_WALLET = WALLET_POOL[ MESSAGE_INDEX % POOL_SIZE ]
```

### Langkah 3: Atomic Nonce Fetching
Ambil dan tingkatkan nonce secara atomik di Redis untuk dompet yang terpilih.

```text
CURRENT_NONCE = HINCRBY ezsign:wallet_nonces SELECTED_WALLET 1
ASSIGNED_NONCE = CURRENT_NONCE - 1
```

Nilai `ASSIGNED_NONCE` adalah nonce mutlak untuk transaksi ini.

### Langkah 4: Perakitan Transaksi Unsigned
Rakit objek transaksi Ethereum mentah. Karena jaringan bersifat Zero-Gas, hilangkan perhitungan dinamis.

```json
{
  "to": "<SMART_CONTRACT_ADDRESS>",
  "data": "<ENCODED_ABI_LOG_SAVED_FUNCTION>",
  "nonce": ASSIGNED_NONCE,
  "gasLimit": 500000,
  "gasPrice": 0,
  "chainId": "<BESU_CHAIN_ID>"
}
```

### Langkah 5: Delegasi Penandatanganan KMS
Kirim objek mentah ke HashiCorp Vault untuk ditandatangani.

- **Request:** POST ke Vault `/transit/keys/{SELECTED_WALLET}/sign` dengan muatan hash transaksi.
- **Response:** Vault mengembalikan `SIGNED_RAW_TX` dalam format heksadesimal RLP.

### Langkah 6: Injeksi ke Jaringan
Kirim `SIGNED_RAW_TX` ke RPC Besu Node 5/6 melalui HTTP port `8545` menggunakan metode JSON-RPC `eth_sendRawTx`.

### Langkah 7: ACK, Timeout, dan DLQ
- Jika respons sukses berupa `TxHash`, lakukan ACK pesan di RabbitMQ.
- Jika respons timeout, tetap ACK pesan dan asumsikan transaksi tertunda di mempool. Jangan mengurangi nonce di Redis.
- Jika respons gagal mutlak, misalnya *reverted*, ACK pesan dan masukkan ke log/Dead Letter Queue untuk audit.

---

## 6. Mitigasi Anomali Nonce (Gap Resolver)

Akibat arsitektur terdistribusi, dapat terjadi kondisi di mana transaksi dengan nonce tertentu gagal diproses KMS atau terputus di jaringan, sedangkan nonce setelahnya berhasil masuk RPC. Transaksi setelahnya akan tertahan di mempool karena Besu menuntut nonce berurutan.

**Fungsi Cron Gap Filler:**
1. Setiap 60 detik, evaluasi selisih antara nonce di RPC node dan nonce di Redis.
2. Jika `Redis_Nonce - RPC_Nonce > 5`:
   - Identifikasi nonce spesifik yang hilang di mempool.
   - Paksa injeksi **Transaksi Kosong** berupa transfer 0 ETH ke diri sendiri menggunakan nonce yang hilang tersebut.
   - Ini akan membuka bendungan mempool secara instan.

---

## 7. Metrik Kinerja dan Pengujian

TX-Worker diukur berdasarkan standar pengujian beban performa tinggi:

- **Fungsional (FUN-02):**
  - Delivery rate dari RabbitMQ ke TX-Worker harus mencapai 100% pada 500 pesan.
  - Antrean wajib menjaga konsistensi urutan *Strict FIFO*.
- **Ketahanan Beban (PERF-01):**
  - TX-Worker beserta manajemen nonce-nya harus mampu memproses injeksi asinkron, misalnya 500 request berturut-turut, tanpa menyebabkan gagal konsensus.
  - Indikator error *nonce too low* harus berada pada persentase mutlak 0%.
- **Stabilitas Penandatanganan:**
  - Operasi penandatanganan oleh KMS harus memiliki tingkat keberhasilan 100%.
- **Beban Klien:**
  - Beban komputasi dan biaya gas yang dibebankan kepada perangkat pengguna/klien wajib 0.

---

## 8. Catatan Konsolidasi

Dokumen ini menggabungkan dua spesifikasi TX-Worker. Konflik utama diselesaikan sebagai berikut:

- KMS tidak lagi menggunakan konsep Master Wallet tunggal, melainkan Wallet Pool 10 alamat yang disimpan di HashiCorp Vault.
- TX-Worker tidak memiliki akses *private key* dan hanya meminta tanda tangan melalui endpoint KMS.
- Manajemen nonce menggunakan Redis *atomic increment*, bukan kueri *runtime* ke Besu.
- Kueri nonce ke RPC Besu hanya dilakukan sekali saat *startup*.
- RPC endpoint menggunakan Node 5/6 Hyperledger Besu pada port `8545`.