# HASIL PENGUJIAN END-TO-END & CATATAN PERBAIKAN
## Middleware -> RabbitMQ -> TX-Worker -> Vault KMS -> Hyperledger Besu

**Tanggal eksekusi** : 2026-10-01 10:25:38 s/d 10:27:14
**Perintah** : `bash test-e2e/run_all.sh`
**Perintah keluar** : `EXIT=1`
**Ringkasan akhir** : 9 skenario, **8 LULUS**, **1 GAGAL**

---

## 1. Ringkasan Eksekusi

| No | Skrip | Hasil | Keterangan Singkat |
| :-- | :--- | :--- | :--- |
| 00 | `00_prasyarat_dan_info.sh` | **LULUS** | 12 PASS / 2 FAIL (kedua FAIL adalah variabel `.env` belum diisi) |
| 01 | `01_uji_crypto.sh` | **LULUS** | 6/6 PASS |
| 02 | `02_validasi_skema_http.sh` | **LULUS** | 8/8 PASS |
| 03 | `03_zero_pii_leak.sh` | **LULUS** | 4/4 PASS |
| 04 | `04_persistensi_mapping.sh` | **LULUS** | 3 PASS + 1 INFO (mode in-memory) |
| 05 | `05_rantai_middleware_txworker.sh` | **LULUS** | Skenario mengonfirmasi temuan, keluar sukses |
| 06 | `06_txworker_nonce_kms.sh` | **GAGAL** | 7 PASS / 1 FAIL (`SMART_CONTRACT_ADDRESS` kosong) |
| 07 | `07_end_to_end_onchain.sh` | **LULUS** | Skenario menyelesaikan seluruh tahap; injeksi on-chain belum terjadi |
| 08 | `08_beban_konkuren.sh` | **LULUS** | Error rate 0%, latensi 13,1 ms |

### 1.1 Catatan PENTING tentang Status "LULUS"

Skrip `05` dan `07` melaporkan **LULUS** karena skrip tersebut selesai berjalan tanpa kesalahan, **tetapi isinya justru membuktikan rantai belum tersambung**. Artinya:

- "LULUS" pada skenario 05 dan 07 berarti **skrip berjalan sukses dan menghasilkan diagnosa yang valid**, bukan berarti transaksi berhasil masuk blockchain.
- Skenario 07 mendeteksi **0 blok baru** dan **0 transaksi dari wallet pool** selama 45 detik pemantauan.

---

## 2. Daftar Semua Kesalahan (Error) yang Terjadi

### 2.1 Kesalahan Kategori Blocker (Menghentikan Rantai End-to-End)

| ID | Pesan Error | Lokasi | Akar Masalah |
| :-- | :--- | :--- | :--- |
| E-01 | `SMART_CONTRACT_ADDRESS is missing in environment variables.` | `tx-worker/src/core/txBuilder.js:29` (dipicu dari `tx-worker/src/index.js:67`) | Variabel `.env` bernilai placeholder `<ALAMAT_KONTRAK_YANG_SUDAH_DIDEPLOY>` sehingga tidak lolos validasi |
| E-02 | Pesan menumpuk: `web2_pending_signature_queue: pesan=7 consumer=0` | Skrip 05; sumber: `middleware/src/service/logger_core.js` vs `tx-worker/src/services/rabbitmq.js` | TX-Worker mendengarkan `tx_log_queue`, sedangkan Middleware mempublikasikan ke `web2_pending_signature_queue` |
| E-03 | `Antrean undefined: tidak ada` | Skrip 07 TAHAP 3 | Variabel `WEB2_QUEUE` tidak diteruskan ke proses Node (bug skrip uji, sudah diperbaiki) |
| E-04 | `[WARN] Tidak ada blok baru` (15/15 pemantauan) | Skrip 07 TAHAP 4 | Tidak ada transaksi yang diinjeksikan ke Besu karena E-01 dan E-02 |
| E-05 | `Total transaksi dari wallet pool (20 blok terakhir): 0` | Skrip 07 TAHAP 5 | Konsekuensi langsung dari E-01 dan E-02 |

### 2.2 Kesalahan Kategori Variabel Lingkungan Belum Terisi

