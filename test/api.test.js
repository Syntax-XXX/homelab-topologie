'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { validate } = require('../lib/validate');
const ex = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'topology.example.json'), 'utf8'));

test('Beispiel-Topologie ist gültig', () => { validate(ex()); });
test('Fehler werden erkannt', () => {
  const bad = (f, re) => { const t = ex(); f(t); assert.throws(() => validate(t), re); };
  bad(t => t.devices.push({ id: 'router', kind: 'server' }), /doppelt/);
  bad(t => t.devices[0].kind = 'toaster', /kind/);
  bad(t => t.links.push({ from: 'router', to: 'gibtsnicht' }), /existierende/);
  bad(t => t.links.push({ from: 'switch', to: 'server-2', port: 3, id: 'x' }), /schon belegt/);
  bad(t => t.links.push({ from: 'router', to: 'nas', port: 2 }), /nur, wenn/);
  bad(t => t.devices[0].href = 'javascript:alert(1)', /href/);
  bad(t => t.devices[0].id = 'Großbuchstaben', /id nur/);
});

test('API: lesen, speichern nur mit Token, Metriken', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-'));
  Object.assign(process.env, { DATA_DIR: dir, ADMIN_TOKEN: 'geheim', DEMO: '0' });
  const { server } = require('../server');
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const st = await (await fetch(base + '/api/state')).json();
    assert.equal(st.topology.title, 'Mein Homelab'); assert.equal(st.editable, true);
    const t = st.topology; t.title = 'Neu';
    const put = h => fetch(base + '/api/topology', { method: 'PUT', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(t) });
    assert.equal((await put({})).status, 401);
    assert.equal((await put({ authorization: 'Bearer falsch' })).status, 401);
    assert.equal((await put({ authorization: 'Bearer geheim' })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'topology.json'), 'utf8')).title, 'Neu');
    t.devices[0].kind = 'quatsch';
    const r = await put({ authorization: 'Bearer geheim' }); assert.equal(r.status, 400); assert.match((await r.json()).error, /kind/);
    const m = await fetch(base + '/api/metrics', { method: 'POST', headers: { authorization: 'Bearer geheim' }, body: JSON.stringify({ links: { 'switch--router': { rx: 1000, tx: 50 } }, devices: { 'server-1': { cpu: .5 } } }) });
    assert.equal(m.status, 200);
    const s2 = await (await fetch(base + '/api/state')).json();
    assert.deepEqual(s2.links['switch--router'], { rx: 1000, tx: 50 }); assert.equal(s2.devices['server-1'].cpu, .5);
    assert.equal((await fetch(base + '/../server.js')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
  } finally { server.close(); }
});
