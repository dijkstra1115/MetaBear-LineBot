#!/bin/sh
# Deploys the Binance relay to the Tokyo VPS (docs/ORDERFLOW-BINANCE-RELAY.md). A release step:
# run it only when the relay is meant to go live.
#
#   sh scripts/relay-deploy.sh            # host alias metabear-tokyo from ~/.ssh/config
#   RELAY_HOST=user@host sh scripts/relay-deploy.sh
#
# The first run also installs the token from .data/orderflow/relay-token (never committed); later
# runs keep the token already on the host.
set -eu
HOST="${RELAY_HOST:-metabear-tokyo}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/relay" "$STAGE/public/lab/orderflow"
cp "$ROOT/relay/binance-relay.mjs" "$ROOT/relay/metabear-relay.service" "$STAGE/relay/"
cp "$ROOT/public/lab/orderflow/binance.js" "$ROOT/public/lab/orderflow/bybit.js" "$ROOT/public/lab/orderflow/markets.js" "$STAGE/public/lab/orderflow/"
# Node resolves the shared modules as ES modules from the nearest package.json.
printf '{ "type": "module" }\n' > "$STAGE/package.json"

tar -C "$STAGE" -cf - . | ssh "$HOST" 'rm -rf /tmp/metabear-relay && mkdir /tmp/metabear-relay && tar -C /tmp/metabear-relay -xf -'

if ! ssh "$HOST" 'sudo test -f /etc/metabear/relay.env'; then
  TOKEN_FILE="$ROOT/.data/orderflow/relay-token"
  [ -f "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE (the same value as the Worker's ORDERFLOW_RELAY_TOKEN)" >&2; exit 1; }
  printf 'ORDERFLOW_RELAY_TOKEN=%s\n' "$(cat "$TOKEN_FILE")" | ssh "$HOST" 'sudo install -d -m 755 /etc/metabear && sudo install -m 600 /dev/stdin /etc/metabear/relay.env'
fi

ssh "$HOST" 'set -e
  sudo rm -rf /opt/metabear-relay && sudo mv /tmp/metabear-relay /opt/metabear-relay && sudo chown -R root:root /opt/metabear-relay
  sudo install -m 644 /opt/metabear-relay/relay/metabear-relay.service /etc/systemd/system/metabear-relay.service
  sudo systemctl daemon-reload
  sudo systemctl enable metabear-relay >/dev/null 2>&1
  sudo systemctl restart metabear-relay
  sleep 5
  systemctl is-active metabear-relay
  sudo journalctl -u metabear-relay -n 10 --no-pager'
