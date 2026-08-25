#!/bin/sh
set -eu

case "${1:-}" in
  api)
    exec node --import tsx apps/server/src/api.ts
    ;;
  worker)
    exec node --import tsx apps/server/src/worker.ts
    ;;
  migrate)
    exec npm exec --workspace @aurum/server -- drizzle-kit migrate --config drizzle.config.ts
    ;;
  *)
    echo "usage: aurum {api|worker|migrate}" >&2
    exit 64
    ;;
esac