| ID | Variabel | Nilai Saat Ini | Dampak |
| :-- | :--- | :--- | :--- |
| E-06 | `SMART_CONTRACT_ADDRESS` | `<ALAMAT_KONTRAK_YANG_SUDAH_DIDEPLOY>` | Blocker mutlak (E-01) |
| E-07 | `BESU_CHAIN_ID` | Tidak ada di `.env` | `txBuilder.chainId` menjadi `undefined`; validasi `buildUnsignedTx` gagal bila `SMART_CONTRACT_ADDRESS` diisi |
| E-08 | `MASTER_WALLET_PRIVATE_KEY` | `<PRIVATE_KEY_DOMPET_PENGIRIM_TANPA_0x>` | Hanya dipakai `tx-worker/worker.js` (legacy), tidak mengganggu jalur utama |

### 2.3 Kesalahan Kategori Messaging/Noise

| ID | Pesan | Sumber | Sifat |
| :-- | :--- | :--- | :--- |
| E-09 | `◇ injected env (22) from .env // tip: ...` | `dotenv` v17 (`middleware`, `tx-worker`) | Informatif, bukan error, namun mengotori keluaran |
| E-10 | `◇ injected env (0) from .env` berulang 5× | `dotenv` dipanggil ulang di setiap modul `tx-worker/src/*` | Redundan; setiap modul memanggil `require('dotenv').config()` sendiri |

### 2.4 Kesalahan Kategori Inkonsistensi Data

| ID | Temuan | Detail |
| :-- | :--- | :--- |
| E-11 | Entri Redis `ezsign:wallet_nonces` berjumlah **20**, padahal `WALLET_POOL` hanya **10** alamat | Terdapat 10 alamat lama yang tidak pernah dibersihkan dari kalibrasi pool versi sebelumnya. Contoh alamat yatim: `0x31Eb79046f7fD7f92D5b14BFDEa25616153C73F7`, `0x5d0cfDcbC48c04ae4baEc6332B10DB3e9A3cE1Df`, dst. |
| E-12 | `tx_log_queue` memiliki `consumer=1`, tetapi `web2_pending_signature_queue` memiliki `consumer=0` | Konfirmasi E-02: consumer tunggal tidak menunjuk antrean yang benar |

---

## 3. Daftar Semua Kekurangan (Deficiencies) Arsitektural

### K-01: Kesenjangan Nama Antrean (Queue Name Mismatch) — **KRITIS**

| Aspek | Nilai |
| :--- | :--- |
| Middleware (`middleware/src/service/logger_core.js:19`) | `web2_pending_signature_queue` (nilai fallback) |
| Middleware config (`middleware/src/utils/config.js:35`) | `process.env.RABBITMQ_WEB2_QUEUE` |
| TX-Worker (`tx-worker/src/services/rabbitmq.js:8`) | **hardcoded** `tx_log_queue` |
| TX-Worker config (`tx-worker/src/config.js:17`) | **hardcoded** `tx_log_queue` |
| TX-Worker log (`tx-worker/src/index.js:110`) | teks **hardcoded** `tx_log_queue` |

**Bukti**: skrip 05 menunjukkan `web2_pending_signature_queue: pesan=7 consumer=0` dan `tx_log_queue: pesan=0 consumer=1`.

**Penyebab**: `tx-worker/src/services/rabbitmq.js` tidak membaca variabel lingkungan sama sekali; nilai `tx_log_queue` ditulis langsung.

### K-02: Skema Payload Antrean Tidak Cocok — **KRITIS**

| Komponen | Field yang Dikirim/Diharapkan |
| :--- | :--- |
| Middleware mengirim (`logger_core.js`) | `userHash`, `docType`, `timestamp`, `metadata`, `clientType`, `signature` |
| TX-Worker mengharapkan (`tx-worker/src/index.js:61`) | `content.encodedData` **atau** `content.data` |

**Bukti**: `tx-worker/src/index.js:62-64` melempar `Message content missing encodedData` bila tidak ada keduanya.

**Dampak**: meskipun K-01 diperbaiki (nama antrean disamakan), TX-Worker tetap akan **menolak setiap pesan** karena tidak menemukan `encodedData`.

**Akar masalah lebih dalam**: Middleware tidak melakukan **ABI encoding**; ia hanya mengirim objek JSON. Proses encoding ABI seharusnya terjadi **sebelum** injeksi, namun belum diimplementasikan di Middleware maupun TX-Worker.

### K-03: Kontrak Antarmuka Vault Tidak Sesuai — **KRITIS**

