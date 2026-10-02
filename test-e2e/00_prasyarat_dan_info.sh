#!/usr/bin/env bash
# Skenario 00: Verifikasi prasyarat dan kesiapan lingkungan pengujian.
set -u

# Inisialisasi konfigurasi lingkungan
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/_load_env.sh"

BESU_RPC_URL="${BESU_RPC_URL:-http://localhost:8545}"
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
MIDDLEWARE_URL="http://localhost:${PORT:-3000}"
REDIS_URL_HOST="${REDIS_URL:-redis://localhost:6379}"

PASS=0; FAIL=0
ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
head() { echo; echo "== $1 =="; }

# 1. Validasi variabel lingkungan wajib
head "1. Memeriksa Variabel Lingkungan Wajib (.env)"
for VAR in RABBITMQ_URL SALT_SECRET SMART_CONTRACT_ADDRESS BESU_CHAIN_ID VAULT_TOKEN WALLET_POOL; do
  VAL=$(eval echo \"\${$VAR:-}\")
  if [ -z "$VAL" ]; then
    bad "Variabel $VAR kosong / tidak terdefinisi"
  else
    ok "Variabel $VAR terdefinisi"
  fi
done

# 2. Cek health endpoint middleware
head "2. Memeriksa Middleware Fastify (:${PORT:-3000})"
HEALTH=$(curl -s -m 5 "${MIDDLEWARE_URL}/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"UP"'; then
  ok "Health check /health mengembalikan status UP"
  echo "       Payload: $HEALTH"
else
  bad "Middleware tidak merespons /health"
fi

# 3. Cek ketersediaan antrean RabbitMQ
head "3. Memeriksa RabbitMQ Broker & Antrean"
node -e '
const amqp = require("amqplib");
(async () => {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
    const targets = ["tx_log_queue", "web2_pending_signature_queue", "web3_ready_queue"];
    for (const q of targets) {
      try {
        const ch = await conn.createChannel();
        ch.on("error", () => {});
        const info = await ch.checkQueue(q);
        console.log(`  [PASS] Antrean ${q} ada (pesan=${info.messageCount}, consumer=${info.consumerCount})`);
        await ch.close();
      } catch (e) {
        console.log(`  [WARN] Antrean ${q} belum terdeklarasi`);
      }
    }
    await conn.close();
  } catch (e) {
    console.log("  [FAIL] Tidak dapat terhubung ke RabbitMQ:", e.message);
  }
})();
' 2>/dev/null

# 4. Cek state store Redis
head "4. Memeriksa Redis State Store"
if redis-cli ping 2>/dev/null | grep -q PONG; then
  ok "Redis merespons PING"
  NONCE_ENTRIES=$(redis-cli hlen ezsign:wallet_nonces 2>/dev/null)
  ok "Hash ezsign:wallet_nonces memiliki ${NONCE_ENTRIES} entri dompet"
else
  bad "Redis tidak merespons"
fi

# 5. Cek HashiCorp Vault KMS
head "5. Memeriksa HashiCorp Vault KMS"
VAULT_STATUS=$(curl -s -m 5 -H "X-Vault-Token: ${VAULT_TOKEN:-}" "${VAULT_ADDR}/v1/ethereum/accounts" -X LIST 2>/dev/null)
if echo "$VAULT_STATUS" | grep -q "eth-wallet"; then
  COUNT=$(echo "$VAULT_STATUS" | grep -o "eth-wallet-[0-9]*" | sort -u | wc -l)
  ok "Vault secret engine 'ethereum' aktif dengan ${COUNT} dompet"
else
  bad "Vault tidak merespons atau engine 'ethereum' belum diaktifkan"
fi

# 6. Cek node Besu RPC
head "6. Memeriksa Besu RPC Node 5/6 (:8545)"
CHAIN_ID=$(curl -s -m 5 -X POST "$BESU_RPC_URL" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' 2>/dev/null)
BLOCK_NUM=$(curl -s -m 5 -X POST "$BESU_RPC_URL" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null)

if echo "$CHAIN_ID" | grep -q '"result"'; then
  ok "Besu RPC aktif. Chain ID response: $CHAIN_ID"
  ok "Block number response: $BLOCK_NUM"
else
  bad "Besu RPC tidak merespons pada ${BESU_RPC_URL}"
fi

# 7. Cek proses background TX-Worker dan Middleware
head "7. Memeriksa Proses TX-Worker"
if pgrep -f "tx-worker/src/index.js" > /dev/null; then
  ok "Proses TX-Worker sedang berjalan (PID: $(pgrep -f 'tx-worker/src/index.js' | tr '\n' ' '))"
else
  bad "Proses TX-Worker tidak ditemukan"
fi

if pgrep -f "middleware/index.js" > /dev/null; then
  ok "Proses Middleware sedang berjalan (PID: $(pgrep -f 'middleware/index.js' | tr '\n' ' '))"
else
  bad "Proses Middleware tidak ditemukan"
fi

# Ringkasan hasil verifikasi
head "RINGKASAN"
echo "  Total PASS : $PASS"
echo "  Total FAIL : $FAIL"
[ "$FAIL" -eq 0 ] && echo "  Status     : SIAP UNTUK PENGUJIAN" || echo "  Status     : PRASYARAT BELUM LENGKAP"
exit 0
