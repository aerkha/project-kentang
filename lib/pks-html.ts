import type { Pks } from "./pks-context";
import { type Transaksi, calcTransaksi } from "./transaksi-context";
import { angkaTerbilang, terbilang } from "./terbilang";

// â”€â”€â”€ Data Pihak Pertama â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PIHAK_PERTAMA_I = {
  nama:      "Adie Bayu Putra",
  alamat:    "Taman Kopo Katapang Blok A4. No 6, RT 001/ RW 014, Pangauban, Katapang, Kabupaten Bandung, Jawa Barat",
  pekerjaan: "Direktur PT. Madani Agri Lestari",
  noKtp:     "3207152607950002",
  noTelp:    "0852-9548-9413",
};

// PP II untuk investor INV-MB-xxxx (Mimin Berkebun)
const PIHAK_PERTAMA_II_MB = {
  nama:      "Parafitra Fidiasari (Mimin Berkebun)",
  alamat:    "Gg Sikembang RT 5/ RW 2, Podosugih, Pekalongan Barat, Jawa Tengah",
  pekerjaan: "Karyawan Swasta",
  noKtp:     "3321015604900001",
  noTelp:    "0896-7070-0889",
};

// PP II untuk investor INV-TM-xxxx (Tami)
const PIHAK_PERTAMA_II_TM = {
  nama:      "Gartiria Hutami",
  alamat:    "Jl. Puspanjolo Barat XII/1, Rt006/Rw004, Bojongsalaman, Semarang, Jawa Tengah",
  pekerjaan: "Karyawan Swasta",
  noKtp:     "3374135001900003",
  noTelp:    "0811-8504-488",
};

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endStr.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

// Total durasi jangka waktu kontrak (hari) â€” pakai endDate jika ada,
// jika tidak fallback ke contractPeriod Ã— siklus. Ini BERBEDA dari
// contractPeriod yang hanya periode bagi hasil (default 30 hari).
function totalDurationDays(pks: Pks): number {
  const endRaw = pks.endDate || addDays(pks.date, pks.contractPeriod * (pks.siklus ?? 1));
  return daysBetween(pks.date, endRaw);
}

