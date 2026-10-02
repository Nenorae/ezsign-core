#!/usr/bin/env bash
# Parser konfigurasi .env yang aman untuk shell pengujian.

_load_env() {
  local env_file="${1:-.env}"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    # Abaikan baris kosong dan komentar
    case "$line" in
      ''|'#'*) continue ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    local key="${line%%=*}"
    local val="${line#*=}"

    # Normalisasi kunci variabel
    key="$(echo "$key" | tr -d '[:space:]')"
    case "$key" in
      ''|*[!A-Za-z0-9_]*) continue ;;
    esac

    # Bersihkan inline comment, spasi, dan kutip
    case "$val" in
      *" #"*) val="${val%% #*}" ;;
    esac
    val="$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"

    # Abaikan nilai placeholder format <...>
    case "$val" in
      '<'*'>') val="" ;;
    esac

    export "$key=$val"
  done < "$env_file"
}

# Muat konfigurasi .env dari root repository jika tersedia
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../.env" ]; then
  _load_env "$(dirname "${BASH_SOURCE[0]}")/../.env"
fi
