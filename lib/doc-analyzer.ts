/**
 * doc-analyzer.ts
 * Analisis dokumen (gambar ATAU PDF) secara lokal menggunakan Canvas API
 * untuk mendeteksi keberadaan tanda tangan dan materai.
 *
 * Alur kerja:
 *  - File gambar  → render langsung ke <canvas>
 *  - File PDF     → render halaman terakhir via pdf.js ke <canvas>
 *  - Tanda tangan → cari kepadatan piksel gelap di zona bawah dokumen
 *  - Materai      → cari cluster piksel merah (materai Peruri) atau biru/ungu (stempel)
 */

export interface DocAnalysisResult {
  hasSignature: boolean;
  hasStamp:     boolean;
  confidence:   "high" | "medium" | "low";
  message:      string;
  /** Halaman yang dianalisis (untuk PDF) */
  pageAnalyzed?: number;
}

// ── Threshold ──────────────────────────────────────────────────
const DARK_THRESHOLD   = 120;   // 0–255; di bawah ini = piksel gelap (tinta)
const RED_R_MIN        = 140;
const RED_G_MAX        = 110;
const RED_B_MAX        = 110;
const BLUE_B_MIN       = 140;
const BLUE_R_MAX       = 110;
const BLUE_G_MAX       = 120;
const MIN_STAMP_PIXELS = 300;   // cluster piksel warna minimum
const SIG_CELL_DENSITY = 0.04;  // 4% piksel gelap per sel = ada tinta
const MIN_SIG_CELLS    = 2;     // minimal 2 sel bertinta = ada tanda tangan

// ── Helpers ────────────────────────────────────────────────────

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal memuat gambar")); };
    img.src = url;
  });
}

/** Buat canvas dari HTMLImageElement, dengan resize maks 1200px */
function imageToCanvas(img: HTMLImageElement): CanvasRenderingContext2D {
  const MAX = 1200;
  let w = img.naturalWidth  || img.width;
  let h = img.naturalHeight || img.height;
  if (w > MAX || h > MAX) {
    const r = Math.min(MAX / w, MAX / h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx;
}

/**
 * Render satu halaman PDF ke canvas menggunakan pdf.js.
 * pdf.js meng-encode halaman ke ImageData, sehingga hasilnya
 * bisa langsung kita analisis pikselnya.
 */
async function pdfPageToCanvas(
  file: File,
  pageNum: number,
): Promise<CanvasRenderingContext2D> {
  // Import dinamis agar tidak memperlambat initial bundle
  const pdfjs = await import("pdfjs-dist");

  // Arahkan worker ke file yang dibundel pdfjs
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page        = await pdf.getPage(pageNum);

  // Render pada scale 1.5 untuk resolusi yang cukup untuk analisis piksel
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas   = document.createElement("canvas");
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx      = canvas.getContext("2d")!;

  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas, viewport }).promise;
  return ctx;
}

// ── Deteksi tanda tangan ───────────────────────────────────────

function detectSignature(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Zona bawah 45% adalah area yang paling umum untuk tanda tangan
  const zoneTop    = Math.round(h * 0.55);
  const zoneHeight = h - zoneTop;
  const cols = 6;
  const rows = 4;
  const cellW = Math.round(w / cols);
  const cellH = Math.round(zoneHeight / rows);

  let sigCells = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x    = col * cellW;
      const y    = zoneTop + row * cellH;
      const data = ctx.getImageData(x, y, cellW, cellH).data;
      let darkCount = 0;
      const total   = cellW * cellH;

      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < DARK_THRESHOLD) darkCount++;
      }

      if (darkCount / total > SIG_CELL_DENSITY) sigCells++;
    }
  }

  return sigCells >= MIN_SIG_CELLS;
}

// ── Deteksi materai / stempel ──────────────────────────────────

function detectStamp(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  let redCount  = 0;
  let blueCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 50) continue;
    // Merah / oranye → materai Peruri
    if (r > RED_R_MIN && g < RED_G_MAX && b < RED_B_MAX) redCount++;
    // Biru → stempel dinas
    if (b > BLUE_B_MIN && r < BLUE_R_MAX && g < BLUE_G_MAX) blueCount++;
  }

  return redCount > MIN_STAMP_PIXELS || blueCount > MIN_STAMP_PIXELS;
}

// ── Fungsi utama ───────────────────────────────────────────────

export async function analyzeDocument(file: File): Promise<DocAnalysisResult> {
  const isPdf = file.type === "application/pdf";

  try {
    let ctx: CanvasRenderingContext2D;
    let pageAnalyzed: number | undefined;

    if (isPdf) {
      // Untuk PDF: ambil halaman terakhir (biasanya di sanalah tanda tangan & materai)
      const pdfjs       = await import("pdfjs-dist");
      const arrayBuffer = await file.arrayBuffer();
      const pdf         = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages  = pdf.numPages;

      // Analisis halaman terakhir; jika dokumen panjang juga cek halaman sebelum terakhir
      const pagesToCheck = totalPages > 1
        ? [totalPages, totalPages - 1]
        : [1];

      let bestSig   = false;
      let bestStamp = false;
      pageAnalyzed  = totalPages;

      for (const pg of pagesToCheck) {
        ctx = await pdfPageToCanvas(file, pg);
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const sig   = detectSignature(ctx, w, h);
        const stamp = detectStamp(ctx, w, h);
        if (sig)   bestSig   = true;
        if (stamp) bestStamp = true;
        // Kalau keduanya sudah ketemu, tidak perlu lanjut
        if (bestSig && bestStamp) { pageAnalyzed = pg; break; }
      }

      return buildResult(bestSig, bestStamp, pageAnalyzed);
    } else {
      // Gambar
      const img = await loadImageFromFile(file);
      ctx = imageToCanvas(img);
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      return buildResult(detectSignature(ctx, w, h), detectStamp(ctx, w, h));
    }
  } catch (err) {
    console.error("[doc-analyzer] error:", err);
    return {
      hasSignature: false,
      hasStamp:     false,
      confidence:   "low",
      message:      "Gagal menganalisis file. Pastikan file tidak rusak atau password-protected.",
    };
  }
}

function buildResult(
  hasSignature: boolean,
  hasStamp: boolean,
  pageAnalyzed?: number,
): DocAnalysisResult {
  const both    = hasSignature && hasStamp;
  const neither = !hasSignature && !hasStamp;
  const confidence: DocAnalysisResult["confidence"] = both ? "high" : neither ? "medium" : "medium";

  let message = "";
  if (both)              message = "Tanda tangan dan materai terdeteksi.";
  else if (neither)      message = "Tanda tangan dan materai tidak terdeteksi. Pastikan dokumen sudah lengkap sebelum upload.";
  else if (hasSignature) message = "Tanda tangan terdeteksi, namun materai tidak ditemukan.";
  else                   message = "Materai terdeteksi, namun tanda tangan tidak ditemukan.";

  return { hasSignature, hasStamp, confidence, message, pageAnalyzed };
}