| Aspek | Kode Saat Ini | Kontrak Vault Aktual |
| :--- | :--- | :--- |
| Endpoint | `POST /v1/transit/keys/{wallet}/sign` (`vault.js:22`) | `POST /v1/ethereum/accounts/{name}/sign-tx` |
| Body | `{ transaction: rawTxObject }` (`vault.js:31`) | `{ to, data, nonce, gas_limit, gas_price, amount, encoding }` |
| Field respons | `response.data.data.signed_transaction` (`vault.js:43`) | (belum diverifikasi; plugin `vault-ethereum` mengembalikan `signed_transaction`) |
| Mount path | `transit/` (tidak ada) | `ethereum/` (aktif) |

**Bukti**: `vault path-help ethereum/accounts/eth-wallet-1/sign-tx` mengembalikan parameter `address`, `amount`, `data`, `encoding`, `gas_limit`, `gas_price`, `nonce`, `to`. Mount `transit/` tidak terdaftar pada `sys/mounts` (hanya `ethereum/`, `secret/`, `cubbyhole/`, `sys/`, `identity/`, `agent-registry/`).

**Dampak**: `vaultService.signTransaction()` akan selalu gagal `404`/`405` pada Vault.

### K-04: Tidak Ada Modul ABI Encoding

- `tx-worker/src/config.js:52` mendefinisikan `LOG_SAVED_FUNCTION` sebagai **string signature kosong** `'logSaved(string,string,uint256)'` tanpa encoder.
- Tidak ditemukan pemakaian `ethers`, `Interface`, `encodeFunctionData`, atau `abi.encode` di `tx-worker/src/`.
- `txBuilder.buildUnsignedTx()` hanya menerima `encodedData` apa adanya; tidak melakukan encoding.

### K-05: Ketidaksesuaian Definisi ABI Fungsi Kontrak

| Sumber | Signature | Catatan |
| :--- | :--- | :--- |
| `tx-worker/worker.js:24` (legacy) | `recordVerification(bytes32,string,bytes,uint256,string)` | 5 parameter |
| `tx-worker/src/config.js:52` | `logSaved(string,string,uint256)` | 3 parameter, ditandai placeholder |

Kedua definisi saling bertentangan dan keduanya belum tentu cocok dengan kontrak yang benar-benar ter-deploy.

### K-06: Dua Implementasi TX-Worker Berdampingan

| Berkas | Status | Dipakai? |
| :--- | :--- | :--- |
| `tx-worker/src/index.js` (via `npm run start:tx-worker`) | Aktif | Ya |
| `tx-worker/worker.js` | Legacy, memakai `MASTER_WALLET_PRIVATE_KEY` + `ethers.js` langsung | Tidak |

`worker.js` menggunakan antrean `ezsign_logging_queue` (dari `RABBITMQ_QUEUE`), menambah kebingungan karena ada **tiga** nama antrean berbeda di seluruh repositori.

### K-06b: Implementasi Middleware Legacy Berdampingan

| Berkas | Status | Antrean | Dipakai? |
| :--- | :--- | :--- | :--- |
| `middleware/index.js` + `middleware/src/` | Aktif | `web2_pending_signature_queue` / `web3_ready_queue` | Ya |
| `middleware/server.js` | Legacy (Express) | `ezsign_logging_queue` (dari `RABBITMQ_QUEUE`) | Tidak |

`middleware/server.js` masih memakai Express dan antrean `ezsign_logging_queue`. Bila dijalankan, ia akan membuat antrean **keempat** yang berbeda dan menambah kebingungan konfigurasi.

### K-07: `VAULT_ADDR` dan `REDIS_URL` Tidak Didefinisikan di `.env`

- Kode `vault.js:7` dan `redis.js:6` menggunakan fallback `http://localhost:8200` dan `redis://localhost:6379`.
- Keduanya berfungsi karena memakai default, namun tidak eksplisit di `.env`, sehingga menyulitkan portabilitas lingkungan.

### K-08: `ALLOW_IN_MEMORY_DB=true` Menonaktifkan Verifikasi Persistensi

- Skrip 04 melaporkan `[INFO] Mode in-memory aktif` sehingga verifikasi tabel `identity_mappings` dilewati.
- Akibatnya, klaim "tercatat ke basis data relasional" (DOKUMENTASI_TEKNIS_MIDDLEWARE.md Bab 2.1 no. 4) belum terverifikasi secara langsung.

---

## 4. Rekapitulasi Variabel Lingkungan: Nama yang Tidak Pas

### 4.1 Variabel yang Ada di `.env` Tapi TIDAK Dibaca Kode

