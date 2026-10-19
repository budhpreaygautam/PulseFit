#!/usr/bin/env bash
# Installs an uploaded release and switches to it; rolls back if the new one does not start.
# deploy.ps1 runs it on the server:  sudo bash install-release.sh /tmp/pulsefit-release.tgz
set -euo pipefail

ARCHIVE="${1:?Usage: install-release.sh <release.tgz>}"
APP_DIR=/opt/pulsefit
KEEP=3
STAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="$APP_DIR/releases/$STAMP"

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

echo "==> Unpacking release $STAMP"
install -d -m 0755 "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"
# A release never carries secrets: settings come from /etc/pulsefit/pulsefit.env.
rm -f "$RELEASE/server/.env"

echo "==> Installing production dependencies"
(cd "$RELEASE/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chown -R root:root "$RELEASE"
chmod -R go-w "$RELEASE"

# Keep the service definition and backup script in step with the release.
install -m 0644 "$RELEASE/deploy/pulsefit.service" /etc/systemd/system/pulsefit.service
install -m 0755 "$RELEASE/deploy/backup.sh" /usr/local/sbin/pulsefit-backup
install -m 0755 "$RELEASE/deploy/create-admin.sh" /usr/local/sbin/pulsefit-create-admin
systemctl daemon-reload

PREVIOUS="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
# Back up the database before the new version touches it.
/usr/local/sbin/pulsefit-backup || true

echo "==> Switching to the new release"
ln -sfn "$RELEASE" "$APP_DIR/current.new"
mv -T "$APP_DIR/current.new" "$APP_DIR/current"
systemctl restart pulsefit

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5004/api/health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

if healthy; then
  echo "==> Release $STAMP is live"
else
  echo "!! The new release did not answer /api/health; recent log:" >&2
  journalctl -u pulsefit -n 40 --no-pager >&2 || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    echo "!! Rolling back to $(basename "$PREVIOUS")" >&2
    ln -sfn "$PREVIOUS" "$APP_DIR/current.new"
    mv -T "$APP_DIR/current.new" "$APP_DIR/current"
    systemctl restart pulsefit
  fi
  exit 1
fi

# Keep the newest few releases for a quick manual rollback.
ls -1dt "$APP_DIR"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
