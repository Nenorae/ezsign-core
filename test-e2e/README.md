# SKENARIO PENGUJIAN END-TO-END
## Middleware -> RabbitMQ -> TX-Worker -> Vault KMS -> Hyperledger Besu

Direktori ini memuat rangkaian skrip pengujian yang disusun langsung dari tiga dokumen acuan:

| Kode | Dokumen Acuan |
| :--- | :--- |
| `SPEC-MW` | `middleware/DOKUMENTASI_TEKNIS_MIDDLEWARE.md` |
| `SPEC-MWLOG` | `middleware/DOKUMENTASI_TEKNIS_DAN_LOG_PERUBAHAN.md` |
| `SPEC-TXW` | `tx-worker/Spesifikasi_Teknis_TX_Worker.md` |

---

## 1. Arsitektur Rantai Pengujian

```text
  [ Klien / curl ]
        |
        | HTTP POST /api/v1/verify-identity
        v
  +----------------------+     SPEC-MW Bab 4.1 (controller.js)
  |  Middleware Fastify  |     SPEC-MW Bab 4.4 (logger_core.js)
  |  :3000               |
  +----------+-----------+
             | publishToQueue (SPEC-MW Bab 4.2)
             v
  +----------------------+     SPEC-TXW Bab 3
  |  RabbitMQ            |     Antrean: tx_log_queue
  |  :5672               |
  +----------+-----------+
             | consume strict FIFO (SPEC-TXW Bab 5 Langkah 1)
             v
  +----------------------+     SPEC-TXW Bab 5 Langkah 2-3 (Redis nonce)
  |  TX-Worker           |     SPEC-TXW Bab 5 Langkah 5  (Vault KMS sign)
  |                      |     SPEC-TXW Bab 5 Langkah 6  (eth_sendRawTx)
  +----------+-----------+
             |
             v
  +----------------------+     SPEC-TXW Bab 3
  |  Besu RPC Node 5/6   |     Port 8545
  |  :8545               |
  +----------------------+
             |
             v
     +---------------+
     |  Blockchain   |  Smart Contract: recordVerification(...)
     |  receipt      |
     +---------------+
```

---

## 2. Daftar Skenario

| No | Skrip | Fokus Pengujian | Acuan |
| :-- | :--- | :--- | :--- |
| 00 | `00_prasyarat_dan_info.sh` | Verifikasi 6 infrastruktur prasyarat + variabel lingkungan | SPEC-MW Bab 2.4, 8.3; SPEC-TXW Bab 3, 4.2 |
| 01 | `01_uji_crypto.sh` | HMAC-SHA256 deterministik, format `0x`+64 hex, signature 65-byte `v=1b` | SPEC-MW Bab 4.5; FUN-01 |
| 02 | `02_validasi_skema_http.sh` | Ajv schema gate: HTTP 400 vs 202, propagasi Correlation ID | SPEC-MW Bab 4.1, 5.4, 6.2; SPEC-MWLOG Test 7-9 |
| 03 | `03_zero_pii_leak.sh` | Jaminan 0 Byte PII Leak pada payload antrean | SPEC-MW Bab 2.2, 4.4 Langkah 4; SPEC-MWLOG Test 6 |
| 04 | `04_persistensi_mapping.sh` | Upsert idempoten tabel `identity_mappings` | SPEC-MW Bab 2.1, 4.3, 6.3 |
| 05 | `05_rantai_middleware_txworker.sh` | Ketahanan rantai & diagnosa kesenjangan antrean | SPEC-TXW Bab 3, 5 Langkah 1 |
| 06 | `06_txworker_nonce_kms.sh` | Round-robin wallet, atomic nonce Redis, tx builder, Vault KMS | SPEC-TXW Bab 4, 5 Langkah 2-5 |
| 07 | `07_end_to_end_onchain.sh` | Alur penuh hingga receipt on-chain | SPEC-MW Bab 5.2; SPEC-TXW Bab 5 Langkah 1-7 |
| 08 | `08_beban_konkuren.sh` | Error rate 0% pada 1.000 request konkuren, latensi < 500 ms | SPEC-MW Bab 2.2; SPEC-TXW Bab 7 |

