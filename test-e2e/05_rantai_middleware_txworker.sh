#!/usr/bin/env bash
# Skenario 05: Verifikasi ketahanan alur antrean antara Middleware dan TX-Worker.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
WEB2_QUEUE="${RABBITMQ_WEB2_QUEUE:-web2_pending_signature_queue}"
TX_QUEUE="tx_log_queue"
UUID_MARKER="usr-chain-probe-$(date +%s)"

echo "== SKENARIO 05: Ketahanan Rantai Middleware -> TX-Worker =="
echo "   Antrean Middleware : $WEB2_QUEUE"
echo "   Antrean TX-Worker  : $TX_QUEUE"
echo

# 1. Periksa kondisi awal kedua antrean
echo "--- Langkah 1: Kondisi awal antrean ---"
WEB2_QUEUE="$WEB2_QUEUE" TX_QUEUE="$TX_QUEUE" node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  for (const q of [process.env.WEB2_QUEUE, process.env.TX_QUEUE]) {
    try {
      const ch = await conn.createChannel(); ch.on("error", () => {});
      const i = await ch.checkQueue(q);
      console.log(`   ${q}: pesan=${i.messageCount} consumer=${i.consumerCount}`);
      await ch.close();
    } catch { console.log(`   ${q}: belum terdeklarasi`); }
  }
  await conn.close();
})();
' 2>/dev/null

# 2. Kirim kumpulan payload secara berurutan
echo
echo "--- Langkah 2: Mengirim 5 payload Web2 berurutan (uji Strict FIFO) ---"
for i in $(seq 1 5); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -X POST "${BASE_URL}/api/v1/verify-identity" \
    -H "Content-Type: application/json" \
    -H "x-correlation-id: e2e-chain-$(printf '%03d' $i)" \
    -d "{\"uuid\":\"${UUID_MARKER}-${i}\",\"client_type\":\"web2\",\"docType\":\"KTP\",\"metadata\":{\"seq\":${i}}}")
  echo "   Payload #$i -> HTTP $CODE"
done

# 3. Periksa kondisi antrean pasca pengiriman
echo
echo "--- Langkah 3: Kondisi antrean setelah pengiriman ---"
WEB2_QUEUE="$WEB2_QUEUE" TX_QUEUE="$TX_QUEUE" node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  for (const q of [process.env.WEB2_QUEUE, process.env.TX_QUEUE]) {
    try {
      const ch = await conn.createChannel(); ch.on("error", () => {});
      const i = await ch.checkQueue(q);
      console.log(`   ${q}: pesan=${i.messageCount} consumer=${i.consumerCount}`);
      await ch.close();
    } catch { console.log(`   ${q}: belum terdeklarasi`); }
  }
  await conn.close();
})();
' 2>/dev/null

# 4. Evaluasi konektivitas dan konsumsi pesan antar-antrean
echo
echo "--- Langkah 4: Analisis konektivitas rantai ---"
WEB2_MSG=$(WEB2_QUEUE="$WEB2_QUEUE" TX_QUEUE="$TX_QUEUE" node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  const ch = await conn.createChannel(); ch.on("error", () => {});
  const i = await ch.checkQueue(process.env.WEB2_QUEUE);
  process.stdout.write(String(i.messageCount));
  await conn.close();
})();
' 2>/dev/null)
TX_CONSUMER=$(WEB2_QUEUE="$WEB2_QUEUE" TX_QUEUE="$TX_QUEUE" node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  const ch = await conn.createChannel(); ch.on("error", () => {});
  const i = await ch.checkQueue(process.env.TX_QUEUE);
  process.stdout.write(String(i.consumerCount));
  await conn.close();
})();
' 2>/dev/null)

echo "   Pesan menumpuk di $WEB2_QUEUE : ${WEB2_MSG:-0}"
echo "   Consumer aktif di $TX_QUEUE  : ${TX_CONSUMER:-0}"
echo
if [ "${WEB2_MSG:-0}" -gt 0 ]; then
  echo "   [TEMUAN] Pesan menumpuk di antrean Middleware tanpa consumer."
  echo "            TX-Worker hanya mendengarkan '$TX_QUEUE'."
  echo "            => Diperlukan jembatan/binding antara '$WEB2_QUEUE' -> '$TX_QUEUE',"
  echo "               atau penyelarasan nama antrean antara kedua komponen."
else
  echo "   [PASS] Antrean Middleware dikonsumsi (rantai tersambung)."
fi
echo
echo "  Mengacu: Spesifikasi_Teknis_TX_Worker.md Bab 3 & 5 (Langkah 1)."
