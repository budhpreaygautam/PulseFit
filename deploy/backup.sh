#!/usr/bin/env bash
# Daily PulseFit database backup (installed as /usr/local/sbin/pulsefit-backup, run by cron).
# The API writes the database atomically (temporary file + rename), so a plain copy is consistent.
set -euo pipefail

SRC=/var/lib/pulsefit/gym-db.json
DEST=/var/lib/pulsefit/backups
KEEP_DAYS=14

[[ -f "$SRC" ]] || exit 0
umask 077
gzip -c "$SRC" > "$DEST/gym-db-$(date -u +%Y%m%d-%H%M%S).json.gz"
find "$DEST" -name 'gym-db-*.json.gz' -mtime +"$KEEP_DAYS" -delete
