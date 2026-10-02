#!/usr/bin/env bash
# Skenario 03: Verifikasi jaminan Zero PII Leak pada payload antrean RabbitMQ.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
WEB2_QUEUE="${RABBITMQ_WEB2_QUEUE:-web2_pending_signature_queue}"
UUID_MARKER="usr-pii-probe-$(date +%s)"
PROBE_ID="probe-$(date +%s)-$RANDOM"
RESULT_FILE="/tmp/e2e_pii_result_$$.json"

echo "== SKENARIO 03: Jaminan Zero PII Leak =="
echo "   Antrean   : $WEB2_QUEUE"
echo "   UUID Uji  : $UUID_MARKER"
echo "   Probe ID  : $PROBE_ID (penanda di metadata)"
echo

# 1. Bersihkan sisa pesan antrean sebelumnya
Q="$WEB2_QUEUE" node -e '
const amqp = require("amqplib");
(async () => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  const ch = await conn.createChannel();
  await ch.assertQueue(process.env.Q, { durable: true });
  let purged = 0;
  while (true) {
    const m = await ch.get(process.env.Q, { noAck: false });
    if (!m) break;
    ch.ack(m); purged++;
  }
  console.log(`   Membersihkan ${purged} pesan sisa dari pengujian sebelumnya.`);
  await ch.close(); await conn.close();
})().catch(e => { console.error("   [WARN] Purge gagal:", e.message); });
' 2>/dev/null

# 2. Jalankan listener di background sebelum pengiriman request
Q="$WEB2_QUEUE" PROBE_ID="$PROBE_ID" RESULT_FILE="$RESULT_FILE" node -e '
const amqp = require("amqplib");
const fs = require("fs");
(async () => {
  const q = process.env.Q, probe = process.env.PROBE_ID, out = process.env.RESULT_FILE;
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
  const ch = await conn.createChannel();
  await ch.assertQueue(q, { durable: true });

  let found = null, inspected = 0;
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline && !found) {
    const msg = await ch.get(q, { noAck: false });
    if (!msg) { await new Promise(r => setTimeout(r, 200)); continue; }
    inspected++;
    const raw = msg.content.toString();
    const meta = (() => { try { return JSON.parse(raw).metadata || {}; } catch { return {}; } })();
    if (meta.probe_id === probe) { found = { raw, payload: JSON.parse(raw) }; }
    ch.ack(msg);
  }

  await ch.close(); await conn.close();
  fs.writeFileSync(out, JSON.stringify({ found, inspected }));
})().catch(e => {
  require("fs").writeFileSync(process.env.RESULT_FILE, JSON.stringify({ error: e.message }));
});
' &
SNIFFER_PID=$!

sleep 2  # Sinkronisasi listener sebelum HTTP dispatch

# 3. Kirim request verifikasi identitas ke middleware
echo "   Mengirim request Web2 ke middleware..."
HTTP_CODE=$(curl -s -o /tmp/e2e_pii_resp.json -w "%{http_code}" -m 10 \
  -X POST "${BASE_URL}/api/v1/verify-identity" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"${UUID_MARKER}\",\"client_type\":\"web2\",\"docType\":\"KTP\",\"metadata\":{\"probe_id\":\"${PROBE_ID}\"}}")
echo "   Respons HTTP: $HTTP_CODE"
[ "$HTTP_CODE" = "202" ] || { echo "   [FAIL] Payload tidak diterima"; kill $SNIFFER_PID 2>/dev/null; exit 1; }

# 4. Tunggu listener selesai dan evaluasi payload
wait $SNIFFER_PID

[ -f "$RESULT_FILE" ] || { echo "   [FAIL] Sniffer tidak menghasilkan output"; exit 1; }

RESULT_FILE="$RESULT_FILE" UUID_MARKER="$UUID_MARKER" node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.env.RESULT_FILE, "utf8"));
const marker = process.env.UUID_MARKER;

if (r.error) { console.log("   [FAIL] Sniffer error:", r.error); process.exit(2); }
if (!r.found) {
  console.log(`   [FAIL] Payload dengan probe_id tidak ditemukan (diperiksa ${r.inspected} pesan)`);
  process.exit(1);
}

const { raw, payload } = r.found;
console.log("   Payload antrean tertangkap:");
console.log("   " + JSON.stringify(payload, null, 2).replace(/\n/g, "\n   "));
console.log();

let pass = 0, fail = 0;
const check = (cond, okMsg, badMsg) => { if (cond) { console.log("   [PASS] " + okMsg); pass++; } else { console.log("   [FAIL] " + badMsg); fail++; } };

check(!raw.includes(marker),
      "UUID mentah TIDAK ditemukan di payload antrean (0 Byte PII Leak)",
      "UUID mentah DITEMUKAN di payload antrean (PII LEAK)");
check(/^0x[0-9a-f]{64}$/.test(payload.userHash || ""),
      "Field userHash hadir dengan format HMAC-SHA256 yang sah",
      "Field userHash tidak valid / tidak ada");
const forbidden = ["uuid", "identityNumber", "fullName", "nik"];
const leaked = forbidden.filter(k => k in payload);
check(leaked.length === 0,
      "Tidak ada field PII terlarang (uuid/identityNumber/fullName/nik)",
      "Field PII terlarang ditemukan: " + leaked.join(", "));
check(/^0x[0-9a-f]{130}$/.test(payload.signature || ""),
      "Signature simulasi Web2 (65 byte) tersemat oleh middleware",
      "Signature simulasi Web2 tidak ditemukan / format salah");

console.log();
console.log(`   Ringkasan: PASS=${pass}  FAIL=${fail}`);
process.exit(fail > 0 ? 1 : 0);
' 2>/dev/null

RC=$?
rm -f "$RESULT_FILE"
exit $RC
