// src/services/vault.js (KMS Delegator)
// - Berkomunikasi dengan HashiCorp Vault.
// - Melakukan POST request ke /transit/keys/{SELECTED_WALLET}/sign dengan muatan hash transaksi.
// - Memastikan modul ini beroperasi 100% tanpa memiliki atau mengekspos private key sama sekali.
