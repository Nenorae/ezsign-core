#!/bin/bash

echo "[-] Memastikan utilitas jq terpasang..."
if ! command -v jq &> /dev/null; then
    sudo apt-get update -y > /dev/null 2>&1 && sudo apt-get install jq -y > /dev/null 2>&1
fi

echo "[-] Mematikan proses Vault yang mungkin masih berjalan..."
if pgrep -x vault > /dev/null; then
    pkill -x vault || true
    while pgrep -x vault > /dev/null; do
        sleep 0.5
    done
fi

echo "[-] Menyalakan Vault dalam Mode Dev di latar belakang..."
> vault.log
vault server -dev -dev-plugin-dir=$HOME/vault-plugins > vault.log 2>&1 &

echo "[-] Menunggu Vault selesai inisialisasi..."
MAX_WAIT=20
WAITED=0
ROOT_TOKEN=""

while [ $WAITED -lt $MAX_WAIT ]; do
    if grep -q 'Root Token:' vault.log 2>/dev/null; then
        ROOT_TOKEN=$(grep 'Root Token:' vault.log | awk '{print $3}')
        break
    fi
    sleep 0.5
    WAITED=$((WAITED + 1))
done

if [ -z "$ROOT_TOKEN" ]; then
    echo "[!] Gagal menemukan Root Token di vault.log setelah menunggu ${MAX_WAIT} hitungan. Setup dibatalkan."
    echo "[!] Isi 20 baris terakhir vault.log:"
    tail -n 20 vault.log
    exit 1
fi

export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN=$ROOT_TOKEN

echo "[-] Mengaktifkan Plugin Ethereum..."
vault secrets enable -path=ethereum -plugin-name=vault-ethereum plugin > /dev/null 2>&1

echo "[-] Mengonfigurasi Chain ID dan RPC Target..."
vault write ethereum/config rpc_url="http://127.0.0.1:8545" chain_id="1337" > /dev/null 2>&1

echo "[-] Membangkitkan 10 Dompet Ethereum..."
WALLET_POOL=""

for i in {1..10}
do
    # Memaksa format JSON agar mudah dibaca oleh jq
    ADDRESS=$(vault write -f -format=json ethereum/accounts/eth-wallet-$i | jq -r '.data.address')
    
    if [ -z "$WALLET_POOL" ]; then
        WALLET_POOL="$ADDRESS"
    else
        WALLET_POOL="$WALLET_POOL,$ADDRESS"
    fi
done

echo ""
echo "=========================================================="
echo "🎯 SETUP VAULT BERHASIL"
echo "=========================================================="
echo "Salin dua baris di bawah ini ke dalam file .env TX-Worker:"
echo ""
echo "VAULT_TOKEN=$VAULT_TOKEN"
echo "WALLET_POOL=\"$WALLET_POOL\""
echo "=========================================================="
echo "Log Vault dapat dilihat di file: vault.log"