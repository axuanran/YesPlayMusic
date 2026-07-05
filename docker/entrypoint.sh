#!/bin/sh
set -eu

NETEASE_API_PORT="${NETEASE_API_PORT:-10754}"

mkdir -p /run/nginx "$YPM_RESOLVER_STORAGE_DIR"

PORT="$NETEASE_API_PORT" npx @neteasecloudmusicapienhanced/api &
netease_pid="$!"

node /app/server/index.js &
resolver_pid="$!"

nginx -g 'daemon off;' &
nginx_pid="$!"

term() {
  kill "$nginx_pid" "$resolver_pid" "$netease_pid" 2>/dev/null || true
}
trap term INT TERM

wait -n "$nginx_pid" "$resolver_pid" "$netease_pid"
status="$?"
term
wait 2>/dev/null || true
exit "$status"
