# PocketBase Schema Update - Master Data

## Update Tanggal: 2026-08-20

Dokumen ini menjelaskan perubahan skema yang diperlukan di PocketBase untuk mendukung form Master Data yang baru (Bandar & Buyer).

---

## 1. Koleksi: `master_bandar`

### Field Baru yang Perlu Ditambahkan:

| Field Name | Type | Required | Options/Default |
|------------|------|----------|-----------------|
| `tipe_pemasok` | text | Ya | Default: "perorangan" |
| `alamat_pembayaran` | text | Tidak | - |
| `telp_bisnis` | text | Tidak | - |
| `hp_whatsapp` | text | Tidak | - |
| `email` | email | Tidak | - |
| `nama_bank` | text | Tidak | - |
| `nomor_rekening` | text | Tidak | - |
| `syarat_pembayaran` | text | Ya | Default: "COD" |
| `default_diskon` | number | Tidak | Default: 0 |
| `deskripsi` | text | Tidak | - |
| `akun_utang` | text | Tidak | - |
| `akun_uang_muka` | text | Tidak | - |
| `pajak_termasuk` | bool | Tidak | Default: false |
| `tipe_id_pajak` | text | Ya | Default: "NPWP" |
| `nomor_wajib_pajak` | text | Tidak | - |
| `nama_wajib_pajak` | text | Tidak | - |
| `nitku` | text | Tidak | - |
| `tipe_transaksi` | text | Ya | Default: "Perolehan Dalam Negri" |
| `alamat_pajak_sama` | bool | Tidak | Default: true |
| `alamat_pajak` | text | Tidak | - |

### Field Lama (Keep for Backward Compatibility):
- `telepon` (text) - Optional
- `alamat` (text) - Optional

### Langkah-langkah Update di PocketBase Admin:

