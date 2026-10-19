#!/usr/bin/env bash
# One-time setup of an Ubuntu 22.04/24.04 server (x86-64 or ARM) for PulseFit. Run as root:
#   sudo bash server-setup.sh https://pulsefit.example.org
# Safe to run again: it never overwrites the settings file or the database.
#
# What it sets up:
# - Node.js 22 (NodeSource) and cloudflared (Cloudflare's apt repository)
# - a `pulsefit` system user; the app in /opt/pulsefit, the database in /var/lib/pulsefit
# - /etc/pulsefit/pulsefit.env with a fresh random JWT_SECRET (generated here, never printed;
#   root-only: systemd reads it before starting the app as `pulsefit`)
# - the pulsefit systemd service (listens on 127.0.0.1 only: Cloudflare Tunnel is the way in)
# - automatic security updates and a daily database backup (14 days kept)
set -euo pipefail

PUBLIC_URL="${1:-}"
if [[ ! "$PUBLIC_URL" =~ ^https://[a-z0-9.-]+$ ]]; then
  echo "Usage: sudo bash server-setup.sh https://your.domain   (https, no trailing slash)" >&2
  exit 1
fi
[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

NODE_MAJOR=22
APP_DIR=/opt/pulsefit
DATA_DIR=/var/lib/pulsefit
ENV_DIR=/etc/pulsefit
ENV_FILE=$ENV_DIR/pulsefit.env
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "==> System packages and automatic security updates"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg openssl unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Node.js $NODE_MAJOR"
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash -
  apt-get install -y -q nodejs
fi
node -v

echo "==> cloudflared"
if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q
  apt-get install -y -q cloudflared
fi
cloudflared --version

echo "==> User and folders"
id pulsefit >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin pulsefit
install -d -m 0755 -o root -g root "$APP_DIR" "$APP_DIR/releases"
install -d -m 0750 -o pulsefit -g pulsefit "$DATA_DIR"
install -d -m 0700 -o root -g root "$DATA_DIR/backups" "$ENV_DIR"

echo "==> Settings ($ENV_FILE)"
if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  cat > "$ENV_FILE" <<EOF
# PulseFit production settings. See server/.env.example for every option.
NODE_ENV=production
HOST=127.0.0.1
PORT=5004
PUBLIC_URL=$PUBLIC_URL
CLIENT_ORIGIN=$PUBLIC_URL
# Cloudflare Tunnel is the one proxy in front of the API.
TRUST_PROXY=1
SERVE_CLIENT=true
DEMO_MODE=false
# ALLOW_INDEXING=false  # staging only: keeps search engines out
PULSEFIT_DB_PATH=$DATA_DIR/gym-db.json
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
# Optional, add when ready: GOOGLE_CLIENT_ID, RAZORPAY_*, YOUPI_*, PAYMENT_PROVIDER
EOF
  echo "   created with a new random JWT_SECRET"
else
  echo "   kept the existing file"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

echo "==> Service and daily backup"
install -m 0644 "$HERE/pulsefit.service" /etc/systemd/system/pulsefit.service
install -m 0755 "$HERE/backup.sh" /usr/local/sbin/pulsefit-backup
cat > /etc/cron.d/pulsefit-backup <<'EOF'
# Daily PulseFit database backup at 02:30 server time (UTC on Oracle images).
30 2 * * * root /usr/local/sbin/pulsefit-backup
EOF
systemctl daemon-reload
systemctl enable pulsefit >/dev/null

echo
echo "Server ready. Next: deploy a release (deploy.ps1 does it), then connect Cloudflare Tunnel."
