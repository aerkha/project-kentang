import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

/** Escape nilai string untuk filter PocketBase agar aman dari injection. */
function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * POST /api/notify-investor
 *
 * Kirim notifikasi ke investor bahwa bagi hasilnya sudah dibayar.
 * Body: { mouId, keterangan, investorId, jumlah, buktiUrl, mouCustomId }
 * Auth : Authorization: Bearer <pb_token>
 */

interface NotifyBody {
  mouCustomId:  string;
  keterangan:   string;
  investorId:   string;
  jumlah:       number;
  buktiUrl:     string;
}

type ChannelStatus = "sent" | "failed" | "skipped";

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

// ── History helpers ────────────────────────────────────────────────────────────

interface MouRecord {
  id:               string;   // PB internal id
  customId:         string;   // MOU-YYYYMM-NNN
  date:             string;
  contractPeriod:   number;
  investmentAmount: number;
  bagiHasilPK:      number;   // % bagi hasil PKS (default 35)
  status:           string;
  bagiHasilChecks?: Record<string, boolean>;
  bagiHasilDone?:   boolean;
}

interface TiRecord {
  transaksiId:    string;
  investorId:     string;
  nilaiInvestasi: number;
  pctTrader:      number;
  pctMinBun:      number;
  pctBrokerI:     number;
  pctBrokerII:    number;
}

interface TrxRecord {
  id:             string;
  date:           string;  // dibutuhkan untuk filter per periode MoU
  hpp:            number;
  kebutuhanModal: number;
  ongkirPerKg:    number;
  hargaJual:      number;
}

interface BagiHasil {
  investor: number;
  trader:   number;
  minbun:   number;
  broker:   number;
}

/**
 * Hitung bagi hasil untuk satu investor dalam satu transaksi.
 * Formula ini identik dengan reminder-content.tsx::calcBagiHasil:
 *
 *   investor = profit × ratio × pkPct
 *   trader   = profit × ratio × pctTrader/100
 *   minbun   = profit × ratio × pctMinBun/100
 *   broker   = profit × ratio × (pctBrokerI+pctBrokerII)/100
 *
 * investor mendapat pkPct (mis. 35%) dari porsi profit-nya.
 * trader/minbun/broker dibayar dari sisa porsi Pihak Pertama — bukan dari investor's share.
 */
function calcBagiHasil(
  profit:     number,
  pkPct:      number,
  ti:         TiRecord,
  totalModal: number,
): BagiHasil {
  if (totalModal <= 0 || profit <= 0) return { investor: 0, trader: 0, minbun: 0, broker: 0 };
  const ratio    = ti.nilaiInvestasi / totalModal;
  const share    = profit * ratio;              // porsi profit proporsional investor ini
  const investor = share * pkPct;               // mis. 35% dari porsi profit-nya
  const trader   = share * (ti.pctTrader  / 100);
  const minbun   = share * (ti.pctMinBun  / 100);
  const broker   = share * ((ti.pctBrokerI + ti.pctBrokerII) / 100);
  return { investor, trader, minbun, broker };
}

interface HistoryRow {
  mouCustomId:      string;
  periodeStart:     string;
  periodeEnd:       string;
  investmentAmount: number;
  bh:               BagiHasil;
  status:           string;
  lunas:            boolean;
}