---

## 3. Cara Menjalankan

```bash
# Seluruh skenario
cd /home/ganen/ezsign-core
bash test-e2e/run_all.sh

# Skenario terpilih (berdasarkan prefix)
bash test-e2e/run_all.sh 00 01 02

# Skenario tunggal
bash test-e2e/01_uji_crypto.sh

# Ubah parameter beban (skenario 08)
CONCURRENCY=100 TOTAL=1000 bash test-e2e/08_beban_konkuren.sh
```

Seluruh skrip memuat konfigurasi dari `.env` melalui `_load_env.sh` yang aman terhadap format `.env` non-shell (nilai berspasi, placeholder `<...>`, komentar inline).

---

## 4. Pemetaan Kebutuhan -> Pembuktian

### 4.1 Kebutuhan Fungsional Middleware (SPEC-MW Bab 2.1)

| Kebutuhan | Dibuktikan oleh |
| :--- | :--- |
| Titik masuk terstandardisasi + tolak instan | Skrip 02 |
| Verifikasi identitas eksternal (UUID) | Skrip 02, 04, 07 |
| Pseudonimisasi `User_Hash` deterministik | Skrip 01 |
| Persistensi peta relasional (upsert) | Skrip 04 |
| Percabangan kredensial Web2 vs Web3 | Skrip 02, 03, 05 |
| Respons asinkron cepat HTTP 202 | Skrip 02, 07, 08 |

### 4.2 Standar Metrik FUN-01 (SPEC-MW Bab 2.2; SPEC-MWLOG Bab 2)

| Parameter | Target | Skrip |
| :--- | :--- | :--- |
| Proteksi PII | 0 byte data mentah ke antrean | 03 |
| Latensi sinkron | < 500 ms (lokal < 50 ms) | 08 |
| Stabilitas 1.000 konkuren | Error rate 0% | 08 |
| Keunikan hash | 100% deterministik, collision-free | 01 |
| Durabilitas antrean | `durable: true`, `persistent: true` | 00, 05 |
| Beban klien | Nol (0) | 07 |

### 4.3 Siklus TX-Worker (SPEC-TXW Bab 5)

| Langkah | Nama | Skrip |
| :--- | :--- | :--- |
| 1 | Consume strict FIFO (`prefetch=1`) | 05, 08 |
| 2 | Round-Robin Wallet Selection | 06 |
| 3 | Atomic Nonce Fetching (Redis `HINCRBY`) | 06 |
| 4 | Perakitan Transaksi Unsigned (`gasPrice=0`) | 06 |
| 5 | Delegasi Penandatanganan KMS (Vault) | 06, 07 |
| 6 | Injeksi ke Jaringan (`eth_sendRawTx`) | 07 |
| 7 | ACK / Timeout / DLQ | 05, 08 |

### 4.4 Standar TX-Worker (SPEC-TXW Bab 7)

| Parameter | Target | Skrip |
| :--- | :--- | :--- |
| FUN-02 Delivery rate | 100% pada 500 pesan | 08 |
| FUN-02 Strict FIFO | Urutan konsisten | 05, 08 |
| PERF-01 `nonce too low` | 0% | 06, 08 |
| Stabilitas KMS signing | 100% | 06, 07 |

---

## 5. Temuan Penting Sebelum Pengujian On-Chain

Skrip 05 dan 00 secara sengaja memeriksa tiga kondisi yang dapat memblokir pengujian end-to-end. Kondisi ini dilaporkan apa adanya, bukan disembunyikan:

### 5.1 Kesenjangan Nama Antrean

```text
Middleware mempublikasikan ke : web2_pending_signature_queue
TX-Worker mengonsumsi dari     : tx_log_queue
```

