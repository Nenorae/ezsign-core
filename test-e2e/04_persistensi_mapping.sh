#!/usr/bin/env bash
# Skenario 04: Verifikasi persistensi pemetaan identitas dan idempotensi upsert.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
. "$SCRIPT_DIR/_load_env.sh"

BASE_URL="http://localhost:${PORT:-3000}"
UUID_MARKER="usr-map-probe-$(date +%s)"

echo "== SKENARIO 04: Persistensi Peta Relasional (Upsert Idempoten) =="
echo "   UUID Uji : $UUID_MARKER"
echo

# 1. Registrasi data pemetaan pertama
echo "--- Langkah 1: Pendaftaran pertama ---"
RESP1=$(curl -s -w "\n%{http_code}" -m 10 -X POST "${BASE_URL}/api/v1/verify-identity" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"${UUID_MARKER}\",\"client_type\":\"web2\",\"docType\":\"KTP\"}")
CODE1=$(echo "$RESP1" | tail -n1)
HASH1=$(echo "$RESP1" | head -n1 | grep -o '"userHash":"[^"]*"' | cut -d'"' -f4)
echo "   HTTP $CODE1 | userHash: ${HASH1:-<none>}"
[ "$CODE1" = "202" ] && echo "   [PASS] Pendaftaran pertama diterima" || echo "   [FAIL] Pendaftaran pertama gagal"

# 2. Registrasi ulang UUID identik (uji idempotensi upsert)
echo
echo "--- Langkah 2: Pendaftaran ulang UUID identik (uji upsert) ---"
RESP2=$(curl -s -w "\n%{http_code}" -m 10 -X POST "${BASE_URL}/api/v1/verify-identity" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"${UUID_MARKER}\",\"client_type\":\"web2\",\"docType\":\"KTP\"}")
CODE2=$(echo "$RESP2" | tail -n1)
HASH2=$(echo "$RESP2" | head -n1 | grep -o '"userHash":"[^"]*"' | cut -d'"' -f4)
echo "   HTTP $CODE2 | userHash: ${HASH2:-<none>}"
[ "$CODE2" = "202" ] \
  && echo "   [PASS] Tidak ada galat duplicate key (upsert idempoten)" \
  || echo "   [FAIL] Terjadi galat pada pendaftaran ulang"

# 3. Verifikasi konsistensi hash deterministik
echo
echo "--- Langkah 3: Konsistensi hash deterministik ---"
if [ -n "$HASH1" ] && [ "$HASH1" = "$HASH2" ]; then
  echo "   [PASS] Hash identik untuk UUID sama: ${HASH1:0:14}..."
else
  echo "   [FAIL] Hash tidak konsisten: '$HASH1' vs '$HASH2'"
fi

# 4. Verifikasi baris pada database (jika persistent storage aktif)
echo
echo "--- Langkah 4: Verifikasi langsung ke basis data ---"
if [ "${ALLOW_IN_MEMORY_DB:-false}" = "true" ]; then
  echo "   [INFO] Mode in-memory aktif (ALLOW_IN_MEMORY_DB=true)."
  echo "          Verifikasi baris identity_mappings dilewati."
elif echo "${DATABASE_URL:-}" | grep -q "^postgres"; then
  ROW=$(psql "${DATABASE_URL}" -tAc \
    "SELECT uuid, user_hash FROM identity_mappings WHERE uuid='${UUID_MARKER}';" 2>/dev/null)
  if [ -n "$ROW" ]; then
    echo "   [PASS] Baris ditemukan: $ROW"
  else
    echo "   [FAIL] Baris identity_mappings tidak ditemukan"
  fi
else
  echo "   [INFO] Driver bukan PostgreSQL atau DATABASE_URL tidak disetel. Lewati."
fi

echo
echo "  Catatan: Skema identity_mappings (uuid PK, user_hash, created_at)"
echo "           mengacu pada DOKUMENTASI_TEKNIS_MIDDLEWARE.md Bab 6.3."