async function buildHistory(
  pb:         PocketBase,
  investorId: string,   // customId investor, mis. "INV-0001"
): Promise<HistoryRow[]> {
  // 1. Ambil semua MoU milik investor ini
  let mous: MouRecord[] = [];
  try {
    const raw = await pb.collection("mous").getFullList({
      filter: `investorId = "${pbEsc(investorId)}"`,
      sort:   "date",
    });
    mous = raw.map((r) => ({
      id:               r.id               as string,
      customId:         r.customId         as string,
      date:             r.date             as string,
      contractPeriod:   r.contractPeriod   as number,
      investmentAmount: r.investmentAmount as number,
      bagiHasilPK:      (r.bagiHasilPK    as number) ?? 35,
      status:           (r.status          as string) || "aktif",
      bagiHasilChecks:  (r.bagiHasilChecks as Record<string, boolean>) || {},
      bagiHasilDone:    r.bagiHasilDone   as boolean,
    }));
  } catch {
    return [];
  }
  if (mous.length === 0) return [];

  // 2. Ambil 10 TI records terbaru milik investor ini.
  //    Dibatasi 10 transaksi terakhir agar tidak timeout di serverless function.
  let myTis: TiRecord[] = [];
  try {
    const res = await pb.collection("transaksi_investors").getList(1, 10, {
      filter: `investorId = "${pbEsc(investorId)}"`,
      sort:   "-created",
    });
    myTis = res.items.map((r) => ({
      transaksiId:    r.transaksiId    as string,
      investorId:     r.investorId     as string,
      nilaiInvestasi: r.nilaiInvestasi as number,
      pctTrader:      (r.pctTrader     as number) ?? 10,
      pctMinBun:      (r.pctMinBun     as number) ?? 5,
      pctBrokerI:     (r.pctBrokerI    as number) ?? 0,
      pctBrokerII:    (r.pctBrokerII   as number) ?? 0,
    }));
  } catch {
    // koleksi belum ada atau kosong — BH akan 0
  }
  if (myTis.length === 0) {
    return mous.map((mou) => ({
      mouCustomId:      mou.customId,
      periodeStart:     mou.date,
      periodeEnd:       addDays(mou.date, mou.contractPeriod),
      investmentAmount: mou.investmentAmount,
      bh:               { investor: 0, trader: 0, minbun: 0, broker: 0 },
      status:           mou.status,
      lunas:            mou.bagiHasilDone === true,
    }));
  }

  // 3. Ambil transaksis yang direferens oleh TI di atas (max 10 record, sudah dibatasi di step 2)
  const trxIdSet = new Set(myTis.map((ti) => ti.transaksiId));
  const trxMap   = new Map<string, TrxRecord>();
  try {
    const idFilter = [...trxIdSet].map((id) => `id = "${pbEsc(id)}"`).join(" || ");
    const raw = await pb.collection("transaksis").getFullList({ filter: idFilter });
    for (const r of raw) {
      trxMap.set(r.id as string, {
        id:             r.id             as string,
        date:           r.date           as string,
        hpp:            r.hpp            as number,
        kebutuhanModal: r.kebutuhanModal as number,
        ongkirPerKg:    r.ongkirPerKg    as number,
        hargaJual:      r.hargaJual      as number,
      });
    }
  } catch { /* abaikan */ }

  // 4. Ambil SEMUA TI untuk transaksi-transaksi tersebut (bukan hanya milik investor ini)
  //    Diperlukan untuk menghitung totalModal yang benar (penyebut rasio).
  //    Jumlah transaksi sudah dibatasi 10, jadi filter ini aman.
  const totalModalMap = new Map<string, number>(); // transaksiId → total semua investor
  if (trxIdSet.size > 0) {
    try {
      const idFilter = [...trxIdSet].map((id) => `transaksiId = "${id}"`).join(" || ");
      const raw = await pb.collection("transaksi_investors").getFullList({
        filter: idFilter,
        fields: "transaksiId,nilaiInvestasi",
      });
      for (const r of raw) {
        const tid = r.transaksiId as string;
        totalModalMap.set(tid, (totalModalMap.get(tid) ?? 0) + (r.nilaiInvestasi as number));
      }
    } catch { /* abaikan */ }
  }

  // 5. Hitung bagi hasil per MoU — filter transaksi berdasarkan periode MoU
  return mous.map((mou) => {
    const mouStart = new Date(mou.date).getTime();
    const mouEnd   = mouStart + mou.contractPeriod * 86_400_000;
    const pkPct    = (mou.bagiHasilPK ?? 35) / 100;
    const periodeEnd = addDays(mou.date, mou.contractPeriod);

    let totalBh: BagiHasil = { investor: 0, trader: 0, minbun: 0, broker: 0 };

    for (const ti of myTis) {
      const trx = trxMap.get(ti.transaksiId);
      if (!trx) continue;

      // Filter: hanya transaksi yang tanggalnya masuk periode MoU ini
      const tDate = new Date(trx.date).getTime();
      if (tDate < mouStart || tDate > mouEnd) continue;

      // Hitung profit transaksi
      const qty         = trx.hpp > 0 ? trx.kebutuhanModal / trx.hpp : 0;
      const totalOngkir = trx.ongkirPerKg * qty;
      const income      = trx.hargaJual * qty;
      const profit      = income - (trx.kebutuhanModal + totalOngkir);

      // totalModal = jumlah SEMUA investor dalam transaksi ini (bukan hanya investor ini)
      const totalModal = totalModalMap.get(ti.transaksiId) ?? ti.nilaiInvestasi;

      const bh = calcBagiHasil(profit, pkPct, ti, totalModal);
      totalBh = {
        investor: totalBh.investor + bh.investor,
        trader:   totalBh.trader   + bh.trader,
        minbun:   totalBh.minbun   + bh.minbun,
        broker:   totalBh.broker   + bh.broker,
      };
    }

    return {
      mouCustomId:      mou.customId,
      periodeStart:     mou.date,
      periodeEnd,
      investmentAmount: mou.investmentAmount,
      bh:               totalBh,
      status:           mou.status,
      lunas:            mou.bagiHasilDone === true,
    };
  });
}

