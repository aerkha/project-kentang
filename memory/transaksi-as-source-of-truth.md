---
name: transaksi-as-source-of-truth
description: status investor & terminate PKS diturunkan dari transaksi; reminder page sudah diubah ke transaksi-centric
metadata:
  type: project
---

Halaman reminder sekarang menggunakan **transaksi** sebagai entitas utama (bukan PKS):
- Tugas bagi hasil muncul per transaksi berstatus `selesai` atau `bermasalah`
- `bagiHasilChecks` & `bagiHasilDone` disimpan di koleksi `transaksis` (bukan `mous`)
- Bukti transfer per transaksi (`buktiInvestor`, `buktiBroker`, `buktiTrader`, `buktiMinBun`)

**Why:** PKS hanya formalitas; semua activity nyata ada di transaksi.

**How to apply:** Reminder, notify-investor, send-reminders sudah selaras. Jika ada fitur baru yang menyebut "PKS" terkait bagi hasil, pivot ke transaksi.

**Schema PocketBase yang harus ditambahkan ke koleksi `transaksis`:**
- `bagiHasilChecks` — JSON (text)
- `bagiHasilDone` — Boolean, default false
- `buktiInvestor` — File (single)
- `buktiBroker` — File (single)
- `buktiTrader` — File (single)
- `buktiMinBun` — File (single)

Check key format di `bagiHasilChecks`:
- Investor: `{investorId}_Investor` (mis. `INV-0001_Investor`)
- Broker: `{brokerName}_Broker` (mis. `Ahmad Broker_Broker`)
- Trader: `Trader`
- MinBun: `MinBun`

Related: [[reminder-pb-service-tunnel]]
