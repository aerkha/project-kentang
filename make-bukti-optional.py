#!/usr/bin/env python3
"""Make bukti transfer input field non-mandatory in investors-content.tsx."""
f = r'd:\project-kentang\components\investors-content.tsx'
with open(f, 'r', encoding='utf-8') as fh:
    c = fh.read()
orig = c

# 1. Update label to indicate field is optional
old1 = 'Bukti Transfer <span className="text-muted-foreground font-normal"></span>'
new1 = 'Bukti Transfer <span className="text-muted-foreground font-normal">(opsional)</span>'
if old1 in c:
    c = c.replace(old1, new1)
    print("OK: label updated to indicate optional")
else:
    print("WARN: label pattern not found")

# 2. Remove the early-return validation that blocks submission when bukti is missing
old2 = '''    if (!addInvestorFile) {
        setErrorInfo({
          title: "Bukti transfer wajib diupload",
          fields: [{ field: "buktiTransfer", code: "required", message: "Upload bukti transfer investasi terlebih dahulu sebelum menyimpan investor." }],
          raw: "",
        });
        return;
      }'''
new2 = '''    // Bukti transfer sekarang OPSIONAL. Lanjut tanpa bukti jika belum diupload.
    // (Validasi wajib sudah dihapus — field ini non-mandatory.)'''
if old2 in c:
    c = c.replace(old2, new2)
    print("OK: bukti validation block removed")
else:
    print("WARN: validation block not found (might already be removed)")

# 3. Add a small helper text below the input to inform user that it's optional
old3 = '<p className="text-xs">Klik untuk upload bukti transfer (jpg, png, pdf)</p>'
new3 = '<p className="text-xs">Klik untuk upload bukti transfer (jpg, png, pdf) &mdash; <span className="text-muted-foreground">opsional, bisa diupload nanti</span></p>'
if old3 in c:
    c = c.replace(old3, new3)
    print("OK: helper text updated to indicate optional")
else:
    print("WARN: helper text not found")

if c != orig:
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(c)
    print("OK: file updated")
else:
    print("no change")