/** Tambahkan N hari ke tanggal string "YYYY-MM-DD" */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Email HTML ─────────────────────────────────────────────────────────────────

function buildHistoryTableHtml(rows: HistoryRow[]): string {
  if (rows.length === 0) return "";

  const statusLabel: Record<string, string> = {
    aktif:      "Aktif",
    expired:    "Berakhir",
    selesai:    "Selesai",
    dihentikan: "Dihentikan",
  };
  const statusColor: Record<string, string> = {
    aktif:      "#16a34a",
    expired:    "#dc2626",
    selesai:    "#2563eb",
    dihentikan: "#6b7280",
  };

  const rowsHtml = rows.map((r, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const statusLbl   = statusLabel[r.status]  ?? r.status;
    const statusClr   = statusColor[r.status]  ?? "#6b7280";
    const lunasIcon   = r.lunas ? "✅" : "⏳";
    const totalBh     = r.bh.investor + r.bh.trader + r.bh.minbun + r.bh.broker;
    return `
    <tr style="background:${bg};">
      <td style="padding:9px 10px;font-family:monospace;font-size:12px;font-weight:700;white-space:nowrap;">${r.mouCustomId}</td>
      <td style="padding:9px 10px;font-size:12px;white-space:nowrap;">${fmtDate(r.periodeStart)}</td>
      <td style="padding:9px 10px;font-size:12px;white-space:nowrap;">${fmtDate(r.periodeEnd)}</td>
      <td style="padding:9px 10px;font-size:12px;text-align:right;white-space:nowrap;">${fmtRp(r.investmentAmount)}</td>
      <td style="padding:9px 10px;font-size:12px;text-align:right;white-space:nowrap;color:#16a34a;font-weight:600;">${totalBh > 0 ? fmtRp(r.bh.investor) : "—"}</td>
      <td style="padding:9px 10px;font-size:12px;text-align:center;">
        <span style="color:${statusClr};font-size:11px;font-weight:600;">${statusLbl}</span>
      </td>
      <td style="padding:9px 10px;font-size:13px;text-align:center;">${lunasIcon}</td>
    </tr>`;
  }).join("");

  const totalInvestment = rows.reduce((s, r) => s + r.investmentAmount, 0);
  const totalInvestor   = rows.reduce((s, r) => s + r.bh.investor, 0);

  return `
  <div style="margin-top:28px;">
    <h2 style="margin:0 0 12px;font-size:14px;color:#111827;font-weight:700;">📊 Ringkasan Seluruh PKS</h2>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">
        <thead>
          <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
            <th style="padding:9px 10px;text-align:left;color:#6b7280;font-weight:600;white-space:nowrap;">No. PKS</th>
            <th style="padding:9px 10px;text-align:left;color:#6b7280;font-weight:600;white-space:nowrap;">Tgl Mulai</th>
            <th style="padding:9px 10px;text-align:left;color:#6b7280;font-weight:600;white-space:nowrap;">Tgl Selesai</th>
            <th style="padding:9px 10px;text-align:right;color:#6b7280;font-weight:600;white-space:nowrap;">Nilai Investasi</th>
            <th style="padding:9px 10px;text-align:right;color:#6b7280;font-weight:600;white-space:nowrap;">Bagi Hasil Anda</th>
            <th style="padding:9px 10px;text-align:center;color:#6b7280;font-weight:600;">Status</th>
            <th style="padding:9px 10px;text-align:center;color:#6b7280;font-weight:600;">Lunas</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #e5e7eb;">
            <td colspan="3" style="padding:9px 10px;font-size:12px;color:#6b7280;font-weight:600;">${rows.length} PKS</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:12px;">${fmtRp(totalInvestment)}</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;color:#16a34a;font-size:12px;">${fmtRp(totalInvestor)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>`;
}

