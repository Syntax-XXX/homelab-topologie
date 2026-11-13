# Homelab Packet Tracer

Live-Topologie fürs Homelab im Browser: Geräte als isometrische Glaskästen, Kabel am echten
Switch-Port, Pakete fließen mit der aktuellen Datenrate. Mit Editor zum Hinzufügen und Entfernen
von Geräten und Verbindungen. Läuft ohne Abhängigkeiten (nur Node.js) und funktioniert am Handy
als Web-App.

- **Ansicht** `/`: antippen öffnet Details, Pinch/Mausrad zoomt, Doppeltipp fliegt zum Gerät.
  Ein Switch zeigt alle Ports und was wo steckt.
- **Editor** `/edit`: Geräte und Verbindungen per Formular, rechts eine Live-Vorschau.
  Gespeichert wird mit dem Admin-Token, eine JSON-Ansicht gibt es zum Sichern und Teilen.
- **Live-Daten:** Datenraten und CPU kommen per `POST /api/metrics`. Solange nichts kommt,
  zeigt er Demo-Werte. Erreichbarkeit prüft der Server selbst (http/https/tcp).

## Starten

```sh
cp .env.example .env
echo "ADMIN_TOKEN=$(openssl rand -hex 24)" >> .env
docker compose up -d --build        # → http://<server>:8080
```

Ohne Docker: `ADMIN_TOKEN=… node server.js` (Node ≥ 18). Tests: `npm test`.

Die Topologie liegt in `data/topology.json`. Beim ersten Start wird `topology.example.json` gezeigt.
Speichern im Editor legt dann die eigene Datei an.

| Variable | Bedeutung |
|---|---|
| `ADMIN_TOKEN` | erlaubt Speichern im Editor (und Metriken). Ohne Token ist der Editor nur lesend. |
| `METRICS_TOKEN` | optional: eigener Token nur für `POST /api/metrics` |
| `DEMO` | `1` (Standard) = simulierter Traffic, bis echte Metriken kommen; `0` = aus |
| `PORT`, `DATA_DIR` | Port (8080) und Datenordner |

> Die Seite selbst hat keinen Login. Stell sie nur ins LAN/VPN oder hinter einen Login-Proxy
> (z. B. oauth2-proxy, Authelia). Der Admin-Token schützt nur das Speichern.

## Topologie-Format

```json
{
  "title": "Mein Homelab",
  "devices": [
    { "id": "switch", "kind": "switch", "name": "core-switch", "ports": 24 },
    { "id": "server-1", "kind": "server", "name": "server-1", "ip": "192.168.1.10", "check": "tcp://192.168.1.10:22" },
    { "id": "docker", "kind": "guest", "name": "docker", "host": "server-1" }
  ],
  "links": [
    { "from": "switch", "to": "server-1", "port": 3, "type": "lan" },
    { "from": "server-1", "to": "docker", "type": "vm" }
  ]
}
```

**Geräte (`kind`):** `switch` (bis 24 Ports + 4 SFP), `router`, `server` (CPU/RAM sichtbar),
`nas` (`disks` 0–4), `guest` (VM, mit `"lxc": true` als LXC), `ct` (Container), `vps`, `cloud`,
`globe` (Internet), `generic`.

Optionale Felder:
- `ip`, `sub`, `print`: Aufdruck auf dem Gerät
- `href`: Button „Öffnen“
- `check`: `https://…` oder `tcp://host:port`
- `info`: `{ "Name": "Wert" }`
- `host`: Gast oder Container läuft auf diesem Gerät
- `x`/`y`/`z`: eigene Position; ohne Angabe wird automatisch angeordnet

**Verbindungen (`type`):**
- `lan`, `sto` (Storage), `inet`, `tun` (VPN, gestrichelt), `vm`, `ct`
- `port`: nur wenn `from` ein Switch ist
- `label`: Beschriftung
- `id`: für Metriken. Ohne Angabe ist die id `<from>--<to>`.

## Live-Daten senden

```sh
curl -X POST http://packet-tracer:8080/api/metrics -H "Authorization: Bearer $TOKEN" -d '{
  "links":   { "switch--server-1": { "rx": 1250000, "tx": 80000 } },
  "devices": { "server-1": { "cpu": 0.42, "mem": 0.61, "disk": 0.35, "load": 0.2, "status": "ok", "sub": "12 VMs" } }
}'
```

- **Einheiten:** `rx` und `tx` in Byte/s; `cpu`, `mem`, `disk` (belegter Speicher) und `load` (Last pro Kern) von 0 bis 1. Die Blöcke in Servern und NAS füllen sich damit sichtbar.
- **Status:** `status` ist `ok`, `warn`, `bad` oder `off`.
- **Demo-Modus:** Sobald Metriken ankommen, ist der Demo-Modus für 60 s aus. Verbindungen ohne Werte bleiben dann still.
- **Fertiges Beispiel:** [`examples/push-metrics.sh`](examples/push-metrics.sh) liest `/proc/net/dev` einer Netzwerkkarte und schickt die Rate alle 5 s:

```sh
URL=http://packet-tracer:8080 TOKEN=… LINK=switch--server-1 IFACE=eth0 DEVICE=server-1 ./examples/push-metrics.sh
```

Andere Quellen funktionieren genauso, solange sie dieses JSON schicken: SNMP vom Switch, Proxmox-API oder Prometheus.

## API

| Methode | Pfad | |
|---|---|---|
| GET | `/api/state` | Topologie + aktuelle Werte |
| PUT | `/api/topology` | Topologie speichern (Bearer `ADMIN_TOKEN`, wird geprüft) |
| POST | `/api/metrics` | Werte senden (Bearer `METRICS_TOKEN` oder `ADMIN_TOKEN`) |

## Lizenz

MIT. Die Schriften Geist / Geist Mono stehen unter der SIL Open Font License.
