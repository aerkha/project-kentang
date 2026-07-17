import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

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
  "Juli","Agustus","September","Oktober","November","Desember",
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

  // 1. Cari Data Broker di Database untuk mendapatkan nomor HP
  let brokerPhone = "";
  try {
    const brokerRecord = await pb.collection("brokers").getFirstListItem(
      `name = "${pbEsc(body.brokerName)}"`,
      { fields: "phone" }
    );
    brokerPhone = (brokerRecord.phone as string) || "";
  } catch {
    return NextResponse.json({ error: `Broker "${body.brokerName}" tidak ditemukan di database` }, { status: 404 });
  }

  const token = process.env.FONNTE_TOKEN;
  if (!token || !brokerPhone) {
    return NextResponse.json({ success: false, reason: "No token or phone" }, { status: 400 });
  }

  // 2. Siapkan Data
  const normalizedPhone = brokerPhone.replace(/^0/, "62").replace(/\D/g, "");
  const tanggal = fmtDate(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
  const msgText = buildWaMessageBroker({ ...body, tanggal });

  // 3. Kirim Pesan via Fonnte
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body: new URLSearchParams({
        target:      normalizedPhone,
        message:     msgText,
        countryCode: "62",
      }),
    });
    
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
    
    // 4. Catat ke log reminder
    await pb.collection("reminder_logs").create({
      mouCustomId:  body.noPks,
      cycleNumber:  0,
      sentAt:       new Date().toISOString(),
      investorName: `Broker: ${body.brokerName}`,
      emailStatus:  "skipped",
      waStatus:     "sent",
      errorMessage: "",
      triggeredBy:  "notifikasi",
      keterangan:   "Pencairan Fee Broker",
      jumlah:       body.jumlah,
    }).catch(() => {});

    return NextResponse.json({ success: true, waStatus: "sent" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}