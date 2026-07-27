# PocketBase 0.39 inventory constraints

Catatan: PocketBase 0.39 tidak menyediakan tab **Constraints** di
halaman edit collection. Unique constraint hanya dapat
diimplementasikan melalui **API Rules** (role-based) atau **hook
server** di sisi backend PocketBase (Go/JS). Dokumen ini mencatat
konfigurasi yang sedang dipakai dan rencana sebelum halaman
inventory dianggap final.

## Status konfigurasi saat ini (per 27 Juli 2025)

- Koleksi `inv_*` menggunakan API Rules sederhana berbasis role:
  - List/Search/View/Create/Update/Delete rule: `` atau
    `@request.auth.role = "admin" || @request.auth.role = "user"`.
  - **Tidak ada** filter `exists()` di rule (lihat catatan di bawah
    kenapa pendekatan ini ditinggalkan).
  - **Update rule untuk field `invoice_id` di `inv_pengiriman`
    dibatasi** ke admin saja, agar hanya endpoint Next.js yang boleh
    mengubah relasi ini.
- Hook Go/JS di server PocketBase **belum dipasang**; jika hook
  tersedia, hook akan jadi single source of truth untuk atomicity dan
  validasi kombinasi kompleks.

## Implikasi terhadap alur saat ini

- Aplikasi yang login sebagai `user` (mis. akun `anggota` dari bulk
  import) **dapat** memanggil PocketBase REST langsung untuk
  mengubah `inv_pengiriman.invoice_id` atau membuat invoice duplikat
  dengan `invoice_id` yang sama — **kecuali** field `invoice_id` di
  `inv_pengiriman` dilindungi dengan field-level Update rule admin.
- Validasi **uniqueness** `inv_invoice.invoice_id` dilakukan di
  backend Next.js (`/api/inventory/invoice`), bukan di rule
  PocketBase.
- Halaman inventory masih dalam tahap finalisasi stakeholder, bukan
  untuk produksi. Sampai konfigurasi diperketat, **jangan aktifkan
  integrasi langsung client → PocketBase** untuk koleksi `inv_invoice`
  dan `inv_pengiriman`.

## Konfigurasi minimum yang WAJIB dipasang sebelum final

### `inv_pengiriman.invoice_id` (relation)

Tambahkan field relation opsional:

- **Nama:** `invoice_id`
- **Tipe:** relation ke collection `inv_invoice`
- **Max select:** 1
- **Required:** false

API Rules per field:

- **List/Search rule:** `` (admin/user).
- **View rule:** `` (admin/user).
- **Create rule:** `@request.auth.role = "admin" || @request.auth.role = "user"`.
- **Update rule:** `@request.auth.role = "admin"`.
  Tujuan: hanya `/api/inventory/invoice` yang boleh mengubah
  field ini (lewat token admin/service).

### `inv_invoice` (collection-level API Rules)

- **List/Search rule:** `` (admin/user).
- **View rule:** `` (admin/user).
- **Create rule:** `@request.auth.role = "admin" || @request.auth.role = "user"`.
- **Update rule:** `` (admin/user).
- **Delete rule:** `` (admin/user).

**Uniqueness `invoice_id`** divalidasi di backend Next.js
(`/api/inventory/invoice`), bukan di rule PocketBase.

## Kenapa tidak pakai `exists()` di rule Create

Pendekatan awal mencoba filter
`!@collection.inv_invoice.exists(invoice_id = @request.data.invoice_id)`
di Create rule collection `inv_invoice`. Setelah diuji, pendekatan
ini **tidak reliable** untuk beberapa alasan:

1. **Field resolution error** — saat dipasang, parser PocketBase
   memunculkan error:
   - `invalid right operand "@request.data.invoice_id" - failed to
     resolve field "@request.data.invoice_id"` ketika rule dipasang
     di scope yang salah (field-level vs collection-level), atau
     nama field tidak cocok.
   - `invalid sign operator "!"` ketika negasi ditulis sebagai
     unary prefix `!@collection.X...` di luar konteks yang didukung.
   - `expected comma after the last argument in function
     "@collection.inv_invoice.exists"` ketika sintaks
     `exists(field = value)` dipakai — filter language PocketBase
     memisahkan argumen fungsi dengan **koma**, bukan `=`.

2. **Race condition tetap ada** — meskipun rule lolos, ada celah
   waktu antara `getFirstListItem` di backend dan `create` di
   PocketBase. Untuk atomicity absolut tetap perlu hook server.

3. **Backend sudah double-check** — `/api/inventory/invoice`
   melakukan validasi `getFirstListItem` terhadap `invoice_id`
   sebelum `create`, dan rollback kompensasi bila gagal
   (`app/api/inventory/invoice/route.ts` baris 61–110). Validasi ini
   cukup efektif selama endpoint lain tidak bypass.

Karena itu, **hapus filter `exists()` dari rule Create** dan
andalkan validasi backend sebagai pertahanan utama.

## `inv_sortir`

- Semua create/update aplikasi dilakukan melalui
  `/api/inventory/sortir` karena PocketBase 0.39 tidak memiliki
  expression constraint multi-field.
- Invariant total `grade_a + grade_b + grade_c + grade_baby + grade_reject + susut`
  per `pembelian_id` (tidak melebihi `inv_pembelian.tonase_gudang`)
  dijaga oleh API backend, bukan oleh rule PocketBase.

## Catatan atomicity

PocketBase REST SDK tidak menyediakan transaksi multi-request dari
Next.js. Route `/api/inventory/invoice` mengandalkan pengecekan ulang
dan compensating rollback. Untuk atomicity absolut, implementasikan
hook server PocketBase dalam satu database transaction dan buat
junction collection `inv_invoice_shipments` dengan unique index pada
`pengiriman_id`.