| Variabel `.env` | Dibaca oleh kode? | Catatan |
| :--- | :--- | :--- |
| `RABBITMQ_QUEUE` (= `ezsign_logging_queue`) | Tidak langsung oleh jalur utama | Hanya dipakai `tx-worker/worker.js` legacy |
| `MASTER_WALLET_PRIVATE_KEY` | Hanya `tx-worker/worker.js` | Legacy |
| `SMART_CONTRACT_ADDRESS` | Ya, tapi bernilai placeholder | Blocker E-01 |

### 4.2 Variabel yang Dibaca Kode Tapi TIDAK Ada di `.env`

| Variabel | Dibaca di | Fallback |
| :--- | :--- | :--- |
| `BESU_CHAIN_ID` | `tx-worker/src/config.js:12`, `tx-worker/src/core/txBuilder.js:11` | `undefined` (merusak validasi) |
| `VAULT_ADDR` | `tx-worker/src/services/vault.js:7` | `http://localhost:8200` |
| `REDIS_URL` | `tx-worker/src/services/redis.js:6` | `redis://localhost:6379` |
| `ABI_LOG_SAVED_FUNCTION` | `tx-worker/src/config.js:52` | `'logSaved(string,string,uint256)'` |
| `DB_CLIENT` | `middleware/src/repository/database.js:10` | diturunkan dari `DATABASE_URL` |
| `DB_HOST` | `middleware/src/repository/database.js:34,52` | `localhost` |
| `DB_PORT` | `middleware/src/repository/database.js:35,53` | `5432` / `3306` |
| `DB_USER` | `middleware/src/repository/database.js:36,54` | `postgres` / `root` |
| `DB_PASSWORD` | `middleware/src/repository/database.js:37,55` | string kosong |
| `DB_NAME` | `middleware/src/repository/database.js:38` | `ezsign_db` |
| `NODE_ENV` | `middleware` (test mode), `tx-worker` | tidak disetel |

### 4.3 Ketidaksesuaian Nama Antrean — Tabel Keputusan

| Nama Antrean | Didefinisikan di | Nilai |
| :--- | :--- | :--- |
| `web2_pending_signature_queue` | `.env` (`RABBITMQ_WEB2_QUEUE`), Middleware config & service | Dipakai Middleware untuk klien Web2 |
| `web3_ready_queue` | `.env` (`RABBITMQ_WEB3_QUEUE`), Middleware config & service | Dipakai Middleware untuk klien Web3 |
| `tx_log_queue` | Hardcoded di `tx-worker/src/services/rabbitmq.js` & `config.js` | Dipakai TX-Worker |
| `ezsign_logging_queue` | `.env` (`RABBITMQ_QUEUE`) | Hanya dipakai `tx-worker/worker.js` legacy |

**Tindakan yang diperlukan**: menyatukan **satu** nama antrean yang dipakai bersama oleh Middleware dan TX-Worker. Pilihan paling bersih adalah menambahkan variabel tunggal, misalnya `RABBITMQ_TX_QUEUE`, yang dibaca kedua komponen.

### 4.4 Rencana Perubahan Variabel (Usulan, Belum Diterapkan)

| Variabel | Status Saat Ini | Usulan |
| :--- | :--- | :--- |
| `RABBITMQ_TX_QUEUE` | Belum ada | Tambahkan; dipakai Middleware sebagai tujuan publish dan TX-Worker sebagai sumber consume |
| `BESU_CHAIN_ID` | Dibaca kode, tidak ada di `.env` | Tambahkan dengan nilai `1337` (sesuai `besu/genesis.json`) |
| `SMART_CONTRACT_ADDRESS` | Placeholder | Isi dengan alamat kontrak hasil deploy |
| `VAULT_ADDR` | Dibaca kode, tidak ada di `.env` | Tambahkan eksplisit `http://127.0.0.1:8200` |
| `REDIS_URL` | Dibaca kode, tidak ada di `.env` | Tambahkan eksplisit `redis://localhost:6379` |
| `ABI_LOG_SAVED_FUNCTION` | Dibaca kode, tidak ada di `.env` | Tambahkan atau hapus dan ganti mekanisme encoding ABI yang nyata |
| `MASTER_WALLET_PRIVATE_KEY` | Placeholder, hanya legacy | Hapus bila `tx-worker/worker.js` tidak lagi dipakai |
| `RABBITMQ_QUEUE` | `.env`, hanya legacy | Hapus bila `tx-worker/worker.js` tidak lagi dipakai |

---

## 5. Yang Bisa dan Tidak Bisa Diverifikasi

### 5.1 Yang SUDAH Terverifikasi (Lulus)

