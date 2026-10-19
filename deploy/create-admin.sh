#!/usr/bin/env bash
# Creates an admin account on the live server (installed as /usr/local/sbin/pulsefit-create-admin):
#   sudo pulsefit-create-admin you@example.com "Your Name"
# The API is stopped for a moment, because a running server would overwrite the database file.
# The temporary password is printed once, here in your terminal.
set -euo pipefail
EMAIL="${1:?Usage: sudo pulsefit-create-admin you@example.com \"Your Name\"}"
NAME="${2:-Gym Admin}"
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

systemctl stop pulsefit
trap 'systemctl start pulsefit' EXIT
systemd-run --quiet --pipe --wait --collect \
  -p User=pulsefit -p EnvironmentFile=/etc/pulsefit/pulsefit.env \
  -p WorkingDirectory=/opt/pulsefit/current/server \
  /usr/bin/node dist/db/create-admin.js --email "$EMAIL" --name "$NAME"
