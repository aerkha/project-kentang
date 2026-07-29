#!/usr/bin/env bash
# ============================================================
# backup-pocketbase.sh
# Backup harian PocketBase data + restore-ready archive.
#
# Strategi:
#   1. Hentikan PocketBase sebentar (~2 detik) untuk konsistensi SQLite.
#      PocketBase hanya support concurrent read dengan WAL mode, tapi
#      berhenti sejenak menjamin zero-corruption backup. Untuk data
#      > 100MB, durasi stop bisa sedikit lebih lama — monitor.
#   2. Tar+gz seluruh direktori pb_data.
#   3. Simpan ke /var/backups/pocketbase dengan timestamp.
#   4. Hapus backup > 30 hari (retention).
#   5. Upload ke remote storage (opsional, uncomment jika pakai rclone).
#
# Cron installation (jalankan sebagai root):
#   cp scripts/backup-pocketbase.sh /opt/scripts/
#   chmod +x /opt/scripts/backup-pocketbase.sh
#   echo "0 3 * * * root /opt/scripts/backup-pocketbase.sh" >> /etc/crontab
#   # Atau dengan sudo:
#   echo "0 3 * * * /opt/scripts/backup-pocketbase.sh" | sudo crontab -
#
# Verifikasi manual:
#   bash scripts/backup-pocketbase.sh
#   ls -lh /var/backups/pocketbase/
# ============================================================

set -euo pipefail

# ── Konfigurasi (override via env jika perlu) ──────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/var/www/minbun-erp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pocketbase}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PB_SERVICE="${PB_SERVICE:-pocketbase}"  # nama systemd service
DATE="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/pb-${DATE}.tar.gz"
LOG_PREFIX="[backup-pocketbase]"

# ── Pre-flight checks ─────────────────────────────────────────────────────
if [[ ! -d "${PROJECT_DIR}/pb_data" ]]; then
  echo "${LOG_PREFIX} ❌ pb_data tidak ditemukan di ${PROJECT_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# ── Logging helper ────────────────────────────────────────────────────────
log() { echo "${LOG_PREFIX} $(date '+%F %T') $*"; }

# ── 1. Stop PocketBase untuk konsistensi SQLite ───────────────────────────
# Tunggu shutdown selesai agar file tidak corrupt.
if systemctl list-unit-files "${PB_SERVICE}.service" >/dev/null 2>&1; then
  log "Menghentikan service ${PB_SERVICE}..."
  systemctl stop "${PB_SERVICE}" || true
  # Beri jeda 2 detik untuk flush WAL & release file locks.
  sleep 2
else
  log "ℹ️  Service ${PB_SERVICE} tidak ditemukan — lanjut tanpa stop (mungkin dijalankan manual via ./pocketbase serve)"
  # Best-effort: cari PID pocketbase binary dan stop manual.
  pkill -f "pocketbase serve" || true
  sleep 1
fi

# ── 2. Buat archive ───────────────────────────────────────────────────────
log "Membuat archive ${BACKUP_FILE}..."
START_TAR=$(date +%s)

if tar -czf "${BACKUP_FILE}" -C "${PROJECT_DIR}" pb_data/; then
  END_TAR=$(date +%s)
  SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  log "✅ Archive selesai (${SIZE}, $((END_TAR - START_TAR))s)"
else
  log "❌ Gagal membuat archive" >&2
  # Hidupkan lagi PB sebelum exit agar tidak stuck offline.
  systemctl start "${PB_SERVICE}" 2>/dev/null || true
  exit 1
fi

# ── 3. Hidupkan kembali PocketBase ────────────────────────────────────────
log "Menyalakan kembali service ${PB_SERVICE}..."
systemctl start "${PB_SERVICE}" 2>/dev/null || {
  log "⚠️  Gagal menyalakan ${PB_SERVICE} via systemctl — coba manual"
  log "    Jalankan: cd ${PROJECT_DIR} && ./pocketbase serve --http=0.0.0.0:8090 &"
}

# ── 4. Retensi: hapus backup > N hari ────────────────────────────────────
DELETED=$(find "${BACKUP_DIR}" -name "pb-*.tar.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [[ "${DELETED}" -gt 0 ]]; then
  log "Membersihkan ${DELETED} backup lama (>${RETENTION_DAYS} hari)"
fi

# ── 5. Validasi archive (sanity check) ────────────────────────────────────
# tar -tzf akan gagal jika file corrupt.
if tar -tzf "${BACKUP_FILE}" >/dev/null 2>&1; then
  log "✅ Validasi archive OK"
else
  log "❌ Archive CORRUPT — investigate immediately!" >&2
  exit 1
fi

# ── 6. (Opsional) Upload ke off-site storage ──────────────────────────────
# Uncomment salah satu di bawah ini. Install rclone dulu:
#   curl https://rclone.org/install.sh | sudo bash
#   rclone config  # setup remote

# if command -v rclone >/dev/null 2>&1; then
#   REMOTE="${RCLONE_REMOTE:-gdrive:pocketbase-backup}"
#   log "Upload ke ${REMOTE}..."
#   rclone copy "${BACKUP_FILE}" "${REMOTE}/" --progress
#   log "✅ Upload selesai"
# else
#   log "ℹ️  rclone tidak terinstall — backup hanya lokal di ${BACKUP_DIR}"
# fi

# ── 7. Tampilkan ringkasan ────────────────────────────────────────────────
TOTAL_BACKUPS=$(ls -1 "${BACKUP_DIR}"/pb-*.tar.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
log "📊 Total backup: ${TOTAL_BACKUPS} file, ${TOTAL_SIZE} di ${BACKUP_DIR}"
log "Done."