| No | Kemampuan | Skrip | Bukti |
| :-- | :--- | :--- | :--- |
| 1 | Middleware `GET /health` responsif | 00 | `status: UP`, latensi < 2 ms |
| 2 | Modul crypto deterministik & format sah | 01 | 6/6 PASS; hash `0x`+64 hex; signature 132 karakter, `v=1b` |
| 3 | Validasi skema Ajv menolak payload cacat | 02 | 4 kasus → HTTP 400 |
| 4 | Validasi skema Ajv menerima payload sah | 02 | 2 kasus → HTTP 202 |
| 5 | Propagasi `x-correlation-id` | 02 | Header dikembalikan sesuai input |
| 6 | Zero PII Leak pada payload antrean | 03 | UUID mentah tidak ada; hanya `userHash`+metadata |
| 7 | Signature simulasi Web2 tersemat | 03 | Pola `0x`+130 hex terverifikasi |
| 8 | Upsert idempoten (tanpa duplicate key) | 04 | Dua pendaftaran UUID sama → 2× HTTP 202 |
| 9 | Hash deterministik lintas request | 04 | Hash identik untuk UUID sama |
| 10 | Koneksi RabbitMQ & deklarasi antrean | 00, 05 | `tx_log_queue` ada |
| 11 | Koneksi Redis & struktur nonce | 00, 06 | `ezsign:wallet_nonces` ada |
| 12 | Vault KMS aktif & 10 dompet terdaftar | 00, 06 | `eth-wallet-1` s/d `eth-wallet-10` |
| 13 | Round-robin wallet pool (10 alamat) | 06 | 12 indeks konsisten |
| 14 | Atomic nonce increment (HNCRBY) | 06 | Delta = 1, state konsisten |
| 15 | Tx builder menegakkan `gasPrice=0` | 06 | (tervalidasi sebelum gagal di `to`) |
| 16 | Besu RPC responsif | 00, 06, 07 | Chain ID `0x539` (1337), blok `0x61` (97) |
| 17 | Error rate 0% pada 1.000 konkuren | 08 | 1.000/1.000 → HTTP 202 |
| 18 | Latensi di bawah 500 ms & 50 ms | 08 | rata-rata 13,1 ms; p95 32 ms |
| 19 | Throughput tinggi | 08 | 2.057 req/detik |
| 20 | Middleware & TX-Worker berproses | 00 | Keduanya berjalan (PID aktif) |

### 5.2 Yang TIDAK BISA Diverifikasi (Terblokir)

| No | Kemampuan | Blokir oleh | Alasan |
| :-- | :--- | :--- | :--- |
| 1 | Pesan Middleware dikonsumsi TX-Worker | K-01 | Nama antrean berbeda |
| 2 | TX-Worker memproses payload Middleware | K-02 | Tidak ada `encodedData` |
| 3 | ABI encoding payload menjadi calldata | K-04 | Modul tidak ada |
| 4 | Penandatanganan transaksi oleh Vault KMS | K-03 | Endpoint transit tidak ada; harus `sign-tx` |
| 5 | Injeksi transaksi ke Besu (`eth_sendRawTransaction`) | K-01, K-02, K-03, E-01 | Rantai putus di beberapa titik |
| 6 | Transaksi tercatat sebagai receipt on-chain | Sama seperti di atas | Tidak ada transaksi yang mencapai mempool |
| 7 | Blok baru tercipta karena transaksi | Sama seperti di atas | Blok tetap di angka 97 selama pemantauan |
| 8 | Persistensi baris `identity_mappings` di SQL | K-08 | `ALLOW_IN_MEMORY_DB=true` melewati verifikasi |
| 9 | Strict FIFO lintas Middleware→TX-Worker | K-01 | Tidak ada aliran lintas komponen |
| 10 | Gap Resolver menangani nonce hilang | K-01, K-03 | Tidak ada transaksi normal yang berjalan |

---

## 6. Analisis Kegagalan Rantai (Chain of Failure)

Berikut urutan kegagalan logis bila seluruh prasyarat "tampak" siap:

```text
  [Middlewares publishes]  <?>  web2_pending_signature_queue  (consumer=0)
                                    |
                                    X  K-01: nama antrean beda
                                    |
  [TX-Worker consumes]     <--  tx_log_queue  (consumer=1)
                                    |
                                    X  K-02: field 'encodedData' tidak ada di payload
                                    |
  [txBuilder.buildUnsignedTx(nonce, encodedData)]
                                    |
                                    X  K-04: tidak ada ABI encoding
                                    X  E-01: SMART_CONTRACT_ADDRESS placeholder
                                    |
  [vaultService.signTransaction(wallet, rawTx)]
                                    |
                                    X  K-03: endpoint 'transit/keys/.../sign' tidak ada
                                    |
  [besuService.sendRawTransaction(signedRawTx)]
                                    |
                                    X  Tidak pernah tercapai
                                    |
  [Blockchain receipt]  -- tidak pernah terjadi
```

