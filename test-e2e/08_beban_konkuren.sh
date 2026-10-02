#!/usr/bin/env bash
# Skenario 08: Uji beban konkuren, throughput, dan pemenuhan target latensi.
# Parameter (opsional): CONCURRENCY (default: 50), TOTAL (default: 1000).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
ENDPOINT="${BASE_URL}/api/v1/verify-identity"
CONCURRENCY="${CONCURRENCY:-50}"
TOTAL="${TOTAL:-1000}"

echo "== SKENARIO 08: Uji Beban Konkuren & Metrik =="
echo "   Endpoint     : $ENDPOINT"
echo "   Total request: $TOTAL"
echo "   Konkurensi   : $CONCURRENCY"
echo

# Eksekusi uji beban via ApacheBench atau fallback client Node.js
if command -v ab > /dev/null 2>&1; then
  echo "--- Menggunakan ApacheBench ---"
  # Persiapkan file payload pengujian
  PAYLOAD_FILE=$(mktemp /tmp/e2e_payload_XXXX.json)
  cat > "$PAYLOAD_FILE" <<'JSON'
{"uuid":"usr-load-{{{RANDOM}}}","client_type":"web2","docType":"KTP","metadata":{"source":"ab-load"}}
JSON
  cat > "$PAYLOAD_FILE" <<JSON
{"uuid":"usr-load-$(date +%s)","client_type":"web2","docType":"KTP","metadata":{"source":"ab-load"}}
JSON
  ab -n "$TOTAL" -c "$CONCURRENCY" \
     -p "$PAYLOAD_FILE" -T "application/json" \
     -H "x-correlation-id: ab-load-test" \
     "$ENDPOINT" 2>&1 | tee /tmp/e2e_ab_output.txt

  rm -f "$PAYLOAD_FILE"

  echo
  echo "--- Analisis Hasil ApacheBench ---"
  grep -E "Complete requests|Failed requests|Requests per second|Time per request|Non-2xx responses" /tmp/e2e_ab_output.txt || true
  echo
  echo "  Interpretasi metrik FUN-01 (DOKUMENTASI_TEKNIS_MIDDLEWARE.md Bab 2.2):"
  echo "   - 'Failed requests: 0'          => Error rate 0% terpenuhi"
  echo "   - 'Time per request' < 500 ms   => Latensi sinkron terpenuhi"
  echo "   - 'Non-2xx responses: 0'        => Tidak ada penolakan tak terduga"

else
  echo "--- ApacheBench (ab) tidak tersedia; menggunakan Node.js paralel ---"
  TOTAL="$TOTAL" CONCURRENCY="$CONCURRENCY" ENDPOINT="$ENDPOINT" node -e '
  const http = require("http");
  const TOTAL = parseInt(process.env.TOTAL || "1000", 10);
  const CONC = parseInt(process.env.CONCURRENCY || "50", 10);
  const url = new URL(process.env.ENDPOINT);

  let sent = 0, ok202 = 0, httpErrors = 0, netErrors = 0;
  const latencies = [];
  const start = Date.now();

  function once() {
    return new Promise((resolve) => {
      if (sent >= TOTAL) return resolve();
      sent++;
      const id = sent;
      const body = JSON.stringify({
        uuid: `usr-load-${Date.now()}-${id}`,
        client_type: "web2",
        docType: "KTP",
        metadata: { source: "node-load" }
      });
      const t0 = Date.now();
      const req = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
                   "x-correlation-id": `load-${id}` }
      }, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          latencies.push(Date.now() - t0);
          if (res.statusCode === 202) ok202++;
          else httpErrors++;
          resolve();
        });
      });
      req.on("error", () => { netErrors++; resolve(); });
      req.write(body); req.end();
    });
  }

  (async () => {
    const running = [];
    for (let i = 0; i < TOTAL; i++) {
      running.push(once());
      if (running.length >= CONC) {
        await Promise.all(running.splice(0, CONC));
      }
    }
    await Promise.all(running);
    const elapsed = Date.now() - start;
    latencies.sort((a, b) => a - b);
    const pct = (p) => latencies[Math.floor(latencies.length * p / 100)] || 0;
    const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);

    console.log();
    console.log("  +-----------------------------------------------+");
    console.log("  | HASIL UJI BEBAN                               |");
    console.log("  +-----------------------------------------------+");
    console.log(`  | Total dikirim     : ${String(TOTAL).padEnd(25)}|`);
    console.log(`  | HTTP 202 Accepted : ${String(ok202).padEnd(25)}|`);
    console.log(`  | HTTP Error (non-202): ${String(httpErrors).padEnd(23)}|`);
    console.log(`  | Network Error     : ${String(netErrors).padEnd(25)}|`);
    console.log(`  | Durasi total      : ${String(elapsed + " ms").padEnd(25)}|`);
    console.log(`  | Rata-rata latensi : ${String(avg.toFixed(1) + " ms").padEnd(25)}|`);
    console.log(`  | p50 / p95 / p99   : ${String(pct(50) + " / " + pct(95) + " / " + pct(99) + " ms").padEnd(25)}|`);
    console.log(`  | Throughput        : ${String((TOTAL / (elapsed / 1000)).toFixed(1) + " req/s").padEnd(25)}|`);
    console.log("  +-----------------------------------------------+");
    console.log();
    const errRate = ((httpErrors + netErrors) / TOTAL * 100).toFixed(2);
    console.log(`  Error rate total   : ${errRate}%  ${errRate === "0.00" ? "=> [PASS] memenuhi FUN-01" : "=> [FAIL] melebihi 0%"}`);
    console.log(`  Latensi rata-rata  : ${avg.toFixed(1)} ms  ${avg < 500 ? "=> [PASS] di bawah 500 ms" : "=> [FAIL] melebihi 500 ms"}`);
    console.log(`  Target lokal       : ${avg < 50 ? "[PASS] di bawah 50 ms" : "[INFO] di atas 50 ms (beban " + CONC + " konkuren)"}`);
    process.exit((httpErrors + netErrors) > 0 ? 1 : 0);
  })();
  ' 2>/dev/null
fi

echo
echo "  Catatan fungsional (FUN-02, Spesifikasi_Teknis_TX_Worker.md Bab 7):"
echo "   - Delivery rate RabbitMQ -> TX-Worker wajib 100% pada 500 pesan"
echo "   - Urutan Strict FIFO harus terjaga (prefetch=1 pada consumer)"
echo "   - Error 'nonce too low' wajib 0%"
