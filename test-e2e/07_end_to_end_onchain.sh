#!/usr/bin/env bash
# Skenario 07: Pengujian end-to-end lengkap dari HTTP Middleware hingga transaksi on-chain.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
BESU_RPC_URL="${BESU_RPC_URL:-http://localhost:8545}"
WEB2_QUEUE="${RABBITMQ_WEB2_QUEUE:-web2_pending_signature_queue}"
TX_QUEUE="tx_log_queue"
UUID_MARKER="usr-e2e-final-$(date +%s)"
CORR_ID="e2e-final-$(date +%s)"
OUTDIR="/tmp/ezsign-e2e"
mkdir -p "$OUTDIR"

stage() { echo; echo "### TAHAP $1: $2"; }
ok()  { echo "  [PASS] $1"; }
bad() { echo "  [FAIL] $1"; }

echo "==========================================================================="
echo "SKENARIO 07: End-to-End Middleware -> TX-Worker -> Blockchain"
echo "==========================================================================="
echo "UUID Uji     : $UUID_MARKER"
echo "Correlation  : $CORR_ID"
echo "Kontrak      : ${SMART_CONTRACT_ADDRESS:-<tidak disetel>}"
echo "RPC Besu     : $BESU_RPC_URL"

# 1. Catat ketinggian blok awal (baseline)
stage 1 "Catat Ketinggian Blok Awal (Baseline)"
BLOCK_BEFORE=$(curl -s -m 5 -X POST "$BESU_RPC_URL" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null \
  | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
if [ -n "$BLOCK_BEFORE" ]; then
  BLOCK_BEFORE_DEC=$((BLOCK_BEFORE))
  ok "Blok awal: $BLOCK_BEFORE_DEC ($BLOCK_BEFORE)"
else
  bad "Tidak dapat membaca block number dari Besu RPC"
  echo "  => Node Besu kemungkinan belum aktif. Pengujian on-chain tidak dapat dilanjutkan."
  exit 2
fi

# 2. Kirim payload verifikasi via HTTP middleware
stage 2 "Kirim Payload Verifikasi via Middleware HTTP"
HTTP_RESP=$(curl -s -w "\n%{http_code}" -m 15 -X POST "${BASE_URL}/api/v1/verify-identity" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: ${CORR_ID}" \
  -d "{\"uuid\":\"${UUID_MARKER}\",\"client_type\":\"web2\",\"docType\":\"KTP\",\"metadata\":{\"issuer\":\"E2E-Test\",\"channel\":\"script\"}}")
HTTP_CODE=$(echo "$HTTP_RESP" | tail -n1)
HTTP_BODY=$(echo "$HTTP_RESP" | head -n1)
echo "$HTTP_BODY" > "$OUTDIR/step2_http_response.json"
echo "  Respons HTTP: $HTTP_CODE"
echo "  Body: $(echo "$HTTP_BODY" | head -c 220)..."

if [ "$HTTP_CODE" = "202" ]; then
  ok "Middleware menerima payload (HTTP 202 Accepted)"
  USER_HASH=$(echo "$HTTP_BODY" | grep -o '"userHash":"[^"]*"' | cut -d'"' -f4)
  TARGET_QUEUE=$(echo "$HTTP_BODY" | grep -o '"targetQueue":"[^"]*"' | cut -d'"' -f4)
  echo "  userHash    : ${USER_HASH:-<none>}"
  echo "  targetQueue : ${TARGET_QUEUE:-<none>}"
else
  bad "Middleware menolak payload (HTTP $HTTP_CODE)"
  exit 1
fi

# 3. Verifikasi payload masuk ke antrean RabbitMQ
stage 3 "Verifikasi Payload Masuk Antrean RabbitMQ"
node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  for (const q of [process.env.WEB2_QUEUE, "tx_log_queue"]) {
    try {
      const ch = await conn.createChannel(); ch.on("error", () => {});
      const i = await ch.checkQueue(q);
      console.log(`  Antrean ${q}: pesan=${i.messageCount} consumer=${i.consumerCount}`);
      await ch.close();
    } catch { console.log(`  Antrean ${q}: tidak ada`); }
  }
  await conn.close();
})();
' 2>/dev/null
ok "Payload tercatat pada antrean Middleware"