---

## 7. Prioritas Perbaikan

| Prioritas | ID | Perbaikan | Berkas Sasaran |
| :-- | :-- | :--- | :--- |
| **P0** | E-01 | Isi `SMART_CONTRACT_ADDRESS` dengan alamat kontrak nyata | `.env` |
| **P0** | E-07 | Tambahkan `BESU_CHAIN_ID=1337` | `.env` |
| **P0** | K-01 | Samakan nama antrean antara Middleware & TX-Worker | `.env`, `tx-worker/src/services/rabbitmq.js`, `tx-worker/src/config.js` |
| **P0** | K-02 | Selaraskan skema payload antrean | `middleware/src/service/logger_core.js`, `tx-worker/src/index.js` |
| **P0** | K-03 | Ubah klien Vault ke endpoint `ethereum/accounts/{name}/sign-tx` | `tx-worker/src/services/vault.js` |
| **P0** | K-04 | Implementasikan ABI encoding | `tx-worker/src/core/txBuilder.js` atau modul baru |
| **P1** | K-05 | Tetapkan satu signature fungsi kontrak yang benar | `tx-worker/src/config.js`, `tx-worker/worker.js` |
| **P1** | E-11 | Bersihkan 10 entri nonce yatim di Redis | Redis |
| **P1** | K-07 | Tambahkan `VAULT_ADDR` dan `REDIS_URL` ke `.env` | `.env` |
| **P2** | K-06 | Hapus atau tandai jelas `tx-worker/worker.js` legacy | `tx-worker/worker.js` |
| **P2** | E-10 | Panggil `dotenv` sekali saja | `tx-worker/src/*`, `middleware/src/*` |
| **P2** | E-09 | Redam keluaran `dotenv` v17 (opsi `quiet: true`) | Pemuatan `dotenv` |
| **P3** | K-08 | Uji ulang dengan `ALLOW_IN_MEMORY_DB=false` | `.env` |
| **P3** | E-03 | (Sudah diperbaiki) Teruskan `WEB2_QUEUE` ke proses Node | Skrip 07 |

---

## 8. Detail Lingkungan Saat Pengujian

### 8.1 Kondisi Antrean (Pengukuran Ulang Pasca-Pengujian)

| Antrean | Pesan | Consumer |
| :--- | :-- | :-- |
| `tx_log_queue` | 0 | 1 |
| `web2_pending_signature_queue` | 1008 | 0 |
| `web3_ready_queue` | 5 | 0 |
| `ezsign_logging_queue` | TIDAK ADA | - |

Catatan: `web2_pending_signature_queue` menyimpan 1008 pesan menumpuk (akumulasi semua skenario 02, 03, 04, 05, 07, dan 08) tanpa satu pun consumer. Ini adalah bukti kuantitatif langsung dari K-01.

### 8.2 Kondisi Blockchain

| Metrik | Nilai |
| :--- | :--- |
| Chain ID | `0x539` (1337) |
| Block number (baseline) | `0x60` (96) → skenario 07 membaca `0x61` (97) |
| Blok baru selama 45 detik | 0 |
| Transaksi dari wallet pool (20 blok) | 0 |

### 8.3 Kondisi Redis

| Metrik | Nilai |
| :--- | :--- |
| Hash key | `ezsign:wallet_nonces` |
| Jumlah entri | 20 (10 sesuai `WALLET_POOL` + 10 yatim) |

### 8.4 Proses Aktif

| Proses | PID |
| :--- | :--- |
| `npm run start:middleware` | 686004 |
| `node middleware/index.js` | 686018 |
| `npm run start:tx-worker` | 719154 |
| `node tx-worker/src/index.js` | 719166 |

---

## 9. Artefak

| Artefak | Lokasi |
| :--- | :--- |
| Log eksekusi lengkap | `/tmp/run_all_full.log` |
| Respons HTTP skenario 07 | `/tmp/ezsign-e2e/step2_http_response.json` |
| Respons HTTP skenario 03 | `/tmp/e2e_pii_resp.json` |
| Hasil beban (bila `ab` tersedia) | `/tmp/e2e_ab_output.txt` |
