# Scripts

Direktori ini berisi script operasional untuk deployment & maintenance Project Kentang di VPS.

## 📁 Daftar Script

### `backup-pocketbase.sh`
Backup harian PocketBase ke `/var/backups/pocketbase/` dengan rotasi otomatis.

**Install:**
```bash
# Copy ke lokasi terstandar
sudo cp scripts/backup-pocketbase.sh /opt/scripts/
sudo chmod +x /opt/scripts/backup-pocketbase.sh

# Jalankan harian jam 03:00 WIB (20:00 UTC)
echo "0 3 * * * root /opt/scripts/backup-pocketbase.sh >> /var/log/pb-backup.log 2>&1" | sudo crontab -
```

**Konfigurasi (via env):**
- `PROJECT_DIR` (default: `/var/www/minbun-erp`) — direktori Next.js project
- `BACKUP_DIR` (default: `/var/backups/pocketbase`) — direktori tujuan backup
- `RETENTION_DAYS` (default: `30`) — berapa hari backup disimpan
- `PB_SERVICE` (default: `pocketbase`) — nama systemd service

**Test manual:**
```bash
bash scripts/backup-pocketbase.sh
ls -lh /var/backups/pocketbase/
```

**Off-site backup (opsional):**
Uncomment blok `rclone` di akhir script. Install rclone dulu:
```bash
curl https://rclone.org/install.sh | sudo bash
rclone config  # setup Google Drive / S3 / Backblaze B2 / dll
```

### `restore-pocketbase.sh`
Restore PocketBase dari backup archive. **AKAN MENIMPA data yang sedang berjalan** — script membuat safety backup otomatis sebelum overwrite.

**Cara pakai:**
```bash
# Interaktif — akan menampilkan daftar backup
sudo bash scripts/restore-pocketbase.sh

# Non-interaktif — langsung restore file tertentu
sudo bash scripts/restore-pocketbase.sh /var/backups/pocketbase/pb-20260101-030000.tar.gz
```

**Workflow standar saat disaster recovery:**
1. Stop semua akses user (opsional, mis. dengan `pm2 stop minbun-erp`)
2. Jalankan restore script dengan backup terbaru yang valid
3. Verify data dengan login ke PocketBase admin UI
4. Start ulang Next.js (`pm2 restart minbun-erp`)
5. Smoke test: `curl http://localhost:3000/api/health`

## 🔗 Referensi

- **Setup systemd service untuk PocketBase**: lihat `/lib/systemd/system/pocketbase.service.example` (TODO: buat template)
- **CI/CD deployment**: lihat `.github/workflows/main.yml` — sudah panggil `/api/health` sebagai smoke test setelah deploy
- **Health check endpoint**: lihat `app/api/health/route.ts`

## 📋 Checklist Setup Awal VPS

- [ ] Install PocketBase binary ke `/var/www/minbun-erp/`
- [ ] Setup systemd service untuk PocketBase
- [ ] Setup systemd service untuk Next.js (PM2 atau native)
- [ ] Copy script backup ke `/opt/scripts/`
- [ ] Daftarkan cron job backup harian
- [ ] Setup reverse-proxy (Nginx/Caddy) untuk HTTPS termination
- [ ] Setup monitoring (UptimeRobot / BetterStack) ke `/api/health`
- [ ] Setup alert (Telegram/Discord webhook) untuk notifikasi outage
- [ ] Test restore procedure di staging (JANGAN test di production pertama kali!)
