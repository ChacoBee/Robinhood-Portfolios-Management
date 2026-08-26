#!/bin/sh
set -eu

case "${1:-}" in
  api)
    exec node --import tsx apps/server/src/api.ts
    ;;
  worker)
    exec node --import tsx apps/server/src/worker.ts
    ;;
  web)
    exec npm exec --workspace @aurum/web -- vinext start --hostname 0.0.0.0 --port 3000
    ;;
  migrate)
    exec npm exec --workspace @aurum/server -- drizzle-kit migrate --config drizzle.config.ts
    ;;
  connect-robinhood)
    exec node --import tsx apps/server/src/robinhood/connect-cli.ts
    ;;
  *)
    echo "usage: aurum {api|worker|web|migrate|connect-robinhood}" >&2
    exit 64
    ;;
esac
