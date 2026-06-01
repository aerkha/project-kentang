import type { MoU } from "./mou-context";
import { angkaTerbilang, terbilang } from "./terbilang";

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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

function row(label: string, value: string, wide = false) {
  const w = wide ? "200px" : "120px";
  return `
  <div style="display:flex;margin-bottom:3pt;line-height:1.5;">
    <span style="min-width:${w};flex-shrink:0;">${label}</span>
    <span style="width:18px;text-align:center;flex-shrink:0;">:</span>
    <span style="flex:1;">${value}</span>
  </div>`;
}

export function generateMouHtml(mou: MoU): string {
  const date     = fmtDate(mou.date);
  const amount   = fmtRp(mou.investmentAmount);
  const words    = esc(cap(terbilang(mou.investmentAmount)));
  const period   = `${cap(angkaTerbilang(mou.contractPeriod))} (${mou.contractPeriod}) hari`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Perjanjian Kerjasama – ${esc(mou.id)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}

  /* Tampilan layar — simulasi kertas A4 */
  body{
    font-family:'Times New Roman',Times,serif;
    font-size:12pt;
    color:#000;
    background:#6b7280;
  }
  .doc{
    width:210mm;
    min-height:297mm;
    margin:24px auto;
    padding:3cm 2.5cm 3cm 3cm;
    background:#fff;
    box-shadow:0 4px 16px rgba(0,0,0,.35);
  }

  /* Tipografi */
  p{text-align:justify;margin-bottom:.55em;line-height:1.7;}
  .center{text-align:center;}
  .bold{font-weight:bold;}
  .section{margin-top:1.6em;}
  .ptitle{text-align:center;font-weight:bold;margin-bottom:.6em;line-height:1.5;}
  ol{margin-left:1.6em;}
  ol li{margin-bottom:.4em;line-height:1.7;text-align:justify;}
  .indent{margin-left:2em;}

  /* Tanda tangan */
  .sig{display:flex;justify-content:space-between;margin-top:3em;}
  .sb{text-align:center;width:30%;}
  .ss{height:5.5em;}

  /* Cetak — @page menangani margin setiap halaman secara konsisten */
  @page{
    size:A4;
    margin:3cm 2.5cm 3cm 3cm;   /* atas kanan bawah kiri */
  }
  @media print{
    body{background:#fff;}
    .doc{
      width:auto;
      margin:0;
      padding:0;           /* margin sudah diatur @page */
      box-shadow:none;
      min-height:unset;
    }
  }
</style>
</head>
<body>
<div class="doc">

  <!-- JUDUL -->
  <div class="center">
    <div class="bold" style="font-size:13pt;">PERJANJIAN KERJASAMA</div>
    <div class="bold" style="font-size:13pt;">INVESTASI TRADING KENTANG GRANOLA</div>
    <div style="margin-top:.4em;font-size:10pt;">No. MoU: ${esc(mou.id)}</div>
  </div>

  <!-- MUKADIMAH -->
  <div class="section center">
    <div class="bold">MUKADIMAH</div>
    <br>
    <p class="center" style="font-style:italic;">Allah SWT berfirman (dalam hadits Qudsi):</p>
    <p class="center">&ldquo;Aku adalah pihak ketiga (Yang Maha Melindungi) bagi dua orang yang melakukan syirkah, selama salah seorang di antara mereka tidak berkhianat kepada lawan syarikatnya. Apabila diantara mereka ada yang berkhianat, maka Aku akan keluar dari mereka (tidak melindungi)&rdquo;</p>
    <p class="center">(HR Imam Daruquthni dari Abu Hurairah r.a.)</p>
  </div>

  <!-- PEMBUKA -->
  <div class="section">
    <p>Dengan menyebut nama Allah Yang Maha Pengasih lagi Maha Penyayang, pada tanggal <strong>${date}</strong> di Pangalengan, Kabupaten Bandung, yang bertanda tangan di bawah ini:</p>

    <div style="margin:.5em 2em;">
      ${row("Nama","Adie Bayu Putra")}
      ${row("Alamat","Taman Kopo Katapang Blok A4. No 6, RT 001/ RW 014, Pangauban, Katapang, Kabupaten Bandung, Jawa Barat")}
      ${row("Pekerjaan","Direktur PT. Madani Agri Lestari")}
      ${row("No KTP","3207152607950002")}
      ${row("No Telepon","0852-9548-9413")}
    </div>
    <p>Sebagai PIHAK PERTAMA I, dan</p>

    <div style="margin:.5em 2em;">
      ${row("Nama","Parafitra Fidiasari (Mimin Berkebun)")}
      ${row("Alamat","Gg Sikembang RT 5/ RW 2, Podosugih, Pekalongan Barat, Jawa Tengah")}
      ${row("Pekerjaan","Karyawan Swasta")}
      ${row("No KTP","3321015604900001")}
      ${row("No Telepon","0896-7070-0889")}
    </div>
    <p>Sebagai PIHAK PERTAMA II</p>

    <p>Dalam hal ini keduanya bertindak sebagai Pengelola Investasi dan atas nama PT Madani Agri Lestari, berdasarkan Akta Pendirian Nomor AHU-0059177.AH.01.01.Tahun 2021. Selain daripada itu, bertindak sebagai Pengelola Investasi yang selanjutnya disebut PIHAK PERTAMA.</p>

    <div style="margin:.5em 2em;">
      ${row("Nama", esc(mou.investorName))}
      ${row("Alamat", esc(mou.investorAddress))}
      ${row("Pekerjaan", esc(mou.investorOccupation))}
      ${row("No. KTP", esc(mou.investorIdNumber))}
      ${row("No. Telp.", esc(mou.investorPhone))}
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
    <p class="indent">A.&nbsp; PIHAK PERTAMA I &nbsp;&nbsp;: 50 %</p>
    <p class="indent">B.&nbsp; PIHAK PERTAMA II &nbsp;: 15 %</p>
    <p class="indent">C.&nbsp; PIHAK KEDUA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: 35 %</p>
    <p>Investasi ini memiliki siklus bagi hasil empat (4) minggu sesuai ketersediaan proyek dan berlaku selama periode perjanjian kerjasama. Dana investasi digunakan untuk membiayai PO <em>All Customer</em> setiap 30 (tiga puluh) hari. Bagi hasil dibayarkan paling lambat setiap 30 (tiga puluh) hari atau sesuai tanggal jatuh tempo ke rekening <strong>Bank SMBC (Jenius) 90120410660 atas nama Parafitra Fidiasari</strong>. Jika PIHAK KEDUA hendak mengubah rekening untuk transfer bagi hasil, harap memberitahukan secara tertulis melalui <em>WhatsApp</em>.</p>
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
      <li><p>Menyediakan modal kerja sebesar <strong>Rp.${amount} (${words})</strong> yang ditransfer ke rekening <strong>BCA 6768043702 atas nama Adie Bayu Putra S.P</strong> untuk <em>project trading</em> selama periode perjanjian kerjasama berlangsung mengacu pada pasal 3.</p></li>
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
      ${row("Nama Ahli Waris", esc(mou.heirName), true)}
      ${row("Hubungan dengan Investor", esc(mou.heirRelationship), true)}
      ${row("No HP Ahli Waris", esc(mou.heirPhone), true)}
      ${row("Email Ahli Waris", "-", true)}
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
        ${mou.esignPihakPertama1
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(mou.esignPihakPertama1)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>Adie Bayu Putra</strong></div>
      </div>
      <div class="sb">
        <div class="bold">PIHAK PERTAMA II</div>
        ${mou.esignPihakPertama2
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(mou.esignPihakPertama2)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>Parafitra Fidiasari</strong><br>(Mimin Berkebun)</div>
      </div>
      <div class="sb">
        <div class="bold">PIHAK KEDUA</div>
        ${mou.esignPihakKedua
          ? `<div class="ss" style="display:flex;align-items:center;justify-content:center;"><img src="${esc(mou.esignPihakKedua)}" style="max-height:5em;max-width:100%;object-fit:contain;" /></div>`
          : `<div class="ss"></div>`}
        <div><strong>${esc(mou.investorName)}</strong></div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}
