"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useMou, getMouStatus, type MoU, BUKTI_FIELD } from "@/lib/mou-context";
import { todayWibStr } from "@/lib/utils";
import { useTransaksi, calcTransaksi, type Transaksi, type TransaksiStatus } from "@/lib/transaksi-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { usePengeluaran } from "@/lib/cashflow-context";
import { useSettings } from "@/lib/settings-context";
import { useReminderLogs, type ReminderLog } from "@/lib/reminder-logs-context";
import pb from "@/lib/pocketbase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bell,
  CheckCircle2,
  Circle,
  Users,
  TrendingUp,
  Wallet,
  Briefcase,
  Settings2,
  Save,
  ChevronDown,
  ChevronUp,
  Upload,
  FileCheck,
  ExternalLink,
  Send,
  RefreshCw,
  Mail,
  MessageCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string) {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}Rb`;
  return n.toFixed(0);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Selisih hari antara sebuah tanggal dengan hari ini (kalender WIB) */
function daysUntil(dateStr: string): number {
  const [y, m, d]    = dateStr.split("-").map(Number);
  const [ty, tm, td] = todayWibStr().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

// ── Kalkulasi bagi hasil per PKS ─────────────────────────────────────────────

function calcBagiHasil(mou: MoU, transaksis: Transaksi[]) {
  const [sy, sm, sd] = mou.date.slice(0, 10).split("-").map(Number);
  const siklus   = mou.siklus ?? 1;
  const cycleMs  = mou.contractPeriod * 86_400_000;
  // Hanya hitung bagi hasil untuk siklus aktif saat ini [cycleStart, cycleEnd)
  const mouStart = Date.UTC(sy, sm - 1, sd) + (siklus - 1) * cycleMs;
  const mouEnd   = mouStart + cycleMs;
  const pkPct    = (mou.bagiHasilPK ?? 35) / 100;

  let investor = 0, trader = 0, minbun = 0, broker = 0;

  transaksis.forEach((t) => {
    const [ty, tm, td] = (t.date as string).slice(0, 10).split("-").map(Number);
    const tDate = Date.UTC(ty, tm - 1, td);
    // Batas akhir EKSKLUSIF [start, end): PKS perpanjangan mulai tepat di tanggal
    // akhir PKS lama, jadi transaksi di tanggal itu milik periode perpanjangan —
    // inklusif akan menghitung dobel di kedua periode.
    if (tDate < mouStart || tDate >= mouEnd) return;
    if (t.status !== "selesai" && t.status !== "bermasalah") return;

    const entry = t.investorEntries.find((e) => e.investorId === mou.investorId);
    if (!entry) return;

    const calc = calcTransaksi(t);
    if (calc.totalInvestasi === 0) return;

    const ratio  = entry.nilaiInvestasi / calc.totalInvestasi;
    const profit = calc.profit * ratio;

    const allZero   = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
    const hasBroker = !!entry.investorBrokerName;
    const pT  = allZero ? 10                   : entry.pctTrader;
    const pM  = allZero ? (hasBroker ? 0 : 5)  : entry.pctMinBun;
    const pBI = allZero ? (hasBroker ? 5 : 0)  : entry.pctBrokerI;
    const pBII= allZero ? 0                    : entry.pctBrokerII;

    investor += profit * pkPct;
    trader   += profit * pT    / 100;
    minbun   += profit * pM    / 100;
    broker   += profit * (pBI + pBII) / 100;
  });

  return { investor, trader, minbun, broker };
}

// ── Tipe baris tabel ─────────────────────────────────────────────────────────

type PaymentRow = {
  nama:          string;
  keterangan:    "Investor" | "Broker" | "Trader" | "MinBun";
  bankName:      string;
  accountNumber: string;
  jumlah:        number;
};

// ── Build payment rows (shared) ──────────────────────────────────────────────

type AccountInfo = { nama: string; bankName: string; accountNumber: string };

function buildRows(
  mou:       MoU,
  transaksis: Transaksi[],
  investors:  Investor[],
  brokers:    Broker[],
  minbunAcc:  AccountInfo,
  traderAcc:  AccountInfo,
): PaymentRow[] {
  const bh         = calcBagiHasil(mou, transaksis);
  const inv        = investors.find((i) => i.id === mou.investorId);
  // Prioritaskan brokerId dari PKS (sistem baru), fallback ke nama broker di investor (sistem lama)
  const brokerData = brokers.find((b) => b.id === mou.brokerId) ?? brokers.find((b) => b.name === inv?.brokerName);
  const brokerDisplayName = mou.brokerName || inv?.brokerName || brokerData?.name || "Broker";
  const rows: PaymentRow[] = [];

  if (bh.investor > 0)
    rows.push({ nama: mou.investorName, keterangan: "Investor",
      bankName: inv?.bankName || "—", accountNumber: inv?.accountNumber || "—", jumlah: bh.investor });
  if (bh.broker > 0)
    rows.push({ nama: brokerDisplayName, keterangan: "Broker",
      bankName: brokerData?.bankName || "—", accountNumber: brokerData?.accountNumber || "—", jumlah: bh.broker });
  if (bh.trader > 0)
    rows.push({ nama: traderAcc.nama || "Trader", keterangan: "Trader",
      bankName: traderAcc.bankName || "—", accountNumber: traderAcc.accountNumber || "—", jumlah: bh.trader });
  if (bh.minbun > 0)
    rows.push({ nama: minbunAcc.nama || "MinBun", keterangan: "MinBun",
      bankName: minbunAcc.bankName || "—", accountNumber: minbunAcc.accountNumber || "—", jumlah: bh.minbun });

  return rows;
}

// ── ChannelBadge ─────────────────────────────────────────────────────────────

function ChannelBadge({ status, icon }: { status: string; icon: React.ReactNode }) {
  const map: Record<string, string> = {
    sent:    "bg-green-100 text-green-700",
    failed:  "bg-red-100 text-red-700",
    skipped: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    sent: "Terkirim", failed: "Gagal", skipped: "Belum diset",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.skipped}`}>
      {icon}
      {label[status] ?? status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderContent() {
  const { mous, updateMou, uploadBuktiTransfer } = useMou();
  const { transaksis }                   = useTransaksi();
  const { investors }                    = useInvestors();
  const { brokers }                      = useBrokers();
  const { pengeluarans, addPengeluaran } = usePengeluaran();
  const { minbun, trader, updateMinbun, updateTrader } = useSettings();
  const { logs, isLoading: logsLoading, refresh: refreshLogs } = useReminderLogs();
  const [isSendingReminder,   setIsSendingReminder]   = useState(false);
  const [toggling, setToggling]          = useState<string | null>(null);
  const [showDone, setShowDone]          = useState(false);
  const [showExpired, setShowExpired]    = useState(true);
  // Optimistic update: tandai selesai seketika tanpa menunggu context re-render dari PocketBase
  const [doneKeys, setDoneKeys]          = useState<Set<string>>(new Set());

  // Set investor ID yang bertanda Internal (MinBun sendiri — full cashflow)
  const internalInvestorIds = useMemo(
    () => new Set(investors.filter((inv) => inv.isInternal).map((inv) => inv.id)),
    [investors],
  );

  // ── State dialog bukti transfer ──
  type BuktiTarget = { mou: MoU; keterangan: string; row: PaymentRow } | null;
  const [buktiTarget,   setBuktiTarget]  = useState<BuktiTarget>(null);
  const [buktiFile,     setBuktiFile]    = useState<File | null>(null);
  const [buktiPreview,  setBuktiPreview] = useState<string | null>(null);
  const [isUploading,   setIsUploading]  = useState(false);

  // ── State dialog konfirmasi internal (tanpa upload bukti) ──
  type InternalTarget = { mou: MoU; keterangan: string; row: PaymentRow } | null;
  const [internalTarget,  setInternalTarget]  = useState<InternalTarget>(null);
  const [isConfirmingInt, setIsConfirmingInt] = useState(false);

  // ── State form pengaturan rekening internal ──
  const [showSettings, setShowSettings]  = useState(false);
  const [isSavingMB,   setIsSavingMB]   = useState(false);
  const [isSavingTR,   setIsSavingTR]   = useState(false);
  const [formMinbun,   setFormMinbun]   = useState({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  const [formTrader,   setFormTrader]   = useState({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });

  // Sync form jika context baru load dari PocketBase
  useEffect(() => {
    setFormMinbun({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  }, [minbun.nama, minbun.bankName, minbun.accountNumber]);
  useEffect(() => {
    setFormTrader({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });
  }, [trader.nama, trader.bankName, trader.accountNumber]);

  // PKS aktif — status dihitung getMouStatus (satu sumber kebenaran, kalender WIB).
  // PKS pending (belum ditandatangani, bukan backdate) tidak dimasukkan:
  // belum berjalan, belum ada kewajiban bagi hasil.
  const tasks = useMemo(() => {
    return mous
      .filter((m) => getMouStatus(m) === "complete")
      .map((mou) => {
        const endDateStr = mou.endDate || addDays(mou.date, mou.contractPeriod * (mou.siklus ?? 1));
        const rows       = buildRows(mou, transaksis, investors, brokers, minbun, trader);
        const bh         = calcBagiHasil(mou, transaksis);
        return { mou, endDateStr, bh, rows };
      })
      .sort((a, b) => a.endDateStr.localeCompare(b.endDateStr));
  }, [mous, transaksis, investors, brokers, minbun, trader]);

  // PKS complete yang masih ada tugas bagi hasil belum selesai
  const expiredPendingTasks = useMemo(() => {
    return mous
      .filter((m) => {
        if (getMouStatus(m) !== "complete") return false;
        const rows = buildRows(m, transaksis, investors, brokers, minbun, trader);
        return rows.some((r) => !m.bagiHasilChecks?.[r.keterangan]);
      })
      .map((mou) => {
        const endDateStr = mou.endDate || addDays(mou.date, mou.contractPeriod * (mou.siklus ?? 1));
        const rows       = buildRows(mou, transaksis, investors, brokers, minbun, trader);
        const bh         = calcBagiHasil(mou, transaksis);
        return { mou, endDateStr, bh, rows };
      })
      .sort((a, b) => a.endDateStr.localeCompare(b.endDateStr));
  }, [mous, transaksis, investors, brokers, minbun, trader]);

  // ── Ringkasan — jumlah per penerima yang BELUM dicentang (per baris, bukan per PKS)
  // Mencakup PKS aktif DAN PKS expired yang masih punya tunggakan, agar kartu
  // ringkasan & header tidak menampilkan "selesai" selagi masih ada tunggakan.
  // activeTotal/activeDone dihitung terpisah untuk badge tab tabel PKS aktif.
  const summary = useMemo(() => {
    let investor = 0, trader = 0, minbun = 0, broker = 0;
    let totalTasks = 0, doneTasks = 0, activeTotal = 0, activeDone = 0;

    const tally = (t: { mou: MoU; rows: PaymentRow[] }, isActive: boolean) => {
      t.rows.forEach((r) => {
        const checked = !!t.mou.bagiHasilChecks?.[r.keterangan];
        totalTasks++;
        if (isActive) activeTotal++;
        if (checked) {
          doneTasks++;
          if (isActive) activeDone++;
          return;
        }
        if (r.keterangan === "Investor") investor += r.jumlah;
        else if (r.keterangan === "Trader") trader  += r.jumlah;
        else if (r.keterangan === "MinBun") minbun  += r.jumlah;
        else if (r.keterangan === "Broker") broker  += r.jumlah;
      });
    };
    tasks.forEach((t) => tally(t, true));
    expiredPendingTasks.forEach((t) => tally(t, false));

    return { investor, trader, minbun, broker, totalTasks, doneTasks, activeTotal, activeDone };
  }, [tasks, expiredPendingTasks]);

  // Klik ceklis: jika akan dicentang → buka dialog upload bukti dulu
  //              jika investor internal + keterangan "Investor" → dialog konfirmasi internal
  //              jika keterangan "MinBun" → dialog konfirmasi internal (tanpa bukti transfer)
  //              jika akan di-uncheck → langsung proses
  const handleToggleRow = (mou: MoU, keterangan: string, row: PaymentRow) => {
    const isChecked = !!mou.bagiHasilChecks?.[keterangan];
    if (!isChecked) {
      // Cek isMinBun langsung dari investors array (bukan hanya dari Set cache)
      // agar tidak salah jalur jika investors belum selesai di-load saat klik
      // Semua baris wajib upload bukti transfer
      setBuktiTarget({ mou, keterangan, row });
      setBuktiFile(null);
      setBuktiPreview(null);
    } else {
      // Un-check langsung
      void handleUncheck(mou, keterangan);
    }
  };

  const handleUncheck = async (mou: MoU, keterangan: string) => {
    const key    = `${mou.id}__${keterangan}`;
    const checks = { ...(mou.bagiHasilChecks ?? {}), [keterangan]: false };
    const task   = [...tasks, ...expiredPendingTasks].find((t) => t.mou.id === mou.id);
    const allDone = task ? task.rows.every((r) => checks[r.keterangan]) : false;
    setToggling(key);
    try {
      await updateMou(mou.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
      toast.info(`${keterangan} ditandai belum dibayar. Entri Cash Flow tidak dihapus otomatis.`);
    } catch {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  // Cek apakah entri Arus Kas dengan tag tertentu sudah pernah dicatat.
  // Mencegah entri ganda saat ceklis di-uncheck lalu dicentang ulang —
  // uncheck sengaja tidak menghapus entri kas, jadi pencatatan ulang harus skip.
  const cashflowTagRecorded = (tag: string) =>
    pengeluarans.some((p) => p.catatan === tag);

  // Submit dialog internal: mark check → catat ke cashflow (tanpa upload bukti)
  // Berlaku untuk: investor internal (profit internal) dan MinBun (biaya operasional internal)
  const handleConfirmInternal = async () => {
    if (!internalTarget) return;
    const { mou: snapshotMou, keterangan, row } = internalTarget;
    const key = `${snapshotMou.id}__${keterangan}`;

    // Ambil state mou terbaru agar tidak menimpa ceklis lain yang sudah di-set
    // saat dialog ini dibuka (stale closure bug)
    const allTask   = [...tasks, ...expiredPendingTasks].find((t) => t.mou.id === snapshotMou.id);
    const latestMou = allTask?.mou ?? snapshotMou;

    // Guard duplikasi: sudah diceklis sebelumnya, jangan catat cashflow lagi
    if (latestMou.bagiHasilChecks?.[keterangan] || doneKeys.has(key)) {
      setInternalTarget(null);
      return;
    }

    const checks  = { ...(latestMou.bagiHasilChecks ?? {}), [keterangan]: true };
    const allDone = allTask ? allTask.rows.every((r) => checks[r.keterangan]) : false;
    const today   = todayWibStr();

    setIsConfirmingInt(true);
    setToggling(key);
    try {
      await updateMou(snapshotMou.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => new Set(prev).add(key));

      const isMinBun = keterangan === "MinBun";
      const tag = isMinBun
        ? `[Reminder] PKS ${snapshotMou.id} · MinBun`
        : `[Internal-Profit:${snapshotMou.investorId}:${snapshotMou.id}]`;

      if (cashflowTagRecorded(tag)) {
        // Sudah pernah dicatat (mis. ceklis pernah dibuka lalu dicentang ulang)
        toast.info("Entri Arus Kas untuk tugas ini sudah ada — tidak dicatat ulang.");
      } else if (isMinBun) {
        // MinBun adalah penerima internal — catat sebagai debet (pemasukan internal)
        await addPengeluaran({
          date:      today,
          deskripsi: `Bagi Hasil MinBun — PKS ${snapshotMou.id}`,
          debet:     row.jumlah,
          kredit:    0,
          kategori:  "Fee MinBun",
          catatan:   tag,
        });
        toast.success(`Bagi hasil MinBun PKS ${snapshotMou.id} dicatat di Arus Kas`);
      } else {
        // Investor internal — catat profit sebagai debet (pemasukan internal)
        await addPengeluaran({
          date:      today,
          deskripsi: `Profit Internal — ${row.nama} — PKS ${snapshotMou.id}`,
          debet:     row.jumlah,
          kredit:    0,
          kategori:  "BagHas Modal MinBun",
          catatan:   tag,
        });
        toast.success(`Profit internal ${row.nama} dicatat di Arus Kas`);
      }

      setInternalTarget(null);
    } catch {
      toast.error("Gagal menyimpan. Coba lagi.");
    } finally {
      setIsConfirmingInt(false);
      setToggling(null);
    }
  };

  // Submit dialog: upload bukti → mark check → catat cashflow → notif investor
  const handleConfirmBukti = async () => {
    if (!buktiTarget || !buktiFile) return;
    const { mou: snapshotMou, keterangan, row } = buktiTarget;
    const key = `${snapshotMou.id}__${keterangan}`;

    // Ambil state mou terbaru agar tidak menimpa ceklis lain yang sudah di-set
    // saat dialog ini dibuka (stale closure bug)
    const allTask      = [...tasks, ...expiredPendingTasks].find((t) => t.mou.id === snapshotMou.id);
    const latestMou    = allTask?.mou ?? snapshotMou;
    const checks       = { ...(latestMou.bagiHasilChecks ?? {}), [keterangan]: true };
    const allDone      = allTask ? allTask.rows.every((r) => checks[r.keterangan]) : false;

    setIsUploading(true);
    setToggling(key);
    try {
      // 1. Upload bukti transfer — URL dikembalikan langsung dari context
      //    (tidak membaca state mous agar tidak kena stale closure)
      const buktiUrl = await uploadBuktiTransfer(snapshotMou.id, keterangan, buktiFile);

      // 2. Simpan status ceklis
      await updateMou(snapshotMou.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => new Set(prev).add(key));

      // 2b. Catat cashflow untuk MinBun dan investor internal
      const isMinBun          = keterangan === "MinBun";
      const isInternalInvestor = keterangan === "Investor" && internalInvestorIds.has(snapshotMou.investorId);
      if (isMinBun || isInternalInvestor) {
        const tag   = isMinBun
          ? `[Reminder] PKS ${snapshotMou.id} · MinBun`
          : `[Internal-Profit:${snapshotMou.investorId}:${snapshotMou.id}]`;
        const today = todayWibStr();
        if (cashflowTagRecorded(tag)) {
          toast.info("Entri Arus Kas sudah ada — tidak dicatat ulang.");
        } else if (isMinBun) {
          await addPengeluaran({
            date:      today,
            deskripsi: `Bagi Hasil MinBun — PKS ${snapshotMou.id}`,
            debet:     row.jumlah,
            kredit:    0,
            kategori:  "Fee MinBun",
            catatan:   tag,
          });
          toast.success(`Bagi hasil MinBun PKS ${snapshotMou.id} dicatat di Arus Kas`);
        } else {
          await addPengeluaran({
            date:      today,
            deskripsi: `Profit Internal — ${row.nama} — PKS ${snapshotMou.id}`,
            debet:     row.jumlah,
            kredit:    0,
            kategori:  "BagHas Modal MinBun",
            catatan:   tag,
          });
          toast.success(`Profit internal ${row.nama} dicatat di Arus Kas`);
        }
      }

      // 3. Kirim notifikasi ke investor (non-blocking — tidak gagalkan flow utama)
      const pbToken = pb.authStore.token;
      if (pbToken && keterangan === "Investor") {
        fetch("/api/notify-investor", {
          method:  "POST",
          headers: {
            "Authorization": `Bearer ${pbToken}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            mouCustomId:  snapshotMou.id,
            keterangan,
            investorId:   snapshotMou.investorId,
            jumlah:       row.jumlah,
            buktiUrl,
            siklus:       snapshotMou.siklus ?? 1,
          }),
        })
          .then((r) => r.json())
          .then((data: { waStatus?: string; emailStatus?: string }) => {
            const parts: string[] = [];
            if (data.waStatus    === "sent")    parts.push("💬 WA terkirim");
            if (data.waStatus    === "skipped") parts.push("💬 WA (belum diset)");
            if (data.emailStatus === "sent")    parts.push("✉️ Email terkirim");
            if (data.emailStatus === "skipped") parts.push("✉️ Email (belum diset)");
            if (parts.length) toast.info(`Notifikasi investor: ${parts.join(" · ")}`);
            void refreshLogs();
          })
          .catch(() => toast.warning("Notifikasi investor gagal dikirim. Cek konfigurasi API."));
      }

      setBuktiTarget(null);
    } catch {
      toast.error("Gagal mengupload bukti transfer. Coba lagi.");
    } finally {
      setIsUploading(false);
      setToggling(null);
    }
  };

  const handleBuktiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setBuktiFile(file);
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setBuktiPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setBuktiPreview(null);
    }
  };

  const handleSaveMinbun = async () => {
    setIsSavingMB(true);
    try {
      await updateMinbun(formMinbun);
      toast.success("Rekening MinBun berhasil disimpan");
    } catch {
      toast.error("Gagal menyimpan rekening MinBun");
    } finally {
      setIsSavingMB(false);
    }
  };

  const handleSaveTrader = async () => {
    setIsSavingTR(true);
    try {
      await updateTrader(formTrader);
      toast.success("Rekening Trader berhasil disimpan");
    } catch {
      toast.error("Gagal menyimpan rekening Trader");
    } finally {
      setIsSavingTR(false);
    }
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      // Kirim PocketBase token milik user yang login — CRON_SECRET tidak pernah ke browser
      const pbToken = pb.authStore.token;
      if (!pbToken) {
        toast.error("Sesi tidak ditemukan. Silakan login ulang.");
        return;
      }

      const res = await fetch("/api/trigger-reminder", {
        method: "POST",
        headers: { Authorization: `Bearer ${pbToken}` },
      });
      const data = await res.json() as {
        sent?: number; message?: string;
        adminEmailStatus?: string; investorEmailsSent?: number;
        waStatus?: string; errors?: string[]; error?: string; detail?: string;
      };

      if (!res.ok) {
        toast.error(`Gagal: ${data.error ?? "Unknown error"}${data.detail ? ` — ${data.detail}` : ""}`);
      } else if (data.sent === 0) {
        toast.info(data.message ?? "Tidak ada yang perlu dikirim");
      } else {
        const parts = [`${data.sent} reminder terkirim`];
        if (data.adminEmailStatus === "sent")    parts.push("✉️ Email admin OK");
        if (data.adminEmailStatus === "skipped") parts.push("✉️ Email admin (belum dikonfigurasi)");
        if (typeof data.investorEmailsSent === "number" && data.investorEmailsSent > 0)
          parts.push(`✉️ ${data.investorEmailsSent} email investor`);
        if (data.waStatus    === "sent")    parts.push("💬 WA OK");
        if (data.waStatus    === "skipped") parts.push("💬 WA (belum dikonfigurasi)");
        toast.success(parts.join(" · "));
        await refreshLogs();
      }

    } catch {
      toast.error("Gagal menghubungi server. Coba lagi.");
    } finally {
      setIsSendingReminder(false);
    }
  };

  const keteranganColor: Record<PaymentRow["keterangan"], string> = {
    Investor: "bg-orange-100 text-orange-700 border-orange-200",
    Broker:   "bg-blue-100 text-blue-700 border-blue-200",
    Trader:   "bg-purple-100 text-purple-700 border-purple-200",
    MinBun:   "bg-green-100 text-green-700 border-green-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Reminder Bagi Hasil
        </h1>
        <p className="text-muted-foreground">
          Pantau dan catat pelunasan bagi hasil per PKS ·{" "}
          <span className="font-medium">{summary.doneTasks}/{summary.totalTasks}</span> tugas selesai
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Investor</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatShort(summary.investor)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.investor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Trader</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShort(summary.trader)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.trader)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil MinBun</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatShort(summary.minbun)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.minbun)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Broker</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShort(summary.broker)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.broker)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Alert: PKS Expired dengan tugas belum selesai ── */}
      {expiredPendingTasks.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 overflow-hidden">
          {/* Header alert */}
          <button
            onClick={() => setShowExpired((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {expiredPendingTasks.reduce((s, t) =>
                    s + t.rows.filter((r) => !t.mou.bagiHasilChecks?.[r.keterangan]).length, 0
                  )} tugas belum selesai dari {expiredPendingTasks.length} PKS yang sudah expired
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                  PKS sudah berakhir tapi bagi hasil belum semua dibayarkan
                </p>
              </div>
            </div>
            <span className="text-xs text-red-600 font-medium ml-4 shrink-0">
              {showExpired ? "Sembunyikan ▲" : "Tampilkan ▼"}
            </span>
          </button>

          {/* Tabel expired tasks */}
          {showExpired && (
            <div className="border-t border-red-200 dark:border-red-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-100/60 dark:bg-red-900/20">
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Nama</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Keterangan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Nama Bank</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">No Rekening</th>
                    <th className="text-right  py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Jumlah</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">No PKS</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Expired</th>
                    <th className="text-center py-2.5 px-3 font-medium text-red-700 dark:text-red-400 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredPendingTasks.map((task) => {
                    const allRows     = task.rows;
                    const rowCount    = allRows.length;
                    const expiredDays = Math.abs(daysUntil(task.endDateStr));

                    const rowEls = allRows.map((pr, idx) => {
                      const rowKey    = `${task.mou.id}__${pr.keterangan}`;
                      const isLoading = toggling === rowKey;
                      const rowDone   = !!task.mou.bagiHasilChecks?.[pr.keterangan] || doneKeys.has(rowKey);

                      return (
                        <tr
                          key={rowKey}
                          className={`border-b border-red-200/60 dark:border-red-800/40 transition-colors ${rowDone ? "opacity-60" : "hover:bg-red-100/40 dark:hover:bg-red-900/20"} ${idx === 0 ? "border-t-2 border-t-red-300 dark:border-t-red-700" : ""}`}
                        >
                          <td className={`py-2.5 px-3 whitespace-nowrap font-medium ${rowDone ? "line-through text-muted-foreground" : ""}`}>{pr.nama}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keteranganColor[pr.keterangan]}`}>
                                {pr.keterangan}
                              </span>
                              {pr.keterangan === "Investor" && internalInvestorIds.has(task.mou.investorId) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                                  <ShieldCheck className="h-2.5 w-2.5" />Internal
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{pr.bankName}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{pr.accountNumber}</td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold">
                            {formatShort(pr.jumlah)}
                            <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(pr.jumlah)}</div>
                          </td>
                          {idx === 0 && (
                            <td className="py-2.5 px-3 font-mono text-xs font-bold text-foreground whitespace-nowrap align-top border-l-[3px] border-l-red-400" rowSpan={rowCount}>
                              {task.mou.id}
                            </td>
                          )}
                          {idx === 0 && (
                            <td className="py-2.5 px-3 whitespace-nowrap align-top" rowSpan={rowCount}>
                              <Badge variant="destructive" className="text-xs py-0.5">
                                Lewat {expiredDays} hari
                              </Badge>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(task.endDateStr)}</div>
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={isLoading || rowDone}
                                      onClick={() => !rowDone && handleToggleRow(task.mou, pr.keterangan, pr)}
                                    >
                                      {rowDone
                                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        : <Circle className="h-5 w-5 text-red-400" />
                                      }
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    {rowDone
                                      ? "Sudah selesai"
                                      : pr.keterangan === "MinBun"
                                        ? "Upload bukti & catat ke Arus Kas"
                                        : pr.keterangan === "Investor" && internalInvestorIds.has(task.mou.investorId)
                                          ? "Upload bukti & catat ke Arus Kas"
                                          : "Upload bukti & tandai selesai"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {(() => {
                                const buktiUrl = task.mou[BUKTI_FIELD[pr.keterangan] as keyof MoU] as string | undefined;
                                if (!buktiUrl) return null;
                                return (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a href={buktiUrl} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                        >
                                          <FileCheck className="h-4 w-4" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-xs">Lihat bukti transfer</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                    const total = allRows.reduce((sum, r) => sum + r.jumlah, 0);
                    return [
                      ...rowEls,
                      <tr key={`${task.mou.id}__total`} className="bg-red-50/60 dark:bg-red-950/20">
                        <td colSpan={4} className="py-1.5 px-3 text-right text-xs font-medium text-red-600 dark:text-red-400">Total</td>
                        <td className="py-1.5 px-3 text-right whitespace-nowrap font-bold text-sm text-red-700 dark:text-red-300">
                          {formatShort(total)}
                          <div className="text-[10px] font-normal text-red-500">{formatCurrency(total)}</div>
                        </td>
                        <td colSpan={3} className="border-b-2 border-red-200 dark:border-red-800" />
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Daftar Tugas Bagi Hasil</CardTitle>

            {/* Tab toggle */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
              <button
                onClick={() => setShowDone(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  !showDone
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pending
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  !showDone ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                }`}>
                  {summary.activeTotal - summary.activeDone}
                </span>
              </button>
              <button
                onClick={() => setShowDone(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  showDone
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Selesai
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  showDone ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                }`}>
                  {summary.activeDone}
                </span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm">Tidak ada PKS aktif</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nama</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nama Bank</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">No Rekening</th>
                    <th className="text-right  py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Jumlah</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">No PKS</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Deadline</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.flatMap((task) => {
                    const checks  = task.mou.bagiHasilChecks ?? {};
                    const isRowDone = (r: PaymentRow) => {
                      const k = `${task.mou.id}__${r.keterangan}`;
                      return !!checks[r.keterangan] || doneKeys.has(k);
                    };
                    // Tab Selesai: baris yang sudah done
                    // Tab Pending: baris yang belum done (sudah done = pindah ke Selesai)
                    const visibleRows = showDone
                      ? task.rows.filter(isRowDone)
                      : task.rows.filter((r) => !isRowDone(r));
                    if (visibleRows.length === 0) return [];

                    const days     = daysUntil(task.endDateStr);
                    const allDone  = task.rows.every((r) => checks[r.keterangan]);
                    const rowCount = visibleRows.length;

                    let dayLabel: React.ReactNode;
                    if (allDone) {
                      dayLabel = <span className="text-muted-foreground text-xs">Selesai</span>;
                    } else if (days < 0) {
                      dayLabel = <Badge variant="destructive" className="text-xs py-0.5">Lewat {Math.abs(days)} hari</Badge>;
                    } else if (days === 0) {
                      dayLabel = <Badge className="text-xs py-0.5 bg-red-500 hover:bg-red-500">Hari ini</Badge>;
                    } else if (days <= 7) {
                      dayLabel = <Badge className="text-xs py-0.5 bg-orange-500 hover:bg-orange-500">{days} hari lagi</Badge>;
                    } else if (days <= 30) {
                      dayLabel = <Badge variant="outline" className="text-xs py-0.5 text-yellow-600 border-yellow-400">{days} hari lagi</Badge>;
                    } else {
                      dayLabel = <span className="text-sm text-muted-foreground">{days} hari lagi</span>;
                    }

                    // Hitung transaksi dalam siklus ini yang belum final
                    const { siklus = 1, contractPeriod, date: mouDate, investorId: mouInvestorId } = task.mou;
                    const cycleMs   = contractPeriod * 86_400_000;
                    const [cmy, cmm, cmd] = mouDate.slice(0, 10).split("-").map(Number);
                    const cycleStart = Date.UTC(cmy, cmm - 1, cmd) + (siklus - 1) * cycleMs;
                    const cycleEnd   = cycleStart + cycleMs;
                    const unfinalizedCount = !showDone ? transaksis.filter((t) => {
                      if (t.status === "selesai" || t.status === "bermasalah") return false;
                      if (!t.investorEntries.some((e) => e.investorId === mouInvestorId)) return false;
                      const [ty, tm, td] = t.date.slice(0, 10).split("-").map(Number);
                      const tDate = Date.UTC(ty, tm - 1, td);
                      return tDate >= cycleStart && tDate < cycleEnd;
                    }).length : 0;

                    const warnRow = unfinalizedCount > 0 ? (
                      <tr key={`${task.mou.id}__warn`} className="border-t-2 border-t-border bg-yellow-50/60 dark:bg-yellow-950/20">
                        <td colSpan={8} className="py-1.5 px-3">
                          <div className="flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>{unfinalizedCount} transaksi dalam periode ini belum difinalisasi — bagi hasil yang ditampilkan belum final</span>
                          </div>
                        </td>
                      </tr>
                    ) : null;

                    const rowEls = visibleRows.map((pr, idx) => {
                      const rowKey    = `${task.mou.id}__${pr.keterangan}`;
                      const rowDone   = !!checks[pr.keterangan] || doneKeys.has(rowKey);
                      const isLoading = toggling === rowKey;
                      const rowClass  = "transition-colors hover:bg-muted/40";

                      return (
                        <tr
                          key={rowKey}
                          className={`border-b border-border/50 ${rowClass} ${idx === 0 && !warnRow ? "border-t-2 border-t-border" : ""}`}
                        >
                          {/* Nama */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={showDone ? "text-muted-foreground" : "font-medium"}>
                              {pr.nama}
                            </span>
                          </td>
                          {/* Keterangan */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keteranganColor[pr.keterangan]}`}>
                              {pr.keterangan}
                            </span>
                          </td>
                          {/* Nama Bank */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                            {pr.bankName}
                          </td>
                          {/* No Rekening */}
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {pr.accountNumber}
                          </td>
                          {/* Jumlah */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold">
                            {formatShort(pr.jumlah)}
                            <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(pr.jumlah)}</div>
                          </td>
                          {/* No PKS — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td
                              className="py-2.5 px-3 font-mono text-xs font-bold text-foreground whitespace-nowrap align-top border-l-[3px] border-l-border"
                              rowSpan={rowCount}
                            >
                              {task.mou.id}
                            </td>
                          )}
                          {/* Deadline — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td className="py-2.5 px-3 whitespace-nowrap align-top" rowSpan={rowCount}>
                              {dayLabel}
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(task.endDateStr)}</div>
                            </td>
                          )}
                          {/* Status — ceklis + indikator bukti */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={isLoading}
                                      onClick={() => handleToggleRow(task.mou, pr.keterangan, pr)}
                                    >
                                      {rowDone
                                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        : <Circle className="h-5 w-5 text-muted-foreground" />
                                      }
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    {rowDone
                                      ? "Tandai belum dibayar"
                                      : pr.keterangan === "MinBun"
                                        ? "Upload bukti & catat ke Arus Kas"
                                        : pr.keterangan === "Investor" && internalInvestorIds.has(task.mou.investorId)
                                          ? "Upload bukti & catat ke Arus Kas"
                                          : "Upload bukti & tandai selesai"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* Ikon bukti transfer jika sudah ada file */}
                              {(() => {
                                const buktiUrl = task.mou[BUKTI_FIELD[pr.keterangan] as keyof MoU] as string | undefined;
                                if (!buktiUrl) return null;
                                return (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a href={buktiUrl} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                                        >
                                          <FileCheck className="h-4 w-4" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-xs">
                                        Lihat bukti transfer
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                    const total = visibleRows.reduce((sum, r) => sum + r.jumlah, 0);
                    return [
                      ...(warnRow ? [warnRow] : []),
                      ...rowEls,
                      <tr key={`${task.mou.id}__total`} className="bg-muted/20">
                        <td colSpan={4} className="py-1.5 px-3 text-right text-xs font-medium text-muted-foreground">Total</td>
                        <td className="py-1.5 px-3 text-right whitespace-nowrap font-bold text-sm">
                          {formatShort(total)}
                          <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(total)}</div>
                        </td>
                        <td colSpan={3} className="border-b-2 border-border" />
                      </tr>,
                    ];
                  })}
                  {/* Empty state per tab */}
                  {tasks.every((task) =>
                    task.rows.every((r) =>
                      showDone
                        ? !task.mou.bagiHasilChecks?.[r.keterangan]
                        : !!task.mou.bagiHasilChecks?.[r.keterangan]
                    )
                  ) && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                        {showDone
                          ? "Belum ada tugas yang selesai"
                          : <span className="flex flex-col items-center gap-2">
                              <CheckCircle2 className="h-8 w-8 text-green-500" />
                              Semua tugas sudah selesai 🎉
                            </span>
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pengaturan Rekening Internal ── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Pengaturan Rekening Internal</CardTitle>
            </div>
            {showSettings
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>
          {!showSettings && (
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Kelola nama, bank, dan nomor rekening MinBun & Trader
            </p>
          )}
        </CardHeader>

        {showSettings && (
          <CardContent className="space-y-6">
            {/* MinBun */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">MinBun</span>
                Rekening MinBun
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama</Label>
                  <Input
                    value={formMinbun.nama}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="MinBun / nama perusahaan"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Bank</Label>
                  <Input
                    value={formMinbun.bankName}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="BCA / BRI / Mandiri..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor Rekening</Label>
                  <Input
                    value={formMinbun.accountNumber}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, accountNumber: e.target.value }))}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveMinbun} disabled={isSavingMB}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSavingMB ? "Menyimpan…" : "Simpan MinBun"}
                </Button>
              </div>
            </div>

            <div className="border-t" />

            {/* Trader */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200">Trader</span>
                Rekening Trader
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama</Label>
                  <Input
                    value={formTrader.nama}
                    onChange={(e) => setFormTrader((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="Trader / nama trader"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Bank</Label>
                  <Input
                    value={formTrader.bankName}
                    onChange={(e) => setFormTrader((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="BCA / BRI / Mandiri..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor Rekening</Label>
                  <Input
                    value={formTrader.accountNumber}
                    onChange={(e) => setFormTrader((f) => ({ ...f, accountNumber: e.target.value }))}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveTrader} disabled={isSavingTR}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSavingTR ? "Menyimpan…" : "Simpan Trader"}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Riwayat Reminder ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Riwayat Reminder
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Log pengiriman reminder jatuh tempo &amp; notifikasi bagi hasil via Email / WhatsApp
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshLogs()}
                disabled={logsLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${logsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSendReminder()}
                disabled={isSendingReminder}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {isSendingReminder ? "Mengirim…" : "Kirim Sekarang"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat…</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Belum ada riwayat pengiriman reminder
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Waktu Kirim</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Investor</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">No PKS</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Jenis</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Email</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">WhatsApp</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map((log: ReminderLog) => {
                    const isNotif = log.triggeredBy === "notifikasi";
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(log.sentAt).toLocaleString("id-ID", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2.5 px-4 font-medium whitespace-nowrap">{log.investorName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{log.mouCustomId}</td>
                        <td className="py-2.5 px-4 text-center">
                          {isNotif ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                              Bagi Hasil
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              log.triggeredBy === "manual"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {log.triggeredBy === "manual" ? "Manual" : "Otomatis"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <ChannelBadge status={log.emailStatus} icon={<Mail className="h-3 w-3" />} />
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <ChannelBadge status={log.waStatus} icon={<MessageCircle className="h-3 w-3" />} />
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {isNotif
                            ? `Siklus ke-${log.cycleNumber} · ${log.keterangan}${log.jumlah > 0 ? ` · ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(log.jumlah)}` : ""}`
                            : `Siklus ke-${log.cycleNumber}`
                          }
                          {log.errorMessage && (
                            <div className="text-red-500 text-[10px] mt-0.5 max-w-[200px] truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {logs.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Menampilkan 50 terbaru dari {logs.length} log
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Konfirmasi Internal (investor internal & MinBun) ── */}
      <Dialog open={!!internalTarget} onOpenChange={(open) => { if (!open) setInternalTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {internalTarget?.keterangan === "MinBun"
                ? "Konfirmasi Bagi Hasil MinBun"
                : "Catat Profit Internal ke Arus Kas"}
            </DialogTitle>
            <DialogDescription>
              {internalTarget?.keterangan === "MinBun"
                ? <>Bagi hasil MinBun untuk PKS <strong>{internalTarget.mou.id}</strong> akan dicatat sebagai pemasukan di Arus Kas. Tidak diperlukan bukti transfer.</>
                : <>Profit siklus PKS <strong>{internalTarget?.mou.id}</strong> untuk investor internal akan dicatat sebagai pemasukan (debet) di Arus Kas. Tidak diperlukan bukti transfer.</>
              }
            </DialogDescription>
          </DialogHeader>

          {internalTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {internalTarget.keterangan === "MinBun" ? "Penerima" : "Investor"}
                </span>
                <span className="font-medium">{internalTarget.row.nama}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">PKS</span>
                <span className="font-mono text-xs font-medium">{internalTarget.mou.id}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>{internalTarget.keterangan === "MinBun" ? "Bagi hasil dicatat" : "Profit dicatat"}</span>
                <span className="text-green-600">{formatCurrency(internalTarget.row.jumlah)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInternalTarget(null)} disabled={isConfirmingInt}>
              Batal
            </Button>
            <Button onClick={() => void handleConfirmInternal()} disabled={isConfirmingInt}>
              {isConfirmingInt ? "Menyimpan…" : "Konfirmasi & Catat ke Kas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Upload Bukti Transfer ── */}
      <Dialog open={!!buktiTarget} onOpenChange={(open) => { if (!open) { setBuktiTarget(null); setBuktiFile(null); setBuktiPreview(null); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Bukti Transfer
            </DialogTitle>
            <DialogDescription>
              Upload bukti transfer untuk{" "}
              <span className="font-semibold">{buktiTarget?.keterangan}</span>
              {" "}—{" "}
              <span className="font-semibold">{buktiTarget?.row.nama}</span>
              {" "}sebesar{" "}
              <span className="font-semibold">
                {buktiTarget ? formatCurrency(buktiTarget.row.jumlah) : ""}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">
                File Bukti Transfer <span className="text-destructive">*</span>
              </Label>
              <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors p-4 gap-2 ${
                buktiFile ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-border hover:border-primary/50 hover:bg-muted/40"
              }`}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleBuktiFileChange}
                />
                {buktiFile ? (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <FileCheck className="h-8 w-8 text-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">{buktiFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(buktiFile.size / 1024).toFixed(0)} KB · Klik untuk ganti
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Klik untuk pilih file</span>
                    <span className="text-xs text-muted-foreground">Gambar (JPG, PNG) atau PDF</span>
                  </div>
                )}
              </label>
            </div>

            {/* Preview gambar */}
            {buktiPreview && (
              <div className="rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={buktiPreview} alt="Preview bukti" className="w-full max-h-48 object-contain bg-muted" />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBuktiTarget(null)} disabled={isUploading}>
              Batal
            </Button>
            <Button onClick={handleConfirmBukti} disabled={!buktiFile || isUploading}>
              {isUploading ? (
                "Menyimpan…"
              ) : (
                <>
                  <FileCheck className="h-4 w-4 mr-1.5" />
                  Konfirmasi &amp; Tandai Selesai
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
