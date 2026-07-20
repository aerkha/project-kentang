import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";
import { todayWibStr } from "@/lib/utils";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

interface NotifyBrokerBody {
  brokerName:   string;
  investorList: string;
  jumlah:       number;
  buktiUrl:     string;
  noPks:        string;
}

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Disember",
];

function fmtDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function buildWaMessageBroker(opts: NotifyBrokerBody & { tanggal: string }): string {
  const { brokerName, investorList, noPks, jumlah, buktiUrl, tanggal } = opts;

  const lines = [
    `Selamat malam Kak *${brokerName}*,`,
    `Berikut pencairan *Fee Broker* dari MinBun dengan detail sbb:`,
    ``,
    `*Tanggal*        : ${tanggal}`,
    `*No. Referensi*  : ${noPks}`,
    `*Daftar Klien*   : ${investorList}`,
    `*Total Fee*      : ${fmtRp(jumlah)}`,
    ``,
    `${buktiUrl ? buktiUrl : "_*Tidak ada lampiran bukti transfer*_"}`,
    ``,
    `Alhamdulillah, semoga berkah untuk kita semua.`,
    `Terima kasih sudah bekerjasama dengan Mimin Berkebun dan *PT Madani Agri Lestari*.`
  ];

  return lines.join("\n");
}

/**
 * Catat attempt pengiriman ke reminder_logs.
 * Dipanggil oleh route handler pada kedua jalur sukses DAN gagal,
 * agar log UI Riwayat Reminder akurat.
 */
async function logAttempt(
  pb: PocketBase,
  data: {
    brokerName: string;
    noPks:      string;
    jumlah:     number;
    waStatus:   "sent" | "failed" | "skipped";
    errorMessage: string;
  },
): Promise<void> {
  try {
    await pb.collection("reminder_logs").create({
      mouCustomId:  data.noPks,
      cycleNumber:  0,
      sentAt:       new Date().toISOString(),
      investorName: `Broker: ${data.brokerName}`,
      emailStatus:  "skipped",
      waStatus:     data.waStatus,
      errorMessage: data.errorMessage,
      triggeredBy:  "notifikasi",
      keterangan:   "Pencairan Fee Broker",
      jumlah:       data.jumlah,
    });
  } catch {
    /* silent — failure logging tidak boleh menggagalkan alur utama */
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pb: PocketBase;
  try {
    pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Token invalid" }, { status: 401 });
  }

  let body: NotifyBrokerBody;
  try {
    body = await req.json() as NotifyBrokerBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body.brokerName) {
    return NextResponse.json({ error: "Nama Broker kosong" }, { status: 400 });
  }

  // 1. Cari Data Broker — pisahkan dua skenario gagal:
  //    - broker tidak ada di DB → 404
  //    - broker ada tapi nomor HP kosong → 400 (bukan 404)
  let brokerRecord: { phone?: unknown } | null = null;
  try {
    brokerRecord = await pb.collection("brokers").getFirstListItem(
      `name = "${pbEsc(body.brokerName)}"`,
      { fields: "phone" }
    );
  } catch {
    return NextResponse.json({ error: `Broker "${body.brokerName}" tidak ditemukan di database` }, { status: 404 });
  }

  const brokerPhone = (brokerRecord?.phone as string | undefined) || "";
  const token       = process.env.FONNTE_TOKEN;

  if (!token) {
    await logAttempt(pb, { ...body, waStatus: "skipped", errorMessage: "FONNTE_TOKEN kosong" });
    return NextResponse.json({ success: false, reason: "FONNTE_TOKEN belum dikonfigurasi" }, { status: 400 });
  }
  if (!brokerPhone) {
    await logAttempt(pb, { ...body, waStatus: "skipped", errorMessage: "Nomor HP broker kosong" });
    return NextResponse.json({ success: false, reason: "Nomor HP broker belum diisi" }, { status: 400 });
  }

  // 2. Siapkan Data
  const normalizedPhone = brokerPhone.replace(/^0/, "62").replace(/\D/g, "");
  // todayWibStr() konsisten dengan zona aplikasi, tidak rapuh untuk deploy di zona lain.
  const tanggal = fmtDate(todayWibStr());
  const msgText = buildWaMessageBroker({ ...body, tanggal });

  // 3. Kirim Pesan via Fonnte
  try {
    // PERBAIKAN: Gunakan FormData (multipart/form-data) bukan URLSearchParams.
    // Fonnte sering "drop" pesan berformat markdown/teks panjang ketika dikirim
    // via application/x-www-form-urlencoded, dengan response HTTP 200 {status:true}
    // sehingga log nampak "terkirim" padahal WA tidak sampai. FormData terbukti
    // 100% diterima (lihat lib/send-reminders-core.ts).
    const buildBody = () => {
      const fd = new FormData();
      fd.append("target",      normalizedPhone);
      fd.append("message",     msgText);
      fd.append("countryCode", "62");
      return fd;
    };

    let res  = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body:   buildBody(),
    });
    let data = await res.json().catch(() => null);

    // PERBAIKAN: Auto-retry 1x setelah 5 detik jika Fonnte return
    // "disconnected device" — kasus umum saat device WA HP tempat akun Fonnte
    // terdaftar sedang restart / tidak online.
    if (data?.status === false) {
      const reason = (data.reason || data.detail || "").toLowerCase();
      if (reason.includes("disconnected") || reason.includes("not connected") || reason.includes("not registered")) {
        console.warn(`[notify-broker] Fonnte disconnected, retry dalam 5 detik untuk ${normalizedPhone}...`);
        await new Promise((r) => setTimeout(r, 5000));
        res  = await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: token },
          body:   buildBody(),
        });
        data = await res.json().catch(() => null);
      }
    }

    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);

    // Fonnte kadang return HTTP 200 dengan body { status: false, reason: ... }.
    // Tangani juga agar log tidak salah tandai "sent".
    if (data && data.status === false) {
      throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
    }

    await logAttempt(pb, { ...body, waStatus: "sent", errorMessage: "" });

    return NextResponse.json({ success: true, waStatus: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notify-broker] gagal kirim:", message);
    await logAttempt(pb, { ...body, waStatus: "failed", errorMessage: message });
    // Return generic message agar detail internal tidak bocor ke client.
    return NextResponse.json({ success: false, reason: "Gagal mengirim WhatsApp" }, { status: 500 });
  }
}
