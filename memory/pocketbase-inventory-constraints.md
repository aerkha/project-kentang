# PocketBase inventory constraints

Perubahan aplikasi mengandalkan schema berikut agar invariant inventory juga dijaga pada level database.

## `inv_pengiriman`

Tambahkan field relation opsional:

- **Nama:** `invoice_id`
- **Tipe:** relation ke collection `inv_invoice`
- **Max select:** 1
- **Required:** false

Field ini menjadi lock terstruktur bahwa satu Surat Jalan sudah ditagihkan. API tetap memeriksa `ref_sj` invoice lama untuk kompatibilitas data sebelum field ini tersedia.

Rekomendasi rules:

- Hanya role `admin`/`user` yang boleh create/update inventory.
- Jangan izinkan client mengosongkan atau mengganti `invoice_id` secara langsung setelah terisi. Semua penerbitan invoice harus melalui `/api/inventory/invoice`.
- Pastikan `sj_id` unik pada record yang nilainya tidak kosong.

## `inv_invoice`

- Pastikan `invoice_id` memiliki unique constraint.
- Create invoice baru dilakukan melalui `/api/inventory/invoice` agar relasi pengiriman dan invoice diperbarui sebagai satu unit dengan compensating rollback.

## `inv_sortir`

- Semua create/update aplikasi dilakukan melalui `/api/inventory/sortir`.
- Total `grade_a + grade_b + grade_c + grade_baby + grade_reject + susut` per `pembelian_id` tidak boleh melebihi `inv_pembelian.tonase_gudang`.
- Nilai grade, reject, dan susut tidak boleh negatif.

## Catatan atomicity

PocketBase REST SDK tidak menyediakan transaksi multi-request dari Next.js. Route invoice menggunakan pengecekan ulang dan compensating rollback. Untuk jaminan concurrency absolut, implementasikan hook/server extension PocketBase dalam satu database transaction dan buat unique junction collection, misalnya `inv_invoice_shipments` dengan unique index pada `pengiriman_id`.