- Acuan: SPEC-MW Bab 4.2 (`web2Queue`) vs SPEC-TXW Bab 3 (`tx_log_queue`, hardcoded pada `tx-worker/src/services/rabbitmq.js`).
- Dampak: pesan menumpuk di antrean Middleware tanpa consumer.
- Opsi penyelesaian:
  1. Samakan nama antrean di salah satu komponen, atau
  2. Tambahkan binding RabbitMQ: `web2_pending_signature_queue` -> `tx_log_queue`, atau
  3. Tambahkan tahap relay eksplisit.

### 5.2 Konfigurasi Placeholder Belum Terisi

| Variabel | Nilai Saat Ini | Diperlukan |
| :--- | :--- | :--- |
| `SMART_CONTRACT_ADDRESS` | `<ALAMAT_KONTRAK_YANG_SUDAH_DIDEPLOY>` | Alamat kontrak hasil deploy |
| `BESU_CHAIN_ID` | (tidak disetel) | `1337` sesuai `besu/genesis.json` |
| `MASTER_WALLET_PRIVATE_KEY` | `<PRIVATE_KEY_DOMPET_PENGIRIM_TANPA_0x>` | Hanya untuk `tx-worker/worker.js` legacy |

- Acuan: SPEC-TXW Bab 5 Langkah 4 (`to: <SMART_CONTRACT_ADDRESS>`, `chainId: <BESU_CHAIN_ID>`), `tx-worker/src/core/txBuilder.js`.

### 5.3 Node Besu Belum Aktif

- Saat pengujian, `BESU_RPC_URL=http://100.73.28.17:8545` menolak koneksi (`ECONNREFUSED`).
- Acuan: SPEC-TXW Bab 3 (`RPC Endpoint: Node 5/6 Hyperledger Besu port 8545`).
- Jalankan: `bash /home/ganen/besu/startup-script.sh`.

### 5.4 Format ABI Tidak Konsisten

| Sumber | Signature Fungsi |
| :--- | :--- |
| `tx-worker/worker.js` | `recordVerification(bytes32,string,bytes,uint256,string)` |
| `tx-worker/src/config.js` | `logSaved(string,string,uint256)` |

- Acuan: SPEC-TXW Bab 8 (Catatan Konsolidasi) menyebut spesifikasi hasil konsolidasi; `config.js` menandai ABI sebagai placeholder.
- Tindakan: selaraskan ABI dengan kontrak yang benar-benar ter-deploy sebelum pengujian on-chain.

---

## 6. Kondisi Pasca-Perbaikan Skrip

Berikut hasil nyata berdasarkan kondisi infrastruktur saat pengujian disusun:

| Pemeriksaan | Status |
| :--- | :--- |
| Middleware Fastify `/health` UP | LULUS |
| Modul crypto (determinisme, format, `v=1b`) | LULUS (6/6) |
| RabbitMQ `tx_log_queue` + 1 consumer | LULUS |
| Redis state store aktif | LULUS |
| Vault KMS + 10 dompet terdaftar | LULUS |
| Round-robin wallet pool (10 alamat) | LULUS |
| Atomic nonce Redis (`HINCRBY` delta=1) | LULUS |
| `SMART_CONTRACT_ADDRESS` terisi | BELUM |
| `BESU_CHAIN_ID` terisi | BELUM |
| Node Besu RPC `:8545` aktif | BELUM |
| Kesenjangan antrean Middleware <-> TX-Worker | BELUM SELARAS |

Skrip 01, 02, 03, 04 dapat dijalankan penuh pada kondisi saat ini. Skrip 06 akan lulus 100% begitu `SMART_CONTRACT_ADDRESS`, `BESU_CHAIN_ID`, dan Node Besu siap. Skrip 07 baru dapat lulus penuh setelah seluruh temuan pada Bab 5 ditangani.
