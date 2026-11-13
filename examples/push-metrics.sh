#!/bin/sh
# Schickt alle 5 s die Datenrate einer Netzwerkkarte als Verbindung „$LINK“ an den Packet Tracer.
# Aufruf: URL=http://packet-tracer:8080 TOKEN=… LINK=switch--server-1 IFACE=eth0 ./push-metrics.sh
set -eu
: "${URL:?}" "${TOKEN:?}" "${LINK:?}" "${IFACE:=eth0}" "${DEVICE:=}"
read_bytes() { awk -v i="$IFACE:" '$1==i {print $2, $10}' /proc/net/dev; }
set -- $(read_bytes); rx0=$1; tx0=$2
while sleep 5; do
  set -- $(read_bytes); rx=$(( ($1 - rx0) / 5 )); tx=$(( ($2 - tx0) / 5 )); rx0=$1; tx0=$2
  cpu=$(awk '{print $1}' /proc/loadavg)
  dev=""; [ -n "$DEVICE" ] && dev=", \"devices\": {\"$DEVICE\": {\"cpu\": $(awk -v l="$cpu" -v n="$(nproc)" 'BEGIN{v=l/n; if(v>1)v=1; print v}')}}"
  curl -fsS -X POST "$URL/api/metrics" -H "Authorization: Bearer $TOKEN" \
    -d "{\"links\": {\"$LINK\": {\"rx\": $rx, \"tx\": $tx}}$dev}" >/dev/null || echo "Senden fehlgeschlagen" >&2
done
