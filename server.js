// Homelab Packet Tracer – Live-Topologie (isometrisch) + Editor. Nur Node-Standardbibliothek.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), net = require('net'), crypto = require('crypto');
const { validate, linkId } = require('./lib/validate');

const PORT = +process.env.PORT || 8080;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA, 'topology.json');
const ADMIN = process.env.ADMIN_TOKEN || '';           // Editor speichern + Metriken senden
const METRICS = process.env.METRICS_TOKEN || ADMIN;    // nur Metriken senden (für Skripte)
const DEMO = process.env.DEMO !== '0';                 // simulierter Traffic, solange keine echten Metriken kommen

let topo = load();
const metrics = { devices: {}, links: {}, at: 0 };     // per POST /api/metrics
const status = {};                                     // Ergebnis der Health-Checks
const demo = {};

function load() {
  for (const f of [FILE, path.join(__dirname, 'topology.example.json')]) {
    try { return validate(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') console.error(f, e.message); }
  }
  return { title: 'Homelab', devices: [], links: [] };
}
function save(t) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(t, null, 2));
  fs.renameSync(tmp, FILE);   // atomar: nie halb geschriebene Datei
}

// ── Health-Checks (http/https: Antwort < 500 = ok; tcp: Verbindung klappt) ──
async function check(url) {
  if (url.startsWith('tcp://')) {
    const u = new URL(url.replace('tcp://', 'http://'));
    return new Promise(res => { const s = net.connect(+u.port || 80, u.hostname); const done = ok => { s.destroy(); res(ok); };
      s.setTimeout(4000, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false)); });
  }
  try { const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' }); return r.status < 500; } catch { return false; }
}
async function runChecks() {
  await Promise.all(topo.devices.filter(d => d.check).map(async d => { status[d.id] = (await check(d.check)) ? 'ok' : 'bad'; }));
  for (const id of Object.keys(status)) if (!topo.devices.some(d => d.id === id && d.check)) delete status[id];
}
setInterval(runChecks, 15000).unref(); runChecks();

// ── Demo-Traffic: weicher Zufallsverlauf pro Verbindung, damit man sofort Pakete sieht ──
function tickDemo() {
  const base = { inet: 4e6, tun: 2e5, lan: 3e6, sto: 2e7, vm: 6e5, ct: 2e5 };
  for (const l of topo.links) {
    const id = linkId(l), b = base[l.type || 'lan'] || 1e6, o = demo[id] || { rx: b, tx: b / 3 };
    const walk = v => Math.min(b * 8, Math.max(b / 20, v * Math.exp((Math.random() - .5) * .6)));
    demo[id] = { rx: walk(o.rx), tx: walk(o.tx) };
  }
  for (const d of topo.devices) if (['server', 'guest', 'ct', 'nas', 'vps'].includes(d.kind)) {
    const o = demo['dev:' + d.id] || { cpu: Math.random() * .5, mem: .3 + Math.random() * .4, disk: .2 + Math.random() * .6 };
    const cl = (v, a, b) => Math.min(b, Math.max(a, v));
    demo['dev:' + d.id] = { cpu: cl(o.cpu + (Math.random() - .5) * .12, .02, .98), mem: cl(o.mem + (Math.random() - .5) * .03, .1, .95), disk: cl(o.disk + (Math.random() - .4) * .004, .05, .97),
      ...(['server', 'vps'].includes(d.kind) ? { load: cl(o.cpu * 1.1, 0, 1.5) } : {}) };
  }
}
if (DEMO) { tickDemo(); setInterval(tickDemo, 2000).unref(); }

function state() {
  const live = Date.now() - metrics.at < 60000;  // echte Metriken haben Vorrang
  const links = {}, devices = {};
  for (const l of topo.links) { const id = linkId(l); links[id] = metrics.links[id] || (!live && DEMO ? demo[id] : null) || null; }
  for (const d of topo.devices) devices[d.id] = { ...((!live && DEMO && demo['dev:' + d.id]) || {}), ...(metrics.devices[d.id] || {}), ...(status[d.id] ? { status: status[d.id] } : {}) };
  return { now: Date.now(), topology: topo, links, devices, demo: !live && DEMO, editable: !!ADMIN };
}

// ── HTTP ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ROUTES = { '/': 'index.html', '/edit': 'edit.html' };
const PUB = path.join(__dirname, 'public');
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const authed = (req, tok) => !!tok && safeEq((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), tok);
function body(req, max = 1e6) {
  return new Promise((res, rej) => { let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > max) { rej(new Error('zu groß')); req.destroy(); } else c.push(d); });
    req.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch { rej(new Error('kein gültiges JSON')); } }); req.on('error', rej); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, state());
    if (url.pathname === '/api/topology' && req.method === 'PUT') {
      if (!ADMIN) return send(res, 403, { error: 'Bearbeiten ist aus: ADMIN_TOKEN setzen' });
      if (!authed(req, ADMIN)) return send(res, 401, { error: 'Falscher Admin-Token' });
      const t = validate(await body(req));
      save(t); topo = t; runChecks();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/metrics' && req.method === 'POST') {
      if (!authed(req, METRICS)) return send(res, 401, { error: 'Falscher Token' });
      const m = await body(req, 2e5);
      const clean = (o, keys) => Object.fromEntries(Object.entries(o || {}).slice(0, 2000).map(([k, v]) => [k, Object.fromEntries(keys.filter(x => v?.[x] != null).map(x => [x, typeof v[x] === 'number' ? v[x] : String(v[x]).slice(0, 80)]))]));
      Object.assign(metrics.links, clean(m.links, ['rx', 'tx']));
      Object.assign(metrics.devices, clean(m.devices, ['cpu', 'mem', 'disk', 'load', 'status', 'sub']));
      metrics.at = Date.now();
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Methode nicht erlaubt' });
    const rel = ROUTES[url.pathname] || url.pathname.slice(1);
    const f = path.join(PUB, path.normalize(rel));
    if (!f.startsWith(PUB + path.sep)) return send(res, 404, 'not found', 'text/plain');
    fs.readFile(f, (e, b) => e ? send(res, 404, 'not found', 'text/plain') : send(res, 200, b, TYPES[path.extname(f)] || 'application/octet-stream'));
  } catch (e) { send(res, 400, { error: e.message }); }
});
if (require.main === module) server.listen(PORT, () => console.log(`Packet Tracer auf :${PORT}${ADMIN ? '' : ' (Editor nur lesend – ADMIN_TOKEN fehlt)'}${DEMO ? ' · Demo-Traffic an' : ''}`));
module.exports = { server };
