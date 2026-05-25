function inWords(n: number): string {
  if (n === 0) return "";
  const satuan = ["","satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan"];
  if (n < 10) return satuan[n];
  if (n === 10) return "sepuluh";
  if (n === 11) return "sebelas";
  if (n < 20) return satuan[n - 10] + " belas";
  if (n < 100) {
    const r = n % 10;
    return satuan[Math.floor(n / 10)] + " puluh" + (r ? " " + satuan[r] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return (h === 1 ? "seratus" : satuan[h] + " ratus") + (r ? " " + inWords(r) : "");
  }
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000), r = n % 1000;
    return (t === 1 ? "seribu" : inWords(t) + " ribu") + (r ? " " + inWords(r) : "");
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
    return inWords(m) + " juta" + (r ? " " + inWords(r) : "");
  }
  const b = Math.floor(n / 1_000_000_000), r = n % 1_000_000_000;
  return inWords(b) + " miliar" + (r ? " " + inWords(r) : "");
}

/** Angka → kata (tanpa satuan). Contoh: 76000000 → "tujuh puluh enam juta" */
export function angkaTerbilang(n: number): string {
  if (n === 0) return "nol";
  return inWords(Math.floor(Math.abs(n))).trim();
}

/** Angka → kata + "rupiah". Contoh: 76000000 → "tujuh puluh enam juta rupiah" */
export function terbilang(angka: number): string {
  if (angka === 0) return "nol rupiah";
  return angkaTerbilang(angka) + " rupiah";
}
