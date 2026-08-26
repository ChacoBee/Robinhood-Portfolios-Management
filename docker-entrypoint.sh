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
  connect-robinhood)
    exec node --import tsx apps/server/src/robinhood/connect-cli.ts
    ;;
  *)
    echo "usage: aurum {api|worker|migrate|connect-robinhood}" >&2
    exit 64
    ;;
esac