// Jumlah bulan jangka waktu kontrak (1 bulan = 30 hari). Span kalender
// dibulatkan ke bulan terdekat, mis. 18 Junâ€“18 Sep (92 hari) â†’ 3 bulan.
function durationMonths(pks: Pks): number {
  return Math.max(1, Math.round(totalDurationDays(pks) / 30));
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paymentAccount(pks: Pks): string {
  return esc(pks.paymentAccount || "BCA 6768043702");
}

function row(label: string, value: string, wide = false) {
  const w = wide ? "200px" : "120px";
  return `
  <div style="display:flex;margin-bottom:3pt;line-height:1.5;">
    <span style="min-width:${w};flex-shrink:0;">${label}</span>
    <span style="width:18px;text-align:center;flex-shrink:0;">:</span>
    <span style="flex:1;">${value}</span>
  </div>`;
}

// Teks periode: "Tiga (3) bulan" jika kelipatan 30, "Sembilan Puluh (90) hari" jika tidak
function periodText(days: number): string {
  if (days % 30 === 0) {
    const m = days / 30;
    return `${cap(angkaTerbilang(m))} (${m}) bulan`;
  }
  return `${cap(angkaTerbilang(days))} (${days}) hari`;
}

// Teks periode lengkap untuk Direct: "Enam (6) bulan atau 180 hari"
function periodTextDirect(days: number): string {
  const months = Math.round(days / 30);
  return `${cap(angkaTerbilang(months))} (${months}) bulan atau ${days} hari`;
}

// â”€â”€â”€ CSS bersama â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;background:#6b7280;}
  .doc{width:210mm;min-height:297mm;margin:24px auto;padding:3cm 2.5cm 3cm 3cm;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);}
  p{text-align:justify;margin-bottom:.55em;line-height:1.7;}
  .center{text-align:center;}
  .bold{font-weight:bold;}
  .section{margin-top:1.6em;}
  .ptitle{text-align:center;font-weight:bold;margin-bottom:.6em;line-height:1.5;}
  ol{margin-left:1.6em;}
  ol li{margin-bottom:.4em;line-height:1.7;text-align:justify;}
  .indent{margin-left:2em;}
  .sig{display:flex;justify-content:space-between;margin-top:3em;}
  .sb{text-align:center;width:30%;}
  .sb2{text-align:center;width:40%;}
  .ss{height:5.5em;}
  @page{size:A4;margin:3cm 2.5cm 3cm 3cm;}
  @media print{body{background:#fff;}.doc{width:auto;margin:0;padding:0;box-shadow:none;min-height:unset;}}
`;

// â”€â”€â”€ Kalkulasi transaksi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TrxData {
  trxQty: string; trxHpp: string; trxModal: string;
  trxOngkir: string; trxHargaJual: string; trxIncome: string; trxProfit: string;
  bhOwner: string; bhMinbun: string; bhBroker: string; bhInvestor: string;
  estKeuntungan: string; roiPerBulan: string; roiSetelahBH: string;
}

// Placeholder simulasi ketika Pks dibuat sebelum transaksi (alur:
// broker â†’ investor â†’ Pks â†’ transaksi â†’ bagi hasil). Nilai-nilai ini
// mengisi tabel simulasi & distribusi bagi hasil agar template Pks
// tidak memiliki kolom kosong saat pertama kali di-generate.
const PLACEHOLDER_QTY        = 1500;
const PLACEHOLDER_HPP        = 11000;
const PLACEHOLDER_ONGKIR     = 350000;
const PLACEHOLDER_HARGA_JUAL = 12500;

function buildPlaceholderTrxData(pks: Pks): TrxData {
  const placeholderModal   = PLACEHOLDER_QTY * PLACEHOLDER_HPP;
  const placeholderIncome  = PLACEHOLDER_HARGA_JUAL * PLACEHOLDER_QTY;
  const placeholderProfit  = placeholderIncome - (placeholderModal + PLACEHOLDER_ONGKIR);

  const pp1Pct = (pks.bagiHasilPP1 ?? 50) / 100;
  const pp2Pct = (pks.bagiHasilPP2 ?? 0)  / 100;
  const pp3Pct = (pks.bagiHasilPP3 ?? 0)  / 100;
  const pkPct  = (pks.bagiHasilPK  ?? 35) / 100;

  const profit = placeholderProfit;
  const roiRaw = pks.investmentAmount > 0 ? profit / pks.investmentAmount : 0;

  return {
    trxQty:        String(PLACEHOLDER_QTY),
    trxHpp:        fmtRp(PLACEHOLDER_HPP),
    trxModal:      fmtRp(placeholderModal),
    trxOngkir:     fmtRp(PLACEHOLDER_ONGKIR),
    trxHargaJual:  fmtRp(PLACEHOLDER_HARGA_JUAL),
    trxIncome:     fmtRp(placeholderIncome),
    trxProfit:     fmtRp(profit),
    bhOwner:       fmtRp(profit * pp1Pct),
    bhMinbun:      fmtRp(profit * pp2Pct),
    bhBroker:      fmtRp(profit * pp3Pct),
    bhInvestor:    fmtRp(profit * pkPct),
    estKeuntungan: fmtRp(profit),
    roiPerBulan:   `${(roiRaw * 100).toFixed(2)}%`,
    roiSetelahBH:  `${(roiRaw * pkPct * 100).toFixed(2)}% â†’ Rp ${fmtRp(profit * pkPct)}`,
  };
}

function calcTrxData(pks: Pks, transaksis: Transaksi[]): TrxData {
  const [my, mm, md] = pks.date.slice(0, 10).split("-").map(Number);
  const pksStart = Date.UTC(my, mm - 1, md);
  const pksEnd   = pksStart + pks.contractPeriod * 86_400_000;

  const trx = transaksis.find((t) => {
    const [ty, tm, td] = t.date.slice(0, 10).split("-").map(Number);
    const tDate = Date.UTC(ty, tm - 1, td);
    return tDate >= pksStart && tDate < pksEnd &&
      t.investorEntries.some((e) => e.investorId === pks.investorId);
  });

  // Jika belum ada transaksi terkait Pks, gunakan placeholder default
  // sehingga tabel simulasi tidak kosong saat template Pks di-preview
  // sebelum transaksi dibuat.
  if (!trx) return buildPlaceholderTrxData(pks);

  const calc   = calcTransaksi(trx);
  const entry  = trx.investorEntries.find((e) => e.investorId === pks.investorId);
  const ratio  = entry && calc.totalInvestasi > 0
    ? entry.nilaiInvestasi / calc.totalInvestasi : 1;
  const profit = calc.profit * ratio;
  const pp1Pct = (pks.bagiHasilPP1 ?? 50) / 100;
  const pp2Pct = (pks.bagiHasilPP2 ?? 0)  / 100;
  const pp3Pct = (pks.bagiHasilPP3 ?? 0)  / 100;
  const pkPct  = (pks.bagiHasilPK  ?? 35) / 100;

  const trxQty       = trx.hpp > 0 ? String(Math.round(trx.kebutuhanModal / trx.hpp)) : "";
  const trxHpp       = fmtRp(trx.hpp);
  const trxModal     = fmtRp(entry ? entry.nilaiInvestasi : pks.investmentAmount);
  const trxOngkir    = fmtRp(calc.totalOngkir * ratio);
  const trxHargaJual = fmtRp(trx.hargaJual);
  const trxIncome    = fmtRp(calc.income * ratio);
  const trxProfit    = fmtRp(profit);
  const bhOwner      = fmtRp(profit * pp1Pct);
  const bhMinbun     = fmtRp(profit * pp2Pct);
  const bhBroker     = fmtRp(profit * pp3Pct);
  const bhInvestor   = fmtRp(profit * pkPct);
  const estKeuntungan = fmtRp(profit);
  const roiRaw = pks.investmentAmount > 0 ? profit / pks.investmentAmount : 0;
  const roiPerBulan  = `${(roiRaw * 100).toFixed(2)}%`;
  const roiSetelahBH = `${(roiRaw * pkPct * 100).toFixed(2)}% â†’ Rp ${fmtRp(profit * pkPct)}`;

  return {
    trxQty, trxHpp, trxModal, trxOngkir, trxHargaJual, trxIncome, trxProfit,
    bhOwner, bhMinbun, bhBroker, bhInvestor, estKeuntungan, roiPerBulan, roiSetelahBH,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Template A â€” Investor Under TM (3 pihak: PP I + PP II + Investor)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generatePksHtmlTm(pks: Pks, transaksis: Transaksi[], pp2 = PIHAK_PERTAMA_II_MB): string {
  const hasBroker = !!(pks.brokerId && pks.brokerName);
  const isMb      = pp2 === PIHAK_PERTAMA_II_MB;
  // Khusus MB: jika ada broker, persentase listing PIHAK PERTAMA II = Parafitra + Broker.
  // (Tabel simulasi/distribusi tetap memakai PP2 & PP3 terpisah â€” tidak diubah.)
  const pp2ListPct = isMb && hasBroker
    ? (pks.bagiHasilPP2 ?? 15) + (pks.bagiHasilPP3 ?? 0)
    : (pks.bagiHasilPP2 ?? 15);
  const date      = fmtDate(pks.date);
  const amount    = fmtRp(pks.investmentAmount);
  const words     = esc(cap(terbilang(pks.investmentAmount)));
  const period    = periodText(durationMonths(pks) * 30);

  const { trxQty, trxHpp, trxModal, trxOngkir, trxHargaJual, trxIncome, trxProfit,
          bhOwner, bhMinbun, bhBroker, bhInvestor, estKeuntungan, roiPerBulan, roiSetelahBH } =
    calcTrxData(pks, transaksis);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Perjanjian Kerjasama â€“ ${esc(pks.id)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="doc">

  <!-- JUDUL -->
  <div class="center">
    <div class="bold" style="font-size:13pt;">PERJANJIAN KERJASAMA</div>
    <div class="bold" style="font-size:13pt;">INVESTASI TRADING KENTANG GRANOLA</div>
    <div style="margin-top:.4em;font-size:10pt;">No. Pks: ${esc(pks.id)}</div>
  </div>

  <!-- MUKADIMAH -->
  <div class="section center">
    <div class="bold">MUKADIMAH</div>
    <br>
    <p class="center">Allah SWT berfirman (dalam hadits Qudsi):</p>
    <p class="center">&ldquo;Aku adalah pihak ketiga (Yang Maha Melindungi) bagi dua orang yang melakukan syirkah, selama salah seorang di antara mereka tidak berkhianat kepada lawan syarikatnya. Apabila diantara mereka ada yang berkhianat, maka Aku akan keluar dari mereka (tidak melindungi)&rdquo;</p>
    <p class="center">(HR Imam Daruquthni dari Abu Hurairah r.a.)</p>
  </div>

  <!-- PEMBUKA -->
  <div class="section">
    <p>Dengan menyebut nama Allah Yang Maha Pengasih lagi Maha Penyayang, pada tanggal <strong>${date}</strong> di Pangalengan, Kabupaten Bandung, yang bertanda tangan di bawah ini:</p>

    <div style="margin:.5em 2em;">
      ${row("Nama",      esc(PIHAK_PERTAMA_I.nama))}
      ${row("Alamat",    esc(PIHAK_PERTAMA_I.alamat))}
      ${row("Pekerjaan", esc(PIHAK_PERTAMA_I.pekerjaan))}
      ${row("No KTP",    esc(PIHAK_PERTAMA_I.noKtp))}
      ${row("No Telepon",esc(PIHAK_PERTAMA_I.noTelp))}
    </div>
    <p>Sebagai PIHAK PERTAMA I, dan</p>

    <div style="margin:.5em 2em;">
      ${row("Nama",      esc(pp2.nama))}
      ${row("Alamat",    esc(pp2.alamat))}
      ${row("Pekerjaan", esc(pp2.pekerjaan))}
      ${row("No KTP",    esc(pp2.noKtp))}
      ${row("No Telepon",esc(pp2.noTelp))}
    </div>
    <p>Sebagai PIHAK PERTAMA II</p>

    <p>Dalam hal ini keduanya bertindak sebagai Pengelola Investasi dan atas nama PT Madani Agri Lestari, berdasarkan Akta Pendirian Nomor AHU-0059177.AH.01.01.Tahun 2021. Selain daripada itu, bertindak sebagai Pengelola Investasi yang selanjutnya disebut PIHAK PERTAMA.</p>


    <div style="margin:.5em 2em;">
      ${row("Nama",       esc(pks.investorName))}
      ${row("Alamat",     esc(pks.investorAddress))}
      ${row("Pekerjaan",  esc(pks.investorOccupation))}
      ${row("No. KTP",    esc(pks.investorIdNumber))}
      ${row("No. Telepon",esc(pks.investorPhone))}
    </div>
    <p>Untuk selanjutnya disebut PIHAK KEDUA sebagai Penyalur Dana Investasi.</p>
  </div>

  <!-- PASAL 1 -->
  <div class="section">
    <div class="ptitle">Pasal 1<br>BENTUK, NAMA dan LOKASI USAHA</div>
    <ol>
      <li><p>Bentuk usaha ini adalah usaha agribisnis, <em>trading</em> kentang Granola (Pemenuhan <em>supply</em> ke <em>All Customer</em>) yang dikelola oleh pihak Pertama (PT Madani Agri Lestari).</p></li>
      <li><p>Lokasi usaha Rancamanyar, Pangalengan, Kabupaten Bandung, Jawa Barat 40378.</p></li>
    </ol>
  </div>

  <!-- PASAL 2 -->
  <div class="section">
    <div class="ptitle">Pasal 2<br>BENTUK KERJA SAMA</div>
    <p>Bahwa PIHAK PERTAMA sebagai petani agribisnis yang bergerak di bidang Pemasaran Agribisnis.</p>
    <p>Bahwa PIHAK KEDUA menyalurkan dana investasi untuk membeli kentang sesuai dengan spesifikasi yang dibutuhkan oleh pelanggan kemudian dikelola oleh PIHAK PERTAMA untuk melaksanakan usaha <em>trading</em> Kentang Granola.</p>
  </div>

  <!-- PASAL 3 -->
  <div class="section">
    <div class="ptitle">Pasal 3<br>JANGKA WAKTU KERJA SAMA</div>
    <p>Penyertaan modal PIHAK KEDUA kepada PIHAK PERTAMA berlaku untuk jangka waktu <strong>${period}</strong> dan akan otomatis diperpanjang apabila tidak ada keberatan dari salah satu pihak. Apabila salah satu pihak bermaksud melakukan perubahan, penarikan, atau pengembalian modal, maka wajib menyampaikan pemberitahuan secara tertulis paling lambat tiga puluh (30) hari kalender sebelum perubahan tersebut berlaku.</p>
  </div>

  <!-- PASAL 4 -->
  <div class="section">
    <div class="ptitle">Pasal 4<br>BAGI HASIL</div>
    <p>Bagi hasil usaha diterima oleh para pihak dalam bentuk uang tunai dari hasil usaha tersebut di atas dan para pihak sepakat bahwa besaran bagi hasil sebagai berikut:</p>
    <p class="indent">A.&nbsp; PIHAK PERTAMA I &nbsp;&nbsp;: ${pks.bagiHasilPP1 ?? 50} %</p>
    <p class="indent">B.&nbsp; PIHAK PERTAMA II &nbsp;: ${pp2ListPct} %</p>
    <p class="indent">C.&nbsp; PIHAK KEDUA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${pks.bagiHasilPK ?? 35} %</p>
    <p>Investasi ini memiliki siklus bagi hasil empat (4) minggu sesuai ketersediaan proyek dan berlaku selama periode perjanjian kerjasama. Dana investasi digunakan untuk membiayai PO <em>All Customer</em> setiap 30 (tiga puluh) hari. Bagi hasil dibayarkan paling lambat setiap 30 (tiga puluh) hari atau sesuai tanggal jatuh tempo.</p>

    <p>Tabel simulasi bagi hasil setiap 30 hari:</p>

    <!-- Tabel Simulasi -->
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:.6em;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th colspan="8" style="border:1px solid #000;padding:4px 6px;text-align:center;">Tabel Simulasi Bagi Hasil â€“ Project All Customer</th>
        </tr>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;white-space:nowrap;">Pengiriman<br>ke</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Quantity</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">HPP</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Modal/<br>pengiriman</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Ongkos<br>Kirim</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Harga<br>Jual</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Income</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Profit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:4px 5px;text-align:center;">1</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxQty}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxHpp}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxModal}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxOngkir}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxHargaJual}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxIncome}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxProfit}</td>
        </tr>
        <tr style="background:#f9f9f9;">
          <td colspan="3" style="border:1px solid #000;padding:4px 5px;font-weight:bold;">Modal berputar</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;font-weight:bold;">Rp ${trxModal.replace(/^Rp\s*/,"")}</td>
          <td style="border:1px solid #000;padding:4px 5px;font-weight:bold;">Keuntungan</td>
          <td colspan="2" style="border:1px solid #000;padding:4px 5px;"></td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;font-weight:bold;">${trxProfit}</td>
        </tr>
      </tbody>
    </table>

    <!-- Ringkasan -->
    <table style="width:55%;border-collapse:collapse;font-size:9.5pt;margin-bottom:.6em;">
      <tr><td style="border:1px solid #000;padding:4px 8px;">Modal</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;font-weight:bold;">${trxModal}</td></tr>
      <tr><td style="border:1px solid #000;padding:4px 8px;">Estimasi Keuntungan Per Bulan</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">${estKeuntungan}</td></tr>
      <tr><td style="border:1px solid #000;padding:4px 8px;">ROI per bulan</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">${roiPerBulan}</td></tr>
      <tr><td style="border:1px solid #000;padding:4px 8px;">ROI setelah Bagi Hasil (${pks.bagiHasilPK ?? 35}%)</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">${roiSetelahBH}</td></tr>
    </table>

    <!-- Distribusi Bagi Hasil -->
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Profit (Rp)</th>
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Bagi Hasil Pihak Pertama I<br>${pks.bagiHasilPP1 ?? 50}% (Owner)</th>
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Bagi Hasil Pihak Pertama II<br>${pks.bagiHasilPP2 ?? 15}% (${esc(pp2.nama)})</th>
          ${hasBroker ? `<th style="border:1px solid #000;padding:4px 8px;text-align:center;">Bagi Hasil Pihak Pertama III<br>${pks.bagiHasilPP3 ?? 0}% (Broker)</th>` : ""}
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Bagi Hasil Pihak Kedua<br>${pks.bagiHasilPK ?? 35}% (Investor)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${trxProfit}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhOwner}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhMinbun}</td>
          ${hasBroker ? `<td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhBroker}</td>` : ""}
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhInvestor}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PASAL 5 -->
  <div class="section">
    <div class="ptitle">Pasal 5<br>HAK DAN KEWAJIBAN PARA PIHAK</div>
    <p><strong>A. PIHAK PERTAMA</strong></p>
    <ol>
      <li><p>Menyediakan bahan <em>trading</em> (jual beli) berupa kentang Granola L dengan spesifikasi dan jumlah sesuai permintaan.</p></li>
      <li><p>Melaksanakan kerjasama pemasaran kentang dengan pihak <em>All Customer</em>.</p></li>
      <li><p>Mengurus kontrak penjualan.</p></li>
      <li><p>Membuat laporan keuangan per transaksi kepada PIHAK KEDUA.</p></li>
      <li><p>Bertanggungjawab atas pengelolaan usaha serta penyaluran bagi hasil kepada PIHAK KEDUA sesuai Pasal 3 dan Pasal 4.</p></li>
      <li><p>Dalam hal usaha mengalami kerugian, maka pengembalian modal kepada PIHAK KEDUA dilakukan setelah dikurangi bagian kerugian tersebut setelah adanya musyawarah mufakat, kecuali apabila kerugian terjadi akibat kelalaian, kesalahan manajemen, penyalahgunaan, wanprestasi oleh PIHAK PERTAMA, maka seluruh kerugian ditanggung oleh PIHAK PERTAMA.</p></li>
      <li><p>Berhak atas keuntungan usaha sesuai dengan pasal 4.</p></li>
    </ol>

    <p style="margin-top:.8em;"><strong>B. PIHAK KEDUA</strong></p>
    <ol>
      <li><p>Menyediakan modal kerja sebesar <strong>Rp.${amount} (${words})</strong> yang ditransfer ke rekening <strong>${paymentAccount(pks)} atas nama Adie Bayu Putra S.P</strong> untuk <em>project trading</em> selama periode perjanjian kerjasama berlangsung mengacu pada pasal 3.</p></li>
      <li><p>Bersama-sama dengan pihak pertama memantau perkembangan usaha dan mengambil keputusan bersama.</p></li>
      <li><p>Apabila terjadi pembatalan kerja sama yang dilakukan PIHAK PERTAMA, maka PIHAK PERTAMA mengembalikan modal dan keuntungannya sesuai perjanjian kerjasama.</p></li>
      <li><p>Berhak atas keuntungan usaha sesuai dengan pasal 4.</p></li>
    </ol>
  </div>

  <!-- PASAL 6 -->
  <div class="section">
    <div class="ptitle">Pasal 6<br>PEMBERITAHUAN</div>
    <p>Semua pemberitahuan, atau pernyataan, atau persetujuan yang wajib dan perlu dilakukan oleh salah satu pihak kepada pihak lainnya di dalam pelaksanaan perjanjian ini, disampaikan melalui pesan di aplikasi <em>Whatsapp</em> dan untuk persetujuan yang bersifat krusial/penting wajib memperoleh konfirmasi oleh kedua belah pihak.</p>
  </div>

  <!-- PASAL 7 -->
  <div class="section">
    <div class="ptitle">Pasal 7<br>BERAKHIRNYA PERJANJIAN</div>
    <p>Perjanjian kerja sama ini berakhir apabila salah satu pihak memutuskan untuk tidak memperpanjang, dengan pemberitahuan tertulis paling lambat tiga puluh (30) hari sebelumnya. Dalam hal salah satu pihak meninggal dunia selama masa kerja sama, maka hak dan kewajiban yang bersangkutan beralih kepada ahli waris atau pihak yang ditunjuk.</p>
    <p>Ahli waris PIHAK KEDUA:</p>
    <div style="margin:.4em 2em;">
      ${row("Nama Ahli Waris",          esc(pks.heirName), true)}
      ${row("Hubungan dengan Investor", esc(pks.heirRelationship), true)}
      ${row("No HP Ahli Waris",         esc(pks.heirPhone), true)}
      ${row("Email Ahli Waris", esc(pks.heirEmail), true)}
    </div>
  </div>

  <!-- PASAL 8 -->
  <div class="section">
    <div class="ptitle">Pasal 8<br>KERUGIAN</div>
    <p>Kerugian usaha pada hakikatnya ditanggung kedua pihak. Sesuai dengan hukum Islam tentang <em>syirkah mudharabah</em>, yaitu seperti berikut:</p>
    <p>a.&nbsp; Suatu kegiatan usaha mengandung risiko untung-rugi, maka kerugian modal usaha yang diakibatkan oleh <em>force majure</em> (di luar kekuasaan kedua belah pihak) seperti kecelakaan atau tragedi bencana alam akan ditanggung bersama dengan mengedepankan musyawarah untuk mufakat.</p>
    <p>b.&nbsp; Apabila kerugian usaha disebabkan oleh kesengajaan PIHAK PERTAMA (pengelola) akibat kelalaian, kesalahan manajemen, penyalahgunaan, wanprestasi, seluruh kerugian usaha ditanggung oleh PIHAK PERTAMA.</p>
    <p>c.&nbsp; Apabila terjadi pembatalan terhadap isi akad syarikat yang dilakukan oleh PIHAK KEDUA (Pemilik Modal) dalam jangka waktu sesuai pasal 3, seluruh kerugian usaha ditanggung oleh PIHAK KEDUA mencakup pengembalian modal usaha yang telah dikeluarkan oleh PIHAK PERTAMA.</p>
  </div>

  <!-- PASAL 9 -->
  <div class="section">
    <div class="ptitle">Pasal 9<br>PERSELISIHAN</div>
    <ol>
      <li><p>Bilamana dalam pelaksanaan perjanjian kerja sama ini terdapat perselisihan antara kedua belah pihak baik dalam pelaksanaannya ataupun dalam penafsiran salah satu pasal dalam perjanjian ini, maka kedua pihak bersepakat menyelesaikan perselisihan secara musyawarah.</p></li>
      <li><p>Segala sesuatu yang merupakan hasil penyelesaian perselisihan akan dituangkan dalam berita acara.</p></li>
      <li><p>Apabila kesepakatan tidak bisa dilakukan dengan jalan musyawarah dan tidak berhasil mencapai suatu kemufakatan maka kedua pihak bersepakat untuk diselesaikan dengan jalur hukum.</p></li>
    </ol>
  </div>

  <!-- PASAL 10 -->
  <div class="section">
    <div class="ptitle">Pasal 10<br>PENUTUP</div>
    <p>Hal-hal yang belum atau tidak cukup diatur dalam perjanjian ini, apabila di kemudian hari diperlukan, akan ditetapkan dalam suatu Addendum yang mengikat dan menjadi bagian yang tidak terpisahkan dari perjanjian ini.</p>
    <p>Demikian Perjanjian Kerja Sama ini dibuat dan ditandatangani di atas kertas e-Meterai, dengan masing-masing pihak memiliki kekuatan hukum yang sama dan berlaku sejak tanggal penandatanganan.</p>
  </div>

  <!-- PASAL 11 -->
  <div class="section">
    <div class="ptitle">Pasal 11<br>KHATIMAH</div>
    <p class="center">&ldquo;Dan janganlah sebagian kamu memakan harta sebagian yang lain diantara kamu dengan cara yang bathil dan janganlah kamu membawa urusan itu kepada hakim supaya dapat memakan sebagian harta benda orang lain, dengan jalan berbuat dosa, padahal kamu mengetahui.&rdquo;</p>
    <p class="center">(QS. Al-Baqarah : 188)</p>
  </div>

  <!-- TANDA TANGAN -->
  <div style="margin-top:2.5em;page-break-inside:avoid;">
    <p style="text-align:right;">Bandung, ${date}</p>
    <div class="sig">
      <div class="sb">
        <div class="bold">PIHAK PERTAMA I</div>
        ${pks.esignPihakPertama1
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(pks.esignPihakPertama1)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>${esc(PIHAK_PERTAMA_I.nama)}</strong></div>
      </div>
      <div class="sb">
        <div class="bold">PIHAK PERTAMA II</div>
        ${pks.esignPihakPertama2
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(pks.esignPihakPertama2)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>${esc(pp2.nama)}</strong></div>
      </div>
      <div class="sb">
        <div class="bold">PIHAK KEDUA</div>
        ${pks.esignPihakKedua
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(pks.esignPihakKedua)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>${esc(pks.investorName)}</strong></div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Template B â€” Direct (2 pihak: PP I / Adie saja + Investor)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generatePksHtmlDirect(pks: Pks, transaksis: Transaksi[]): string {
  const date        = fmtDate(pks.date);
  const endDateStr  = fmtDate(pks.endDate || addDays(pks.date, pks.contractPeriod * (pks.siklus ?? 1)));
  const amount      = fmtRp(pks.investmentAmount);
  const words       = esc(cap(terbilang(pks.investmentAmount)));
  const months      = durationMonths(pks);
  const totalDays   = months * 30;
  const periodFull  = periodTextDirect(totalDays);
  const monthsLabel = cap(angkaTerbilang(months));

  const pp1Pct = pks.bagiHasilPP1 ?? 60;
  const pkPct  = pks.bagiHasilPK  ?? 40;

  const { trxQty, trxHpp, trxModal, trxOngkir, trxHargaJual, trxIncome, trxProfit,
          bhOwner, bhInvestor, estKeuntungan, roiPerBulan } =
    calcTrxData(pks, transaksis);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Surat Perjanjian Investasi â€“ ${esc(pks.id)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="doc">

  <!-- JUDUL -->
  <div class="center">
    <div class="bold" style="font-size:13pt;">SURAT PERJANJIAN INVESTASI</div>
    <div class="bold" style="font-size:12pt;margin-top:.4em;">&ldquo;Trading Kentang Granola&rdquo;</div>
    <div style="margin-top:.3em;font-size:10pt;color:#555;">No. Pks: ${esc(pks.id)}</div>
  </div>

  <!-- MUKADIMAH -->
  <div class="section center">
    <div class="bold">MUKADIMAH</div>
    <br>
    <p class="center">Allah SWT berfirman (dalam hadits Qudsi):</p>
    <p class="center">&ldquo;Aku adalah pihak ketiga (Yang Maha Melindungi) bagi dua orang yang melakukan syirkah, selama salah seorang diantara mereka tidak berkhianat kepada lawan syarikatnya. Apabila diantara mereka ada yang berkhianat, maka Aku akan keluar dari mereka (tidak melindungi)&rdquo;</p>
    <p class="center">(HR Imam Daruquthni dari Abu Hurairah r.a.)</p>
  </div>

  <!-- PEMBUKA -->
  <div class="section">
    <p>Dengan menyebut nama Allah Yang Maha Pengasih lagi Maha Penyayang, pada tanggal <strong>${date}</strong> di Bandung, yang bertanda tangan di bawah ini:</p>

    <div style="margin:.5em 2em;">
      ${row("Nama",      esc(PIHAK_PERTAMA_I.nama))}
      ${row("Alamat",    esc(PIHAK_PERTAMA_I.alamat))}
      ${row("Pekerjaan", esc(PIHAK_PERTAMA_I.pekerjaan))}
      ${row("No KTP",    esc(PIHAK_PERTAMA_I.noKtp))}
      ${row("No. Hp",    esc(PIHAK_PERTAMA_I.noTelp))}
    </div>
    <p>Bertindak sebagai pengelola investasi usaha trading kentang granola, yang selanjutnya disebut PIHAK PERTAMA.</p>

    <div style="margin:.5em 2em;">
      ${row("Nama",      esc(pks.investorName))}
      ${row("Alamat",    esc(pks.investorAddress))}
      ${row("Pekerjaan", esc(pks.investorOccupation))}
      ${row("No. KTP",   esc(pks.investorIdNumber))}
      ${row("No. Hp",    esc(pks.investorPhone))}
    </div>
    <p>Untuk selanjutnya disebut PIHAK KEDUA sebagai Pemberi Modal investasi usaha/ investor.</p>
  </div>

  <!-- PASAL 1 -->
  <div class="section">
    <div class="ptitle">Pasal 1<br>BENTUK, NAMA, dan LOKASI USAHA</div>
    <ol>
      <li><p>Bentuk usaha ini adalah usaha agribisnis, trading kentang granola (Pemenuhan <em>supply</em> ke <em>All Projects</em>) yang dikelola oleh PIHAK PERTAMA yang bernama ${esc(PIHAK_PERTAMA_I.nama)} selaku Direktur sekaligus pelaksana kegiatan agribisnis, pemasaran, dan pengelolaan investasi di PT Madani Agri Lestari.</p></li>
      <li><p>Lokasi usaha Rancamanyar, Pangalengan, Kabupaten Bandung, Jawa Barat 40378</p></li>
    </ol>
  </div>

  <!-- PASAL 2 -->
  <div class="section">
    <div class="ptitle">Pasal 2<br>BENTUK KERJA SAMA</div>
    <p>Bahwa PIHAK PERTAMA bertindak sebagai Direktur sekaligus pelaksana kegiatan agribisnis, pemasaran, dan pengelolaan investasi di PT Madani Agri Lestari.</p>
    <p>PIHAK KEDUA Pemberi Modal usaha untuk kemudian dikelola oleh PIHAK PERTAMA untuk melaksanakan usaha trading kentang granola.</p>
  </div>

  <!-- PASAL 3 -->
  <div class="section">
    <div class="ptitle">Pasal 3<br>JANGKA WAKTU KERJA SAMA</div>
    <p>Penyertaan modal PIHAK KEDUA kepada PIHAK PERTAMA selama kurun waktu <strong>${periodFull}</strong>, terhitung mulai tanggal <strong>${date} sampai dengan ${endDateStr}</strong> dan akan diperpanjang secara otomatis apabila tidak ada keberatan dari kedua belah pihak. Apabila salah satu pihak bermaksud melakukan perubahan, penarikan, atau pengembalian modal, maka wajib menyampaikan pemberitahuan secara tertulis paling lambat tiga puluh (30) hari kalender sebelum perubahan tersebut berlaku.</p>
  </div>

  <!-- PASAL 4 -->
  <div class="section">
    <div class="ptitle">Pasal 4<br>BAGI HASIL</div>
    <p>Bagi hasil usaha diterima oleh para pihak dalam bentuk uang tunai dari hasil usaha tersebut diatas dan para pihak sepakat bahwa besarnya bagi hasil adalah :</p>
    <p><strong>A. &nbsp; PIHAK PERTAMA &nbsp;&nbsp;: ${pp1Pct}% (${esc(PIHAK_PERTAMA_I.nama)}/ Pengelola)</strong></p>
    <p><strong>B. &nbsp; PIHAK KEDUA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${pkPct}% (${esc(pks.investorName)}/ Investor)</strong></p>
    <p>Investasi ini memiliki jangka waktu bagi hasil dalam siklus 4 minggu (menyesuaikan proyek tersedia yang akan diinformasikan setelah proyek berjalan berakhir dan menghasilkan keuntungan laba bagi hasil) serta persentase ROI diinformasikan melalui <em>WhatsApp</em> dikarenakan menyesuaikan dengan kondisi pasar. Investasi/ proyek akan dikelola selama periode ${periodFull}. Transfer bagi hasil usaha dilakukan di setiap akhir proyek dengan skema PO <em>All Projects</em> ${months}x yang nanti akan diinfokan oleh PIHAK PERTAMA kepada PIHAK KEDUA.</p>

    <p>Tabel simulasi bagi hasil:</p>

    <!-- Tabel Simulasi Direct -->
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:.6em;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th colspan="8" style="border:1px solid #000;padding:4px 6px;text-align:center;">Bagi Hasil All Project</th>
        </tr>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;white-space:nowrap;">Pengiriman<br>ke</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Quantity</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">HPP</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Kebutuhan<br>Modal/</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Ongkos<br>Kirim</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Harga<br>Jual</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Income</th>
          <th style="border:1px solid #000;padding:4px 5px;text-align:center;">Profit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:4px 5px;text-align:center;">1</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxQty}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxHpp}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxModal}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxOngkir}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxHargaJual}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxIncome}</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;">${trxProfit}</td>
        </tr>
        <tr style="background:#f9f9f9;">
          <td colspan="3" style="border:1px solid #000;padding:4px 5px;font-weight:bold;">Modal berputar</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;font-weight:bold;">${trxModal}</td>
          <td colspan="3" style="border:1px solid #000;padding:4px 5px;font-weight:bold;">Keuntungan</td>
          <td style="border:1px solid #000;padding:4px 5px;text-align:right;font-weight:bold;">${trxProfit}</td>
        </tr>
      </tbody>
    </table>

    <!-- Ringkasan Direct -->
    <table style="width:55%;border-collapse:collapse;font-size:9.5pt;margin-bottom:.6em;">
      <tr><td style="border:1px solid #000;padding:4px 8px;">Modal</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;font-weight:bold;">${trxModal}</td></tr>
      <tr><td style="border:1px solid #000;padding:4px 8px;">Estimasi Keuntungan Per Bulan</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">${estKeuntungan}</td></tr>
      <tr><td style="border:1px solid #000;padding:4px 8px;">ROI perbulan</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">${roiPerBulan}</td></tr>
    </table>

    <!-- Distribusi Direct -->
    <table style="width:70%;border-collapse:collapse;font-size:9.5pt;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Hasil</th>
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Owner (${pp1Pct}%)</th>
          <th style="border:1px solid #000;padding:4px 8px;text-align:center;">Investor (${pkPct}%)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${trxProfit}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhOwner}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">${bhInvestor}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PASAL 5 -->
  <div class="section">
    <div class="ptitle">Pasal 5<br>HAK DAN KEWAJIBAN PARA PIHAK</div>
    <p><strong>A. PIHAK PERTAMA</strong></p>
    <ol>
      <li><p>Menyediakan bahan trading (jual beli) berupa kentang Granola L dengan spesifikasi dan jumlah sesuai permintaan.</p></li>
      <li><p>Melaksanakan kerja sama pemasaran kentang dengan pihak <em>All Projects</em>.</p></li>
      <li><p>Mengurus kontrak penjualan.</p></li>
      <li><p>Membuat laporan keuangan per transaksi kepada PIHAK KEDUA.</p></li>
      <li><p>Bertanggung Jawab atas pengembalian modal dan keuntungan kepada PIHAK KEDUA sesuai pasal 3 dan pasal 4.</p></li>
      <li><p>Berhak atas keuntungan usaha sesuai dengan pasal 4.</p></li>
    </ol>

    <p style="margin-top:.8em;"><strong>B. PIHAK KEDUA</strong></p>
    <ol>
      <li><p>Menyediakan modal kerja sebesar <strong>Rp. ${amount} (${words})</strong> untuk proyek trading kentang selama ${totalDays} hari (${monthsLabel.toLowerCase()} bulan) yang di transfer langsung ke rekening PIHAK PERTAMA <strong>${paymentAccount(pks)} atas nama Adie Bayu Putra, S.P.</strong></p></li>
      <li><p>Bersama-sama dengan PIHAK PERTAMA memantau perkembangan usaha dan mengambil keputusan bersama.</p></li>
      <li><p>Apabila terjadi pembatalan kerja sama yang dilakukan PIHAK PERTAMA, maka PIHAK PERTAMA mengembalikan modal dan keuntungannya.</p></li>
      <li><p>Berhak atas keuntungan usaha sesuai dengan pasal 4.</p></li>
    </ol>
  </div>

  <!-- PASAL 6 -->
  <div class="section">
    <div class="ptitle">Pasal 6<br>PEMBERITAHUAN</div>
    <p>Semua pemberitahuan, atau pernyataan, atau persetujuan yang wajib dan perlu dilakukan oleh salah satu pihak kepada pihak lainnya di dalam pelaksanaan perjanjian ini, disampaikan melalui pesan di aplikasi <em>WhatsApp</em>.</p>
  </div>

  <!-- PASAL 7 -->
  <div class="section">
    <div class="ptitle">Pasal 7<br>BERAKHIRNYA PERJANJIAN</div>
    <p>Perjanjian Kerja Sama ini berakhir apabila salah satu pihak memutuskan untuk tidak memperpanjang kerja sama lagi. Apabila salah satu pihak atau para pihak meninggal dunia dalam kelangsungan kerja sama ini, maka hak para pihak diteruskan kepada ahli waris atau orang yang ditunjuk oleh para pihak.</p>
  </div>

  <!-- PASAL 8 -->
  <div class="section">
    <div class="ptitle">Pasal 8<br>KERUGIAN</div>
    <p>Kerugian usaha pada hakikatnya ditanggung para pihak. Sesuai dengan hukum Islam tentang <em>syirkah mudharabah</em>, yaitu seperti berikut:</p>
    <p>a.&nbsp; Suatu kegiatan usaha mengandung risiko untung-rugi, maka kerugian modal usaha yang diakibatkan oleh <em>force majeure</em> (di luar kekuasaan para pihak), seperti kecelakaan atau tragedi bencana alam akan ditanggung bersama dengan mengedepankan musyawarah untuk mufakat.</p>
    <p>b.&nbsp; Apabila kerugian usaha disebabkan oleh kesengajaan PIHAK PERTAMA (pengelola) melakukan penyimpangan (kesalahan manajemen), seluruh kerugian usaha ditanggung 100% oleh PIHAK PERTAMA. Oleh karena itu, PIHAK PERTAMA berkewajiban melakukan pengembalian modal secara bertahap kepada PIHAK KEDUA dengan jangka waktu paling lama 6 (enam) bulan sejak tanggal ditetapkannya perhitungan kerugian secara final. Namun, apabila terjadi <em>force majeure</em> seperti terjadi kecelakaan di jalan ketika mengirim pesanan kentang ke gudang konsumen, lalu kentangnya jatuh maka secara proporsional kerugian sesuai dengan persentase bagi hasil sebagaimana tercantum pada pasal 4, yaitu :</p>
    <p class="indent">A. PIHAK PERTAMA &nbsp;: ${pp1Pct}% (${esc(PIHAK_PERTAMA_I.nama)}/ Pengelola)</p>
    <p class="indent">B. PIHAK KEDUA &nbsp;&nbsp;&nbsp;&nbsp;: ${pkPct}% (${esc(pks.investorName)}/ Investor)</p>
    <p>c.&nbsp; Apabila terjadi pembatalan terhadap isi akad syarikat yang dilakukan oleh PIHAK KEDUA (Pemilik Modal), seluruh kerugian usaha ditanggung oleh PIHAK KEDUA mencakup pengembalian modal usaha yang telah dikeluarkan oleh PIHAK PERTAMA.</p>
  </div>

  <!-- PASAL 9 -->
  <div class="section">
    <div class="ptitle">Pasal 9<br>PERSELISIHAN</div>
    <ol>
      <li><p>Bilamana dalam pelaksanaan perjanjian kerja sama ini terdapat perselisihan antara para pihak baik dalam pelaksanaannya ataupun dalam penafsiran salah satu pasal dalam perjanjian ini, maka para pihak bersepakat menyelesaikan perselisihan secara musyawarah.</p></li>
      <li><p>Segala sesuatu yang merupakan hasil penyelesaian perselisihan akan dituangkan dalam berita acara.</p></li>
      <li><p>Apabila kesepakatan tidak bisa dilakukan dengan jalan musyawarah dan tidak berhasil mencapai suatu kemufakatan maka para pihak bersepakat untuk diselesaikan dengan jalur hukum di Pengadilan Negeri Bandung.</p></li>
    </ol>
  </div>

  <!-- PASAL 10 -->
  <div class="section">
    <div class="ptitle">Pasal 10<br>PENUTUP</div>
    <p>Hal-hal yang belum diatur atau belum cukup diatur dalam perjanjian ini apabila di kemudian hari dibutuhkan dan dipandang perlu maka akan ditetapkan dalam suatu ADDENDUM yang berlaku mengikat bagi para pihak dan merupakan bagian yang tidak terpisahkan dari perjanjian ini.</p>
    <p>Demikian surat perjanjian kerja sama ini dibuat yang ditandatangani di atas kertas e-materai yang masing-masing pihak mempunyai kekuatan hukum yang sama dan berlaku sejak ditandatangani.</p>
  </div>

  <!-- PASAL 11 -->
  <div class="section">
    <div class="ptitle">Pasal 11<br>KHATIMAH</div>
    <p class="center">&ldquo;Dan janganlah sebagian kamu memakan harta sebagian yang lain diantara kamu dengan cara yang bathil dan janganlah kamu membawa urusan itu kepada hakim supaya dapat memakan sebagian harta benda orang lain, dengan jalan berbuat dosa, padahal kamu mengetahui.&rdquo; (QS. Al-Baqarah : 188)</p>
  </div>

  <!-- TANDA TANGAN (2 pihak) -->
  <div style="margin-top:2.5em;page-break-inside:avoid;">
    <p style="text-align:right;">Bandung, ${date}</p>
    <div class="sig">
      <div class="sb2">
        <div>Pihak Pertama,</div>
        ${pks.esignPihakPertama1
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(pks.esignPihakPertama1)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div>${esc(PIHAK_PERTAMA_I.nama)}</div>
      </div>
      <div class="sb2">
        <div>Pihak Kedua,</div>
        ${pks.esignPihakKedua
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(pks.esignPihakKedua)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div>${esc(pks.investorName)}</div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dispatcher â€” pilih template berdasarkan data PKS
// bagiHasilPP2 > 0 â†’ Under TM (3 pihak)
// bagiHasilPP2 = 0 â†’ Direct (2 pihak, Adie saja)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function generatePksHtml(pks: Pks, transaksis: Transaksi[] = []): string {
  const id = pks.investorId ?? "";
  // Routing eksplisit berdasarkan prefix ID investor
  if (id.startsWith("INV-D-"))  return generatePksHtmlDirect(pks, transaksis);
  if (id.startsWith("INV-TM-")) return generatePksHtmlTm(pks, transaksis, PIHAK_PERTAMA_II_TM);
  if (id.startsWith("INV-MB-")) return generatePksHtmlTm(pks, transaksis, PIHAK_PERTAMA_II_MB);
  // Fallback untuk prefix tidak dikenal: pakai bagiHasilPP2 sebagai penanda
  return (pks.bagiHasilPP2 ?? 0) === 0
    ? generatePksHtmlDirect(pks, transaksis)
    : generatePksHtmlTm(pks, transaksis, PIHAK_PERTAMA_II_MB);
}