function buildEmailHtml(opts: {
  investorName: string;
  mouCustomId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
  historyHtml:  string;
}): string {
  const { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal, historyHtml } = opts;
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">✅ Konfirmasi Pembayaran Bagi Hasil</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">${tanggal} · MinBun ERP</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${investorName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami ingin memberitahukan bahwa bagi hasil Anda telah berhasil dibayarkan.
        Berikut detailnya:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. PKS</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${mouCustomId}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Jenis Bagi Hasil</td>
          <td style="padding:10px 14px;font-weight:600;border-top:1px solid #f3f4f6;">${keterangan}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Jumlah</td>
          <td style="padding:10px 14px;font-weight:700;color:#16a34a;font-size:15px;">${fmtRp(jumlah)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Tanggal Bayar</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;">${tanggal}</td>
        </tr>
      </table>

      ${buktiUrl ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${buktiUrl}"
          style="display:inline-block;background:#16a34a;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
          📎 Lihat Bukti Transfer
        </a>
      </div>` : ""}

      ${historyHtml}

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Jika ada pertanyaan, silakan hubungi tim MinBun.<br>
        Terima kasih atas kepercayaan Anda.
      </p>
    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP · Jangan membalas email ini
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── WhatsApp message ───────────────────────────────────────────────────────────

function buildWaMessage(opts: {
  investorName: string;
  mouCustomId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
  history:      HistoryRow[];
}): string {
  const { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal, history } = opts;
  const lines = [
    `✅ *Konfirmasi Pembayaran Bagi Hasil*`,
    ``,
    `Yth. *${investorName}*,`,
    ``,
    `Bagi hasil Anda telah berhasil dibayarkan:`,
    ``,
    `📋 No. PKS   : ${mouCustomId}`,
    `📂 Jenis     : ${keterangan}`,
    `💰 Jumlah    : *${fmtRp(jumlah)}*`,
    `📅 Tgl Bayar : ${tanggal}`,
  ];
  if (buktiUrl) {
    lines.push(``, `📎 Bukti Transfer:`, buktiUrl);
  }

  // History summary
  if (history.length > 0) {
    lines.push(``, `─────────────────────────`, `📊 *Ringkasan Seluruh PKS*`, ``);
    for (const r of history) {
      const lunasIcon = r.lunas ? "✅" : "⏳";
      const totalBh   = r.bh.investor;
      lines.push(
        `${lunasIcon} *${r.mouCustomId}*`,
        `   Investasi : ${fmtRp(r.investmentAmount)}`,
        `   Bagi Hasil: ${totalBh > 0 ? fmtRp(totalBh) : "belum ada data"}`,
        `   Status    : ${r.status}`,
        ``,
      );
    }
    const totalInvestment = history.reduce((s, r) => s + r.investmentAmount, 0);
    const totalInvestor   = history.reduce((s, r) => s + r.bh.investor, 0);
    lines.push(
      `*Total Investasi : ${fmtRp(totalInvestment)}*`,
      `*Total Bagi Hasil: ${fmtRp(totalInvestor)}*`,
    );
  }

  lines.push(``, `Terima kasih atas kepercayaan Anda. 🙏`, `_— Tim MinBun_`);
  return lines.join("\n");
}

// ── Kirim Email ────────────────────────────────────────────────────────────────

async function sendEmail(to: string, opts: Parameters<typeof buildEmailHtml>[0]): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return "skipped";

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from:    `"MinBun ERP" <${user}>`,
    to,
    subject: `[MinBun] ✅ Konfirmasi Bagi Hasil ${opts.keterangan} — ${opts.mouCustomId}`,
    html:    buildEmailHtml(opts),
  });
  return "sent";
}

// ── Kirim WhatsApp ─────────────────────────────────────────────────────────────

async function sendWhatsApp(phone: string, opts: Parameters<typeof buildWaMessage>[0]): Promise<ChannelStatus> {
  const token = process.env.FONNTE_TOKEN;
  if (!token || !phone) return "skipped";

  // Normalkan nomor: 08xx → 628xx
  const normalized = phone.replace(/^0/, "62").replace(/\D/g, "");
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: new URLSearchParams({
      target:      normalized,
      message:     buildWaMessage(opts),
      countryCode: "62",
    }),
  });
  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
  return "sent";
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verifikasi PocketBase token
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Buat satu instance PocketBase yang digunakan untuk seluruh handler
  let pb: PocketBase;
  try {
    pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  // 2. Parse body
  let body: NotifyBody;
  try {
    body = await req.json() as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { mouCustomId, keterangan, investorId, jumlah, buktiUrl } = body;
  if (!mouCustomId || !keterangan || !investorId) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }
  if (jumlah !== undefined && (typeof jumlah !== "number" || jumlah < 0)) {
    return NextResponse.json({ error: "Field jumlah tidak valid" }, { status: 400 });
  }

  // 3. Ambil data investor dari PocketBase
  let investorPhone = "";
  let investorEmail = "";
  let investorName  = "";

  try {
    const inv = await pb.collection("investors").getFirstListItem(
      `customId = "${pbEsc(investorId)}"`,
      { fields: "name,phone,email" }
    );
    investorName  = (inv.name  as string) || "";
    investorPhone = (inv.phone as string) || "";
    investorEmail = (inv.email as string) || "";
  } catch {
    return NextResponse.json({ error: `Investor "${investorId}" tidak ditemukan` }, { status: 404 });
  }

  // 4. Ambil riwayat investasi untuk history table
  const history = await buildHistory(pb, investorId);
  const historyHtml = buildHistoryTableHtml(history);

  const tanggal  = fmtDate(new Date().toISOString().slice(0, 10));
  const baseOpts = { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal };
  const errors: string[] = [];

  // 5. Kirim WA ke investor
  const waStatus = await sendWhatsApp(investorPhone, { ...baseOpts, history }).catch((e) => {
    errors.push(`WA: ${String(e)}`);
    return "failed" as ChannelStatus;
  });

  // 6. Kirim email ke investor
  const emailStatus = await sendEmail(investorEmail, { ...baseOpts, historyHtml }).catch((e) => {
    errors.push(`Email: ${String(e)}`);
    return "failed" as ChannelStatus;
  });

  return NextResponse.json({
    waStatus,
    emailStatus,
    errors: errors.length ? errors : undefined,
  });
}
