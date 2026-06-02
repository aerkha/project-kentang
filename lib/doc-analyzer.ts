/**
 * doc-analyzer.ts
 * Analisis dokumen PKS (PDF / gambar) secara lokal menggunakan Canvas API
 * untuk mendeteksi tanda tangan dan materai.
 *
 * Strategi deteksi:
 *
 * TANDA TANGAN
 *   Perbedaan utama area bertanda tangan vs kosong:
 *   - Area kosong: hanya ada garis horizontal tipis + teks label (pola sangat teratur)
 *   - Area bertanda tangan: coretan tinta tidak beraturan, kepadatan piksel tidak merata
 *   → Kita ukur "ketidakberaturan" (variance antar-baris) di zona bawah dokumen.
 *     Tanda tangan = variance tinggi; teks cetak = variance rendah; kosong = sangat rendah.
 *
 * MATERAI
 *   Materai Peruri (fisik): kotak ~3×3 cm warna merah/oranye di scan berwarna,
 *   atau area abu-abu lebih padat di scan hitam-putih.
 *   → Cari cluster piksel merah/oranye (scan berwarna)
 *   → Atau cari area berdensitas sedang-tinggi yang bukan teks (scan B&W)
 */

export interface DocAnalysisResult {
  hasSignature: boolean;
  hasStamp:     boolean;
  confidence:   "high" | "medium" | "low";
  message:      string;
  pageAnalyzed?: number;
}

// ─── Konstanta ─────────────────────────────────────────────────

/** Piksel dengan brightness di bawah ini dianggap tinta/gelap */
const INK_THRESHOLD = 160;

/** Minimum variance baris untuk dianggap ada tanda tangan (0–255²) */
const SIG_VARIANCE_MIN = 180;

/** Minimum jumlah sel bertanda tangan */
const SIG_CELLS_MIN = 2;

/** Minimum piksel merah/oranye agar materai terdeteksi */
const STAMP_RED_MIN = 80;

/** Minimum piksel biru per halaman (stempel dinas) */
const STAMP_BLUE_MIN = 120;

// ─── Helper: load gambar ───────────────────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal load gambar")); };
    img.src = url;
  });
}

/** Render gambar ke canvas dengan resize maks 1400px */
function imageToCtx(img: HTMLImageElement): CanvasRenderingContext2D {
  const MAX = 1400;
  let w = img.naturalWidth  || img.width;
  let h = img.naturalHeight || img.height;
  if (w > MAX || h > MAX) {
    const r = Math.min(MAX / w, MAX / h);
    w = Math.round(w * r); h = Math.round(h * r);
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx;
}

// ─── Helper: render halaman PDF ─────────────────────────────────

async function pdfPageToCtx(file: File, pageNum: number): Promise<CanvasRenderingContext2D> {
  const pdfjs = await import("pdfjs-dist");

  // Worker di-serve dari /public agar tidak bergantung pada bundler
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const buf  = await file.arrayBuffer();
  const pdf  = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(pageNum);

  // Scale 2× untuk resolusi analisis yang lebih baik
  const vp  = page.getViewport({ scale: 2 });
  const c   = document.createElement("canvas");
  c.width   = vp.width;
  c.height  = vp.height;
  const ctx = c.getContext("2d")!;
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  return ctx;
}

// ─── Deteksi TANDA TANGAN ──────────────────────────────────────
//
// Metode: ukur variance kepadatan tinta antar-baris di zona bawah.
//
// Zona bawah dibagi menjadi kolom-kolom vertikal.
// Dalam setiap kolom, hitung kepadatan tinta tiap baris piksel.
// Variance kepadatan baris = ukuran ketidakberaturan = indikator tanda tangan.
//
// Intuisi:
//   Teks cetak → garis-garis tinta horizontal yang teratur → variance rendah
//   Tanda tangan → coretan melengkung acak → variance tinggi
//   Kosong → hampir tidak ada tinta → variance sangat rendah

function rowDensities(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number[] {
  const data = ctx.getImageData(x, y, w, h).data;
  const densities: number[] = [];
  for (let row = 0; row < h; row++) {
    let inkPx = 0;
    for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < INK_THRESHOLD) inkPx++;
    }
    densities.push(inkPx / w);
  }
  return densities;
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

function detectSignature(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Zona tanda tangan: bawah 45%
  const zoneY = Math.round(h * 0.55);
  const zoneH = h - zoneY;

  // Bagi zona menjadi 4 kolom, 3 baris sub-cell
  const cols    = 4;
  const rows    = 3;
  const cellW   = Math.round(w / cols);
  const cellH   = Math.round(zoneH / rows);
  let sigCells  = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellW;
      const cy = zoneY + row * cellH;
      const densities = rowDensities(ctx, cx, cy, cellW, cellH);
      const v = variance(densities);

      // Filter sel dengan sangat sedikit tinta (area kosong) — skip
      const avgDensity = densities.reduce((s, d) => s + d, 0) / densities.length;
      if (avgDensity < 0.005) continue;  // < 0.5% tinta → kosong, abaikan

      if (v > SIG_VARIANCE_MIN) sigCells++;
    }
  }

  return sigCells >= SIG_CELLS_MIN;
}

// ─── Deteksi MATERAI ───────────────────────────────────────────
//
// Strategi berlapis:
// 1. Scan berwarna: cari cluster piksel merah/oranye (materai Peruri)
//    atau biru/ungu (stempel dinas)
// 2. Scan B&W / grayscale: cari area persegi dengan kepadatan sedang-tinggi
//    yang bukan bagian dari blok teks (materai punya teks + pola dekoratif)