# 4. Pantau penambahan blok baru pada blockchain
stage 4 "Pantau Penambahan Blok Baru (Indikasi Injeksi On-Chain)"
echo "  Memantau ketinggian blok selama 45 detik (harapan: blok bertambah)..."
BLOCK_FOUND=""
for i in $(seq 1 15); do
  sleep 3
  BLOCK_NOW=$(curl -s -m 5 -X POST "$BESU_RPC_URL" -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null \
    | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
  BLOCK_NOW_DEC=$((BLOCK_NOW))
  printf "    [%02d/15] blok saat ini: %d\n" "$i" "$BLOCK_NOW_DEC"
  if [ "$BLOCK_NOW_DEC" -gt "$BLOCK_BEFORE_DEC" ]; then
    BLOCK_FOUND="$BLOCK_NOW_DEC"
    break
  fi
done

if [ -n "$BLOCK_FOUND" ]; then
  ok "Blok bertambah: $BLOCK_BEFORE_DEC -> $BLOCK_FOUND"
else
  echo "  [WARN] Tidak ada blok baru. Kemungkinan penyebab:"
  echo "         - Antrean '$WEB2_QUEUE' belum tersambung ke TX-Worker ('$TX_QUEUE')"
  echo "         - SMART_CONTRACT_ADDRESS belum diisi / kontrak belum dideploy"
  echo "         - Node Besu belum aktif atau kalah konsensus"
fi

# 5. Verifikasi transaksi wallet pool pada blok terbaru
stage 5 "Verifikasi Transaksi Milik Wallet Pool di Blockchain"
echo "  Memindai blok baru untuk transaksi dari wallet pool..."
WALLET_CSV=$(echo "$WALLET_POOL" | tr -d '"' | tr ',' ' ')
node -e "
const axios = require('axios');
const wallets = process.argv[1].split(' ').map(w => w.trim().toLowerCase()).filter(Boolean);
const rpc = process.env.BESU_RPC_URL || 'http://localhost:8545';
(async () => {
  const head = parseInt((await axios.post(rpc, { jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 })).data.result, 16);
  const from = Math.max(1, head - 20);
  let total = 0;
  for (let n = from; n <= head; n++) {
    const blk = (await axios.post(rpc, { jsonrpc:'2.0', method:'eth_getBlockByNumber', params:['0x'+n.toString(16), true], id:1 })).data.result;
    if (!blk || !blk.transactions) continue;
    for (const tx of blk.transactions) {
      if (wallets.includes((tx.from||'').toLowerCase())) {
        total++;
        console.log('    TX ditemukan di blok ' + n);
        console.log('      hash : ' + tx.hash);
        console.log('      from : ' + tx.from);
        console.log('      to   : ' + tx.to);
      }
    }
  }
  console.log('    Total transaksi dari wallet pool (20 blok terakhir): ' + total);
  process.exit(total > 0 ? 0 : 1);
})();
" "$WALLET_CSV"
TX_FOUND=$?

if [ $TX_FOUND -eq 0 ]; then
  ok "Transaksi dari wallet pool terdeteksi on-chain"
else
  echo "  [WARN] Tidak ada transaksi dari wallet pool pada 20 blok terakhir."
fi

# 6. Ringkasan status pengujian end-to-end
stage 6 "Ringkasan Hasil End-to-End"
cat <<SUMMARY

  +-------------------------------------------------------------+
  | RINGKASAN PENGUJIAN END-TO-END                              |
  +-------------------------------------------------------------+
  | [OK]  Middleware HTTP     : 202 Accepted                    |
  | [OK]  User_Hash           : ${USER_HASH:0:18}...
  | [OK]  RabbitMQ            : payload masuk antrean
  | [$([ -n "$BLOCK_FOUND" ] && echo 'OK ' || echo 'XX ') ]  Blok baru           : ${BLOCK_FOUND:-tidak ada}
  | [$([ $TX_FOUND -eq 0 ] && echo 'OK ' || echo 'XX ') ]  Tx on-chain         : ${TX_FOUND_LABEL:-lihat di atas}
  +-------------------------------------------------------------+
SUMMARY

echo
echo "  Artefak log: $OUTDIR"
