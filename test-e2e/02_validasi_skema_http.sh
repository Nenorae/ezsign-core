#!/usr/bin/env bash
# Skenario 02: Validasi skema HTTP middleware (fail-fast validation dan correlation ID).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
ENDPOINT="${BASE_URL}/api/v1/verify-identity"

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

# Helper assert kode status HTTP
assert_status() {
  local name="$1" payload="$2" expected="$3"
  local code
  code=$(curl -s -o /tmp/e2e_body.json -w "%{http_code}" -m 10 \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$payload")
  if [ "$code" = "$expected" ]; then
    ok "$name -> HTTP $code (sesuai harapan)"
  else
    bad "$name -> HTTP $code (diharapkan $expected)"
    echo "       Body: $(cat /tmp/e2e_body.json)"
  fi
}

echo "== SKENARIO 02: Validasi Skema & Gerbang HTTP =="
echo "   Endpoint: $ENDPOINT"
echo

# 1. Kasus uji negatif (validasi skema wajib gagal HTTP 400)
echo "--- Kelompok A: Kasus Negatif (Fail-Fast Validation) ---"
assert_status "Body kosong tanpa uuid & client_type" \
  '{}' "400"

assert_status "client_type tidak dikenal (bukan web2/web3)" \
  '{"uuid":"usr-valid-001","client_type":"web4"}' "400"

assert_status "uuid mengandung spasi (melanggar pola ^\\S+\$)" \
  '{"uuid":"usr invalid 001","client_type":"web2"}' "400"

assert_status "Klien Web3 tanpa atribut signature" \
  '{"uuid":"usr-valid-002","client_type":"web3","docType":"KTP"}' "400"

# 2. Kasus uji positif (lolos validasi HTTP 202)
echo
echo "--- Kelompok B: Kasus Positif (Ajv Lolos, Antrean Terisi) ---"
assert_status "Klien Web2 valid (signature disimulasikan server-side)" \
  '{"uuid":"usr-e2e-web2-001","client_type":"web2","docType":"KTP"}' "202"

assert_status "Klien Web3 valid dengan signature dompet" \
  '{"uuid":"usr-e2e-web3-001","client_type":"web3","signature":"0x3a1076bf45ab877123efbca9283746152435465768798091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d11b","docType":"IJAZAH"}' "202"

# 3. Propagasi header x-correlation-id
echo
echo "--- Kelompok C: Header Correlation ID ---"
CORR_OUT=$(curl -s -D - -o /dev/null -m 10 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: e2e-corr-fixture-001" \
  -d '{"uuid":"usr-e2e-corr-001","client_type":"web2"}')
if echo "$CORR_OUT" | grep -qi "x-correlation-id: e2e-corr-fixture-001"; then
  ok "Header x-correlation-id dikembalikan sesuai input klien"
else
  bad "Header x-correlation-id tidak dipropagasikan"
fi

if echo "$CORR_OUT" | grep -qi "x-correlation-id:"; then
  ok "Header x-correlation-id selalu ada pada respons"
else
  bad "Header x-correlation-id tidak ada pada respons"
fi

echo
echo "  Ringkasan: PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