function detectStamp(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  let redCount  = 0;
  let blueCount = 0;

  // Buat grid 20×20 untuk mencari area padat non-teks
  const gridSize = 20;
  const cellW    = Math.round(w / gridSize);
  const cellH    = Math.round(h / gridSize);
  const densGrid: number[] = new Array(gridSize * gridSize).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 50) continue;

    const pixIdx = i / 4;
    const px = pixIdx % w;
    const py = Math.floor(pixIdx / w);
    const gx = Math.min(gridSize - 1, Math.floor(px / cellW));
    const gy = Math.min(gridSize - 1, Math.floor(py / cellH));
    densGrid[gy * gridSize + gx]++;

    // Oranye gelap / merah → materai Peruri (R dominan, B rendah)
    // Mencakup: merah (255,0,0), oranye gelap (~180,80,20), merah-oranye (~200,60,30)
    const isRedOrange =
      r > 130 &&              // saluran merah cukup kuat
      r > g * 1.4 &&          // merah jauh lebih dominan dari hijau
      b < 90  &&              // biru rendah (bukan pink/ungu)
      g < 150;                // hijau tidak terlalu tinggi (bukan kuning)
    if (isRedOrange) redCount++;

    // Biru/ungu → stempel dinas
    const isBlue   = b > 140 && r < 100 && g < 120;
    const isPurple = b > 100 && r > 80 && b > r && b > g && g < 100;
    if (isBlue || isPurple) blueCount++;
  }

  // Lulus jika ada warna materai/stempel
  if (redCount > STAMP_RED_MIN || blueCount > STAMP_BLUE_MIN) return true;

  // Fallback B&W: cari sel dengan kepadatan sedang (20–60%) yang bersebelahan
  // → pola materai atau stempel abu-abu
  const totalPixels = cellW * cellH;
  let denseCells = 0;
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const density = densGrid[gy * gridSize + gx] / totalPixels;
      // 15–70% = ada konten tapi bukan area serba hitam (judul/teks tebal)
      if (density > 0.15 && density < 0.70) denseCells++;
    }
  }

  // Cluster minimum 4 sel padat bersebelahan → kemungkinan stempel/materai
  let clusterMax = 0;
  for (let gy = 0; gy < gridSize - 1; gy++) {
    for (let gx = 0; gx < gridSize - 1; gx++) {
      const d  = densGrid[gy * gridSize + gx]       / totalPixels;
      const dr = densGrid[gy * gridSize + gx + 1]   / totalPixels;
      const dd = densGrid[(gy + 1) * gridSize + gx] / totalPixels;
      const dd2= densGrid[(gy + 1) * gridSize + gx + 1] / totalPixels;
      const cluster = [d, dr, dd, dd2].filter(v => v > 0.15 && v < 0.70).length;
      if (cluster > clusterMax) clusterMax = cluster;
    }
  }

  return clusterMax >= 4;
}

// ─── Fungsi utama ───────────────────────────────────────────────

export async function analyzeDocument(file: File): Promise<DocAnalysisResult> {
  const isPdf = file.type === "application/pdf";

  try {
    if (isPdf) {
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      const buf        = await file.arrayBuffer();
      const pdf        = await pdfjs.getDocument({ data: buf }).promise;
      const totalPages = pdf.numPages;

      // Cek halaman terakhir dan (jika ada) satu sebelum terakhir
      const pagesToCheck = totalPages > 1
        ? [totalPages, totalPages - 1]
        : [1];

      let hasSig   = false;
      let hasStamp = false;
      let analyzedPage = totalPages;

      for (const pg of pagesToCheck) {
        const ctx = await pdfPageToCtx(file, pg);
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        if (!hasSig   && detectSignature(ctx, w, h)) { hasSig   = true; analyzedPage = pg; }
        if (!hasStamp && detectStamp(ctx, w, h))     { hasStamp = true; }
        if (hasSig && hasStamp) break;
      }

      return buildResult(hasSig, hasStamp, analyzedPage);
    } else {
      const img = await loadImage(file);
      const ctx = imageToCtx(img);
      return buildResult(
        detectSignature(ctx, ctx.canvas.width, ctx.canvas.height),
        detectStamp(ctx, ctx.canvas.width, ctx.canvas.height),
      );
    }
  } catch (err) {
    console.error("[doc-analyzer]", err);
    return {
      hasSignature: false,
      hasStamp:     false,
      confidence:   "low",
      message:      "Gagal menganalisis file — pastikan PDF tidak terenkripsi/rusak.",
    };
  }
}

function buildResult(sig: boolean, stamp: boolean, page?: number): DocAnalysisResult {
  const confidence: DocAnalysisResult["confidence"] =
    sig && stamp ? "high" : !sig && !stamp ? "low" : "medium";

  let message: string;
  if (sig && stamp)    message = "Tanda tangan dan materai terdeteksi.";
  else if (!sig && !stamp) message = "Tanda tangan dan materai tidak terdeteksi. Periksa kembali dokumen.";
  else if (sig)        message = "Tanda tangan terdeteksi, namun materai tidak ditemukan.";
  else                 message = "Materai terdeteksi, namun tanda tangan tidak ditemukan.";

  return { hasSignature: sig, hasStamp: stamp, confidence, message, pageAnalyzed: page };
}
