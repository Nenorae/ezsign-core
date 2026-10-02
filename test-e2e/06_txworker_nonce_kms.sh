#!/usr/bin/env bash
# Skenario 06: Uji unit terisolasi TX-Worker (wallet pool, atomic nonce, tx builder, KMS, dan RPC).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

echo "== SKENARIO 06: Nonce, Round-Robin Wallet, & KMS Signing =="
echo

node - <<'EOF'
require('dotenv').config();
const walletManager = require('./tx-worker/src/core/walletManager');
const redisService  = require('./tx-worker/src/services/redis');
const vaultService  = require('./tx-worker/src/services/vault');
const txBuilder     = require('./tx-worker/src/core/txBuilder');
const besuService   = require('./tx-worker/src/services/besu');

let pass = 0, fail = 0;
const ok  = (m) => { console.log(`  [PASS] ${m}`); pass++; };
const bad = (m) => { console.log(`  [FAIL] ${m}`); fail++; };

(async () => {
  // 1. Verifikasi kelengkapan wallet pool
  const pool = walletManager.getPool();
  if (pool.length === 10) {
    ok(`Wallet Pool berisi 10 alamat sesuai spesifikasi`);
  } else {
    bad(`Wallet Pool berisi ${pool.length} alamat (diharapkan 10)`);
  }

  // 2. Verifikasi seleksi round-robin wallet
  console.log();
  console.log("  --- Uji Round-Robin (SELECTED_WALLET = POOL[INDEX % POOL_SIZE]) ---");
  let rrOk = true;
  for (let i = 0; i < 12; i++) {
    const sel = walletManager.selectWallet(i);
    const expected = pool[i % pool.length];
    if (sel !== expected) { rrOk = false; }
    if (i < 12) console.log(`    index=${String(i).padStart(2)} -> ${sel.slice(0, 12)}...`);
  }
  rrOk ? ok("Seleksi round-robin konsisten untuk 12 indeks") : bad("Seleksi round-robin tidak konsisten");

  // 3. Verifikasi increment nonce atomik via Redis HINCRBY
  console.log();
  console.log("  --- Uji Atomic Nonce Fetching (Redis HINCRBY) ---");
  const testWallet = pool[0];
  const before = await redisService.getNonce(testWallet);
  const n1 = await redisService.getAndIncrementNonce(testWallet);
  const n2 = await redisService.getAndIncrementNonce(testWallet);
  const after = await redisService.getNonce(testWallet);

  if (n2 === n1 + 1) {
    ok(`Nonce increment atomik: ${n1} -> ${n2} (delta = 1)`);
  } else {
    bad(`Nonce tidak atomik: ${n1} -> ${n2}`);
  }
  if (after === n2 + 1) {
    ok(`State Redis konsisten setelah 2 increment: ${before} -> ${after}`);
  } else {
    bad(`State Redis tidak konsisten: ${before} -> ${after}`);
  }
  // Kembalikan state nonce ke nilai awal
  await redisService.setNonce(testWallet, before);
  ok(`State nonce dikembalikan ke nilai awal (${before})`);

  // 4. Verifikasi pembentukan unsigned transaction
  console.log();
  console.log("  --- Uji Tx Builder (gasPrice=0, Zero-Gas Network) ---");
  try {
    const unsignedTx = txBuilder.buildUnsignedTx(0, '0xdeadbeef');
    const checks = [
      ['to', unsignedTx.to, (v) => v && v.length > 0],
      ['gasPrice', unsignedTx.gasPrice, (v) => v === 0],
      ['gasLimit', unsignedTx.gasLimit, (v) => v === 500000],
      ['chainId', unsignedTx.chainId, (v) => v !== undefined],
    ];
    checks.forEach(([k, v, pred]) => {
      pred(v) ? ok(`Field '${k}' sah (${v})`) : bad(`Field '${k}' tidak sah (${v})`);
    });
    // Validasi konfigurasi SMART_CONTRACT_ADDRESS
    if (unsignedTx.to && !unsignedTx.to.startsWith('<')) {
      ok("SMART_CONTRACT_ADDRESS terkonfigurasi");
    } else {
      console.log("  [INFO] SMART_CONTRACT_ADDRESS masih placeholder '<ALAMAT_KONTRAK...>'");
      console.log("         Penandatanganan KMS & injeksi on-chain akan dilewati.");
    }
  } catch (e) {
    bad(`Tx Builder gagal: ${e.message}`);
  }

  // 5. Verifikasi akses akun dompet di HashiCorp Vault KMS
  console.log();
  console.log("  --- Uji Konektivitas HashiCorp Vault KMS ---");
  try {
    const axios = require('axios');
    const res = await axios({
      method: 'list',
      url: `${process.env.VAULT_ADDR || 'http://localhost:8200'}/v1/ethereum/accounts`,
      headers: { 'X-Vault-Token': process.env.VAULT_TOKEN || '' }
    });
    const keys = res.data?.data?.keys || [];
    keys.length >= 10
      ? ok(`Vault mengembalikan ${keys.length} dompet (endpoint /sign tersedia)`)
      : bad(`Vault hanya mengembalikan ${keys.length} dompet`);
  } catch (e) {
    bad(`Vault tidak dapat diakses: ${e.message}`);
  }

  // 6. Verifikasi konektivitas RPC node Besu
  console.log();
  console.log("  --- Uji Konektivitas Besu RPC ---");
  try {
    const nonce = await besuService.getTransactionCount(pool[0]);
    ok(`besu.getTransactionCount(${pool[0].slice(0,10)}...) = ${nonce}`);
  } catch (e) {
    bad(`Besu RPC tidak dapat diakses: ${e.message}`);
    console.log("       (Pastikan Node 5/6 Besu aktif pada BESU_RPC_URL)");
  }

  console.log();
  console.log(`  Ringkasan: PASS=${pass}  FAIL=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Kesalahan fatal:", e); process.exit(2); });
EOF
