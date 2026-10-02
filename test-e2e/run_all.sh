#!/usr/bin/env bash
# Runner seluruh skenario pengujian end-to-end ezSign core domain.
# Penggunaan: ./test-e2e/run_all.sh [filter_skenario...]
set -u
cd "$(dirname "$0")"

SCRIPTS=(
  "00_prasyarat_dan_info.sh"
  "01_uji_crypto.sh"
  "02_validasi_skema_http.sh"
  "03_zero_pii_leak.sh"
  "04_persistensi_mapping.sh"
  "05_rantai_middleware_txworker.sh"
  "06_txworker_nonce_kms.sh"
  "07_end_to_end_onchain.sh"
  "08_beban_konkuren.sh"
)

# Filter skenario jika argumen diberikan
FILTER_ARGS=("$@")
should_run() {
  local script="$1"
  [ ${#FILTER_ARGS[@]} -eq 0 ] && return 0
  for f in "${FILTER_ARGS[@]}"; do
    case "$script" in "$f"*) return 0 ;; esac
  done
  return 1
}

declare -A RESULTS

echo "==========================================================================="
echo "  PENGUJIAN END-TO-END MIDDLEWARE -> TX-WORKER -> BLOCKCHAIN"
echo "  Sistem Pencatatan Audit Asinkron ezSign Core Domain"
echo "==========================================================================="
echo "  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')"
echo

for SCRIPT in "${SCRIPTS[@]}"; do
  should_run "$SCRIPT" || continue
  [ -f "$SCRIPT" ] || continue
  chmod +x "$SCRIPT" 2>/dev/null

  echo
  echo "###########################################################################"
  echo "# MENJALANKAN: $SCRIPT"
  echo "###########################################################################"
  if bash "$SCRIPT"; then
    RESULTS["$SCRIPT"]="LULUS"
  else
    RESULTS["$SCRIPT"]="GAGAL"
  fi
done

echo
echo "==========================================================================="
echo "  RINGKASAN AKHIR"
echo "==========================================================================="
TOTAL=0; LULUS=0; GAGAL=0
for SCRIPT in "${SCRIPTS[@]}"; do
  should_run "$SCRIPT" || continue
  [ -n "${RESULTS[$SCRIPT]:-}" ] || continue
  TOTAL=$((TOTAL+1))
  STATUS="${RESULTS[$SCRIPT]}"
  if [ "$STATUS" = "LULUS" ]; then
    MARK="[PASS]"; LULUS=$((LULUS+1))
  else
    MARK="[FAIL]"; GAGAL=$((GAGAL+1))
  fi
  printf "  %s %-45s %s\n" "$MARK" "$SCRIPT" "$STATUS"
done
echo "  ---------------------------------------------------------------------"
printf "  Total: %d  |  Lulus: %d  |  Gagal: %d\n" "$TOTAL" "$LULUS" "$GAGAL"
echo "  Waktu selesai: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================================================="

[ "$GAGAL" -eq 0 ] && exit 0 || exit 1
