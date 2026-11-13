// Prüft eine Topologie (aus dem Editor oder data/topology.json). Wirft Error mit verständlicher Meldung.
'use strict';
const KINDS = ['switch', 'router', 'server', 'nas', 'guest', 'ct', 'vps', 'cloud', 'globe', 'generic'];
const TYPES = ['lan', 'sto', 'inet', 'tun', 'vm', 'ct'];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const str = (v, max) => v == null || (typeof v === 'string' && v.length <= max);
const num = v => v == null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5);

function validate(t) {
  const err = m => { throw new Error(m); };
  if (!t || typeof t !== 'object' || Array.isArray(t)) err('Topologie muss ein Objekt sein');
  if (!str(t.title, 80)) err('title: Text, max. 80 Zeichen');
  if (!Array.isArray(t.devices) || t.devices.length > 300) err('devices: Liste mit max. 300 Geräten');
  if (!Array.isArray(t.links) || t.links.length > 1000) err('links: Liste mit max. 1000 Verbindungen');
  const ids = new Set();
  t.devices.forEach((d, i) => {
    const at = `Gerät ${i + 1}`;
    if (!d || typeof d !== 'object') err(`${at}: muss ein Objekt sein`);
    if (!ID.test(d.id || '')) err(`${at}: id nur a-z, 0-9, „-“ (max. 40)`);
    if (ids.has(d.id)) err(`${at}: id „${d.id}“ doppelt`);
    ids.add(d.id);
    if (!KINDS.includes(d.kind)) err(`${at} (${d.id}): kind muss eins von ${KINDS.join(', ')} sein`);
    for (const k of ['name', 'sub', 'print', 'ip']) if (!str(d[k], 80)) err(`${at} (${d.id}): ${k} max. 80 Zeichen`);
    if (!str(d.href, 300) || (d.href && !/^(https?:\/\/|\/)/.test(d.href))) err(`${at} (${d.id}): href muss mit http(s):// oder / beginnen`);
    if (!str(d.check, 300) || (d.check && !/^(https?|tcp):\/\//.test(d.check))) err(`${at} (${d.id}): check muss http(s):// oder tcp://host:port sein`);
    for (const k of ['x', 'y', 'z']) if (!num(d[k])) err(`${at} (${d.id}): ${k} muss eine Zahl sein`);
    if (d.ports != null && !(Number.isInteger(d.ports) && d.ports >= 1 && d.ports <= 28)) err(`${at} (${d.id}): ports 1–28`);
    if (d.disks != null && !(Number.isInteger(d.disks) && d.disks >= 0 && d.disks <= 4)) err(`${at} (${d.id}): disks 0–4`);
    if (d.info != null && (typeof d.info !== 'object' || Array.isArray(d.info) || Object.keys(d.info).length > 12
      || Object.entries(d.info).some(([k, v]) => !str(k, 40) || !str(String(v), 120)))) err(`${at} (${d.id}): info = max. 12 Felder „Name: Wert“`);
  });
  t.devices.forEach(d => { if (d.host != null && !ids.has(d.host)) err(`Gerät ${d.id}: host „${d.host}“ gibt es nicht`); });
  const lids = new Set(), used = new Set();
  t.links.forEach((l, i) => {
    const at = `Verbindung ${i + 1}`;
    if (!l || typeof l !== 'object') err(`${at}: muss ein Objekt sein`);
    if (!ids.has(l.from) || !ids.has(l.to)) err(`${at}: from/to müssen existierende Geräte sein (${l.from} → ${l.to})`);
    if (l.from === l.to) err(`${at}: from und to sind gleich`);
    if (l.type != null && !TYPES.includes(l.type)) err(`${at}: type muss eins von ${TYPES.join(', ')} sein`);
    if (l.id != null && !ID.test(l.id)) err(`${at}: id nur a-z, 0-9, „-“`);
    const id = linkId(l); if (lids.has(id)) err(`${at}: Verbindung „${id}“ doppelt`); lids.add(id);
    if (!str(l.label, 60)) err(`${at}: label max. 60 Zeichen`);
    if (l.port != null) {
      const sw = t.devices.find(d => d.id === l.from);
      if (!sw || sw.kind !== 'switch') err(`${at}: port geht nur, wenn „from“ ein Switch ist`);
      if (!(Number.isInteger(l.port) && l.port >= 1 && l.port <= (sw.ports || 28))) err(`${at}: port 1–${sw.ports || 28}`);
      const k = l.from + ':' + l.port; if (used.has(k)) err(`${at}: Port ${l.port} an ${l.from} ist schon belegt`); used.add(k);
    }
  });
  return t;
}
const linkId = l => l.id || `${l.from}--${l.to}`;
module.exports = { validate, linkId, KINDS, TYPES };
