#!/usr/bin/env bash
# Skenario 01: Verifikasi unit fungsi kriptografi (hash deterministik dan simulated signature).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "== SKENARIO 01: Uji Unit Crypto =="
echo

node - <<'EOF'
require('dotenv').config();
const cryptoLib = require('./middleware/src/utils/crypto');

let pass = 0, fail = 0;
const ok  = (m) => { console.log(`  [PASS] ${m}`); pass++; };
const bad = (m) => { console.log(`  [FAIL] ${m}`); fail++; };

// 1. Sifat deterministik hash untuk input identik
const hashA1 = cryptoLib.generateUserHash('usr-test-001');
const hashA2 = cryptoLib.generateUserHash('usr-test-001');
hashA1 === hashA2
  ? ok('generateUserHash deterministik untuk input identik')
  : bad('generateUserHash TIDAK deterministik');

// 2. Keunikan hash untuk input berbeda (collision resistance)
const hashB = cryptoLib.generateUserHash('usr-test-002');
hashA1 !== hashB
  ? ok('generateUserHash berbeda untuk input berbeda (anti-tabrakan)')
  : bad('generateUserHash menghasilkan hash identik untuk input berbeda');

// 3. Format hash 32-byte hex dengan prefiks 0x
const hashPattern = /^0x[0-9a-f]{64}$/;
hashPattern.test(hashA1)
  ? ok(`Format User_Hash valid: ${hashA1.slice(0, 10)}... (panjang ${hashA1.length})`)
  : bad(`Format User_Hash tidak valid: ${hashA1}`);

// 4. Format simulated signature 65-byte
const sig = cryptoLib.generateSimulatedSignature(hashA1);
const sigPattern = /^0x[0-9a-f]{130}$/;
sigPattern.test(sig)
  ? ok(`Format Signature 65-byte valid: ${sig.slice(0, 10)}...${sig.slice(-4)} (panjang ${sig.length})`)
  : bad(`Format Signature tidak valid: panjang ${sig.length}`);

// 5. Validitas recovery identifier (byte v = 0x1b)
sig.endsWith('1b')
  ? ok("Komponen v bernilai '1b' (27 desimal, penanda pemulihan Ethereum)")
  : bad(`Komponen v salah: ${sig.slice(-2)}`);

// 6. Sifat deterministik simulated signature
const sig2 = cryptoLib.generateSimulatedSignature(hashA1);
sig === sig2
  ? ok('generateSimulatedSignature deterministik')
  : bad('generateSimulatedSignature TIDAK deterministik');

console.log();
console.log(`  Ringkasan: PASS=${pass}  FAIL=${fail}`);
process.exit(fail > 0 ? 1 : 0);
EOF
