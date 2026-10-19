#!/bin/sh
# Volumes are mounted owned by root: hand the database folder to the unprivileged `node` user,
# then run the app as that user (setpriv comes with Debian's util-linux).
set -e
DATA_DIR="$(dirname "${PULSEFIT_DB_PATH:-/data/gym-db.json}")"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
