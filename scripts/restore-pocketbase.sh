#!/usr/bin/env bash
# ============================================================
# restore-pocketbase.sh
# Restore PocketBase data dari backup archive.
#
# PERINGATAN: script ini AKAN MENIMPA data PocketBase yang sedang
# berjalan. Gunakan hanya untuk:
#   - Disaster recovery (data corruption / hilang)
#   - Migrasi ke server baru
#   - Testing / staging
#
# Cara pakai:
#   bash scripts/restore-pocketbase.sh /var/backups/pocketbase/pb-20260101-030000.tar.gz
#
# Atau interaktif (akan menampilkan daftar backup yang tersedia):
#   bash scripts/restore-pocketbase.sh
# ============================================================

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/minbun-erp}"
PB_SERVICE="${PB_SERVICE:-pocketbase}"
LOG_PREFIX="[restore-pocketbase]"

log() { echo "${LOG_PREFIX} $(date '+%F %T') $*"; }

# ── Pilih backup file ────────────────────────────────────────────────────
BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  BACKUP_DIR="${BACKUP_DIR:-/var/backups/pocketbase}"
  if [[ ! -d "${BACKUP_DIR}" ]]; then
    log "❌ Direktori backup ${BACKUP_DIR} tidak ada" >&2
    exit 1
  fi

  echo ""
  echo "Backup yang tersedia di ${BACKUP_DIR}:"
  echo "────────────────────────────────────────"
  ls -lht "${BACKUP_DIR}"/pb-*.tar.gz 2>/dev/null | head -20 || echo "(kosong)"
  echo "────────────────────────────────────────"
  echo ""
  read -rp "Masukkan path backup file lengkap (atau Ctrl+C untuk batal): " BACKUP_FILE
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  log "❌ File backup tidak ditemukan: ${BACKUP_FILE}" >&2
  exit 1
fi

# ── Konfirmasi (safety) ──────────────────────────────────────────────────
log "⚠️  RESTORE AKAN MENIMPA DATA POCKETBASE YANG SEDANG BERJALAN!"
log "    Project dir : ${PROJECT_DIR}"
log "    Backup file : ${BACKUP_FILE}"
log "    Backup size : $(du -h "${BACKUP_FILE}" | cut -f1)"
log "    Backup date : $(stat -c '%y' "${BACKUP_FILE}" 2>/dev/null || stat -f '%Sm' "${BACKUP_FILE}")"
echo ""
read -rp "Ketik 'YES' (kapital) untuk melanjutkan: " CONFIRM
if [[ "${CONFIRM}" != "YES" ]]; then
  log "Dibatalkan oleh user"
  exit 0
fi

# ── 1. Stop PocketBase ───────────────────────────────────────────────────
if systemctl list-unit-files "${PB_SERVICE}.service" >/dev/null 2>&1; then
  log "Menghentikan service ${PB_SERVICE}..."
  systemctl stop "${PB_SERVICE}" || true
  sleep 2
else
  pkill -f "pocketbase serve" || true
  sleep 1
fi

# ── 2. Backup data saat ini (sebelum overwrite) ──────────────────────────
SAFETY_BACKUP="${BACKUP_FILE%.tar.gz}.pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
log "Membuat safety backup data saat ini: ${SAFETY_BACKUP}"
if [[ -d "${PROJECT_DIR}/pb_data" ]]; then
  tar -czf "${SAFETY_BACKUP}" -C "${PROJECT_DIR}" pb_data/ || log "⚠️  Gagal safety backup (lanjut restore)"
fi

# ── 3. Hapus pb_data lama, extract yang baru ────────────────────────────
log "Menghapus pb_data lama..."
rm -rf "${PROJECT_DIR}/pb_data"

log "Extract backup ke ${PROJECT_DIR}..."
tar -xzf "${BACKUP_FILE}" -C "${PROJECT_DIR}"

# ── 4. Set ownership (kalau perlu) ──────────────────────────────────────
# Sesuaikan user:group dengan yang menjalankan PM2/standalone.
APP_USER="${APP_USER:-www-data}"
if id "${APP_USER}" >/dev/null 2>&1; then
  chown -R "${APP_USER}:${APP_USER}" "${PROJECT_DIR}/pb_data"
fi

# ── 5. Nyalakan PocketBase ──────────────────────────────────────────────
log "Menyalakan kembali ${PB_SERVICE}..."
systemctl start "${PB_SERVICE}" 2>/dev/null || {
  log "⚠️  Gagal systemctl start. Coba manual:"
  log "    cd ${PROJECT_DIR} && ./pocketbase serve --http=0.0.0.0:8090 &"
}

# ── 6. Smoke test ────────────────────────────────────────────────────────
log "⏳ Menunggu 5 detik lalu cek /api/health..."
sleep 5
if curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/health 2>/dev/null | grep -q "^200$"; then
  log "✅ PocketBase kembali hidup (HTTP 200)"
else
  log "⚠️  PocketBase tidak merespons health check — periksa log:"
  log "    journalctl -u ${PB_SERVICE} -n 50 --no-pager"
fi

log "Done. Safety backup sebelum restore tersimpan di:"
log "  ${SAFETY_BACKUP}"