1. Login ke PocketBase Admin UI (biasanya http://localhost:8090/_/)
2. Buka koleksi `master_bandar`
3. Klik "Edit collection"
4. Untuk setiap field baru, klik "+ New field" dan isi:
   - **Field name**: sesuai tabel
   - **Field type**: sesuai tabel
   - **Required**: centang jika Ya
   - **Default value**: isi jika ada

5. **Catatan Penting untuk Select/Options**:
   - `tipe_pemasok`: Bisa gunakan type "select" dengan options: `perorangan`, `perusahaan`, `pemerintah`
   - `syarat_pembayaran`: Bisa gunakan type "select" dengan options: `COD`, `Set manual`, `TOP 15`, `TOP 21`, `TOP 30`
   - `tipe_id_pajak`: Bisa gunakan type "select" dengan options: `NIK`, `NPWP`, `Passpor`, `Lainnya`
   - `tipe_transaksi`: Bisa gunakan type "select" dengan options: `Digunggung`, `Tidak dikreditkan`, `Perolehan Dalam Negri`, `Impor`, `Faktur Pajak`

6. Klik "Save changes"

---

## 2. Koleksi: `master_buyer`

### Field Baru yang Perlu Ditambahkan:

| Field Name | Type | Required | Options/Default |
|------------|------|----------|-----------------|
| `alamat_penagihan` | text | Tidak | - |
| `telp_bisnis` | text | Tidak | - |
| `hp_whatsapp` | text | Tidak | - |
| `email` | email | Tidak | - |
| `alamat_pengiriman_sama` | bool | Tidak | Default: true |
| `alamat_pengiriman` | text | Tidak | - |
| `harga` | number | Tidak | Default: 0 |
| `diskon` | number | Tidak | Default: 0 |
| `syarat_pembayaran` | text | Ya | Default: "COD" |
| `deskripsi` | text | Tidak | - |
| `konsinyasi` | bool | Tidak | Default: false |
| `akun_piutang` | text | Tidak | - |
| `akun_uang_muka` | text | Tidak | - |
| `akun_penjualan` | text | Tidak | - |
| `akun_diskon_barang` | text | Tidak | - |
| `akun_beban_pokok_penjualan` | text | Tidak | - |
| `akun_retur_penjualan` | text | Tidak | - |
| `akun_diskon_penjualan` | text | Tidak | - |
| `pajak_termasuk` | bool | Tidak | Default: false |
| `tipe_id_pajak` | text | Ya | Default: "NPWP" |
| `nomor_wajib_pajak` | text | Tidak | - |
| `nama_wajib_pajak` | text | Tidak | - |
| `nitku` | text | Tidak | - |
| `kode_negara` | text | Tidak | - |
| `tipe_transaksi` | text | Ya | Default: "Faktur Pajak" |
| `alamat_pajak_sama` | bool | Tidak | Default: true |
| `alamat_pajak` | text | Tidak | - |

### Field Lama (Keep for Backward Compatibility):
- `kategori` (text) - Optional
- `telepon` (text) - Optional
- `alamat` (text) - Optional
- `perusahaan` (text) - Optional
- `npwp` (text) - Optional

### Langkah-langkah Update di PocketBase Admin:

1. Login ke PocketBase Admin UI
2. Buka koleksi `master_buyer`
3. Klik "Edit collection"
4. Untuk setiap field baru, klik "+ New field" dan isi sesuai tabel

5. **Catatan Penting untuk Select/Options**:
   - `syarat_pembayaran`: Bisa gunakan type "select" dengan options: `COD`, `TOP 15`, `TOP 21`, `TOP 30`
   - `tipe_id_pajak`: Bisa gunakan type "select" dengan options: `NIK`, `NPWP`, `Passpor`, `Lainnya`
   - `tipe_transaksi`: Bisa gunakan type "select" dengan options: `Digunggung`, `Ekspor`, `Dokumen Tertentu`, `Faktur Pajak`

6. Klik "Save changes"

---

## 3. Migration Script (Optional)

Jika Anda ingin menggunakan migration script untuk automasi, Anda bisa membuat file migration di PocketBase:

```javascript
// File: pb_migrations/XXXX_update_master_data.js

migrate((db) => {
  // Update master_bandar
  const bandarCollection = db.findCollectionByNameOrId("master_bandar")
  
  bandarCollection.schema.addField(new SchemaField({
    name: "tipe_pemasok",
    type: "text",
    required: true,
    options: {
      default: "perorangan"
    }
  }))
  
  // ... tambahkan field lainnya
  
  db.saveCollection(bandarCollection)
  
  // Update master_buyer
  const buyerCollection = db.findCollectionByNameOrId("master_buyer")
  
  // ... tambahkan field untuk buyer
  
  db.saveCollection(buyerCollection)
}, (db) => {
  // Rollback jika diperlukan
})
```

---

## 4. Verifikasi Setelah Update

Setelah melakukan update skema, pastikan:

1. ✅ Semua field baru muncul di PocketBase Admin UI
2. ✅ Field required memiliki default value yang sesuai
3. ✅ Field lama masih ada (backward compatibility)
4. ✅ Test create/update data melalui form untuk memastikan tidak ada error
5. ✅ Periksa console browser untuk memastikan tidak ada error saat save data

---

## 5. Data Migration untuk Record yang Sudah Ada

Jika Anda memiliki data lama di database, Anda mungkin perlu menjalankan script untuk set default values:

```javascript
// Script untuk update existing records dengan default values
const updateExistingRecords = async () => {
  // Update master_bandar
  const bandars = await pb.collection('master_bandar').getFullList()
  for (const bandar of bandars) {
    await pb.collection('master_bandar').update(bandar.id, {
      tipe_pemasok: bandar.tipe_pemasok || 'perorangan',
      syarat_pembayaran: bandar.syarat_pembayaran || 'COD',
      default_diskon: bandar.default_diskon || 0,
      pajak_termasuk: bandar.pajak_termasuk || false,
      tipe_id_pajak: bandar.tipe_id_pajak || 'NPWP',
      tipe_transaksi: bandar.tipe_transaksi || 'Perolehan Dalam Negri',
      alamat_pajak_sama: bandar.alamat_pajak_sama !== false
    })
  }
  
  // Update master_buyer
  const buyers = await pb.collection('master_buyer').getFullList()
  for (const buyer of buyers) {
    await pb.collection('master_buyer').update(buyer.id, {
      alamat_pengiriman_sama: buyer.alamat_pengiriman_sama !== false,
      harga: buyer.harga || 0,
      diskon: buyer.diskon || 0,
      syarat_pembayaran: buyer.syarat_pembayaran || 'COD',
      konsinyasi: buyer.konsinyasi || false,
      pajak_termasuk: buyer.pajak_termasuk || false,
      tipe_id_pajak: buyer.tipe_id_pajak || 'NPWP',
      tipe_transaksi: buyer.tipe_transaksi || 'Faktur Pajak',
      alamat_pajak_sama: buyer.alamat_pajak_sama !== false
    })
  }
}
```

---

## 6. Troubleshooting

### Error: "Failed to create/update record"
- Pastikan semua field required memiliki value atau default value
- Periksa tipe data field sudah sesuai (number, text, bool, email)

### Error: "Field xxx does not exist"
- Refresh PocketBase Admin UI
- Restart PocketBase server jika diperlukan
- Periksa apakah field sudah disimpan dengan benar

### Data lama tidak muncul dengan field baru
- Ini normal karena field baru tidak ada di data lama
- Gunakan data migration script atau edit manual melalui admin UI

---

## Kesimpulan

Setelah melakukan update skema ini, form master data akan berfungsi dengan baik untuk menyimpan semua informasi yang diperlukan. Pastikan untuk:
1. Backup database sebelum melakukan perubahan
2. Test di environment development terlebih dahulu
3. Verifikasi semua fungsi create/read/update bekerja dengan baik
