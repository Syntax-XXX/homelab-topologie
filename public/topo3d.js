// Topologie in echtem 3D (Three.js r160): drehen, kippen, zoomen. Gleiche Daten wie die 2D-Ansicht (Modell M).
// Schnell auch auf dem iPhone: keine Schatten/Postprocessing, geteilte Geometrien, alle Pakete in EINEM InstancedMesh,
// Auflösung passt sich der Bildrate an. Rauszoomen ist begrenzt, Boden läuft im Nebel in einen Himmel-Verlauf aus.
import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1).translate(.5, .5, .5);   // Ursprung an der Ecke → wie die Kästen im Modell
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT);
const DOT = new THREE.SphereGeometry(1, 8, 6);
const COLVAR = { lan: '--c2', sto: '--c3', inet: '--accent', tun: '--accent', vm: '--ok', ct: '--c3' };
const KINDVAR = { switch: '--c2', server: '--text', nas: '--accent', router: '--c2', guest: '--ok', ct: '--c3', vps: '--accent', cloud: '--accent', globe: '--c2', generic: '--text-3' };
const speed = bps => bps > 0 ? Math.max(.6, 7 - Math.log10(bps + 1) * 1.05) : 0;
const width = bps => 2.2 + Math.min(2.6, Math.log10((bps || 0) + 1) / 2.2);
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
const hot = (f, c) => f > .85 ? '--bad' : f > .6 ? '--warn' : c;
const W = (x, y, z = 0) => new THREE.Vector3(x, z, y);   // Modell (x, y = Tiefe, z = Höhe) → Three (x, y = Höhe, z = Tiefe)

export function start(stage, hooks) {
  const css = v => hooks.col(`var(${v})`);
  const color = v => new THREE.Color(css(v));
  const dark = () => hooks.dark();

  // ── Renderer, Kamera, Himmel ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const maxPR = Math.min(2, devicePixelRatio || 1); let pr = maxPR;
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const cvs = renderer.domElement; cvs.id = 'g3'; cvs.setAttribute('aria-label', 'Topologie in 3D – ziehen zum Drehen, zwei Finger zum Zoomen');
  stage.insertBefore(cvs, stage.querySelector('.legend'));
  const labels = document.createElement('div'); labels.id = 'l3'; stage.insertBefore(labels, cvs.nextSibling);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 5, 9000);
  const controls = new OrbitControls(camera, cvs);
  Object.assign(controls, { enableDamping: true, dampingFactor: .085, minDistance: 70, maxDistance: 2300, maxPolarAngle: Math.PI * .47, minPolarAngle: .12,
    screenSpacePanning: false, rotateSpeed: .7, zoomSpeed: 1.1, panSpeed: .9 });
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-600, 900, 500); scene.add(sun);
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7000, 64).rotateX(-Math.PI / 2), floorMat); floor.position.y = -.6; scene.add(floor);
  let grid = null;
  function theme() {   // Farben je Hell/Dunkel: Himmel-Verlauf + Nebel in Horizontfarbe → nirgends schwarzes Nichts
    const d = dark(), top = d ? '#05070d' : '#cfd9e6', hor = d ? '#141a28' : '#eef2f7';
    const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(.62, hor); gr.addColorStop(1, hor); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    scene.background?.dispose?.(); scene.background = new THREE.CanvasTexture(c); scene.background.colorSpace = THREE.SRGBColorSpace;
    scene.fog = new THREE.Fog(hor, 900, 4600);
    floorMat.color.set(d ? '#0b0e15' : '#e4e9f0');
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(9000, 225, d ? 0x2a3550 : 0xb8c4d6, d ? 0x1a2133 : 0xd3dbe6);
    grid.material.transparent = true; grid.material.opacity = d ? .55 : .7; grid.material.depthWrite = false; scene.add(grid);
    hemi.color.set(d ? '#cfdcff' : '#ffffff'); hemi.groundColor.set(d ? '#1a2030' : '#c8d0dc');
  }
  theme();

  // weiche Kontaktschatten (Textur statt Echtzeit-Schatten)
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  // ── Geräte ──
  let world = new THREE.Group(); scene.add(world);
  let nodes = new Map(), edges = [], key = '', selId = null;
  const hit = [], spins = [];

  function mats(n) {   // pro Gerät eigene Materialien → Abdunkeln bei Auswahl
    const list = [];
    const mk = (Ctor, o, base = o.opacity ?? 1) => { const m = new Ctor({ transparent: true, ...o }); m.userData.base = base; list.push(m); return m; };
    return { list, mk };
  }
  function glass(g, M, b, cv) {
    const c = color(cv);
    const body = new THREE.Mesh(UNIT, M.mk(THREE.MeshStandardMaterial, { color: c, opacity: .13, roughness: .08, metalness: .35, depthWrite: false, side: THREE.DoubleSide }));
    body.scale.set(b.w, b.h, b.d); body.renderOrder = 2; g.add(body);
    const edge = new THREE.LineSegments(UNIT_EDGES, M.mk(THREE.LineBasicMaterial, { color: c, opacity: .85 }));
    edge.scale.copy(body.scale); g.add(edge);
    const top = new THREE.Mesh(UNIT, M.mk(THREE.MeshBasicMaterial, { color: c, opacity: .05, depthWrite: false })); top.scale.set(b.w, .4, b.d); top.position.y = b.h - .4; g.add(top);
  }
  function tank(g, M, x, y, z, w, h, d, f, cv, depth = false) {   // Füllstand: gestrichelter Rahmen + gefüllter Block
    const shell = new THREE.LineSegments(UNIT_EDGES, M.mk(THREE.LineBasicMaterial, { color: color(cv), opacity: .32 }));
    shell.scale.set(w, h, d); shell.position.set(x, y, z); g.add(shell);
    const mat = M.mk(THREE.MeshStandardMaterial, { color: color(cv), emissive: color(cv), emissiveIntensity: .55, roughness: .4, opacity: .92 });
    const fill = new THREE.Mesh(UNIT, mat); g.add(fill);
    const t = { set(v, ncv) { const q = clamp01(v); fill.visible = q > 0;
      if (depth) { const dd = Math.max(1.5, d * q); fill.scale.set(w, h, dd); fill.position.set(x, y, z + d - dd); }
      else { fill.scale.set(w, Math.max(.8, h * q), d); fill.position.set(x, y, z); }
      if (ncv) { const c = color(ncv); mat.color.copy(c); mat.emissive.copy(c); shell.material.color.copy(c); } } };
    t.set(f); return t;
  }
  function led(g, M, x, y, z, st, r = 1.8) {
    const m = M.mk(THREE.MeshBasicMaterial, { color: color(stVar(st)) });
    const s = new THREE.Mesh(DOT, m); s.scale.setScalar(r); s.position.set(x, y, z); g.add(s);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: m.color, transparent: true, opacity: .7, depthWrite: false })); M.list.push(halo.material); halo.material.userData.base = .7;
    halo.scale.setScalar(r * 6); halo.position.copy(s.position); g.add(halo);
    return { set(st2) { m.color.set(css(stVar(st2))); halo.material.color.copy(m.color); } };
  }
  const stVar = st => st === 'ok' ? '--ok' : st === 'bad' ? '--bad' : st === 'warn' ? '--warn' : '--off';

  const BUILD = {
    switch(n, g, M, b) {
      glass(g, M, b, '--c2');
      const ports = [];
      (n.ports || []).forEach(p => { const q = n.portGeo?.[p.num]; if (!q) return;
        const m = M.mk(THREE.MeshStandardMaterial, { color: 0x111318, emissive: 0x000000, roughness: .5 });
        const box = new THREE.Mesh(UNIT, m); box.scale.set(q.du, q.dv, 3); box.position.set(q.u, q.v, b.d - 2.6); g.add(box); ports.push({ p, m }); });
      const up = () => ports.forEach(({ p, m }) => { const on = p.status === 'connected', c = on ? color(p.vlan === '50' ? '--c3' : '--c2') : new THREE.Color(0x111318);
        m.color.copy(c); m.emissive.copy(on ? c : new THREE.Color(0)); m.emissiveIntensity = on ? .9 : 0; });
      up();
      for (const [x, w, d] of [[40, 70, 26], [150, 40, 30], [b.w - 70, 46, 40]]) { const chip = new THREE.Mesh(UNIT, M.mk(THREE.MeshStandardMaterial, { color: color('--text'), opacity: .14, roughness: .3 })); chip.scale.set(w, 5, d); chip.position.set(x, 3, 14); g.add(chip); }
      const l = led(g, M, 10, b.h - 8, b.d + .5, n.st);
      return n2 => { n.ports = n2.ports; ports.forEach(o => { o.p = n2.ports.find(q => q.num === o.p.num) || o.p; }); up(); l.set(n2.st); };
    },
    server(n, g, M, b) {
      glass(g, M, b, '--text');
      const on = () => n.st === 'ok';
      const cpu = tank(g, M, 30, 3, 22, 26, 22, 26, n.load, hot(n.load, '--accent'));
      const la = n.la != null ? tank(g, M, 30, 3, 52, 26, 22, 8, n.la, hot(n.la, '--c3')) : null;
      const ram = Array.from({ length: 8 }, (_, i) => tank(g, M, 66 + i * 7, 3, 16, 3, 22, 40, (n.mem || 0) * 8 - i, hot(n.mem, '--c2')));
      const disk = n.disk != null ? tank(g, M, 92, 3, 66, 40, 16, 26, n.disk, hot(n.disk, '--ok')) : null;
      for (let i = 0; i < 3; i++) { const fan = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 14), M.mk(THREE.MeshStandardMaterial, { color: color('--text'), opacity: .25 })); fan.position.set(26 + i * 18, 5, 77); g.add(fan); }
      for (let i = 0; i < 4; i++) { const bay = new THREE.Mesh(UNIT, M.mk(THREE.MeshStandardMaterial, { color: color('--text'), opacity: .1 })); bay.scale.set(15, b.h - 12, 2); bay.position.set(b.w - 78 + i * 18, 4, b.d - 1.8); g.add(bay); }
      const l = led(g, M, 12, b.h - 8, b.d + .5, n.st);
      return n2 => { Object.assign(n, n2); cpu.set(on() ? n.load : 0, hot(n.load, '--accent')); la?.set(on() ? n.la : 0, hot(n.la, '--c3'));
        ram.forEach((t, i) => t.set(on() ? (n.mem || 0) * 8 - i : 0, hot(n.mem, '--c2'))); disk?.set(on() ? n.disk : 0, hot(n.disk, '--ok')); l.set(n.st); };
    },
    nas(n, g, M, b) {
      glass(g, M, b, '--accent');
      const bays = [];
      for (let i = 0; i < 4; i++) { const u = 10 + i * ((b.w - 20) / 4), du = (b.w - 20) / 4 - 6, dk = (n.disks || [])[i];
        bays.push(dk ? tank(g, M, u, 3, 14, du, b.h - 6, b.d - 30, dk.fill, dk.health === false ? '--bad' : hot(dk.fill, '--accent'), true) : null);
        if (!dk) { const e = new THREE.LineSegments(UNIT_EDGES, M.mk(THREE.LineBasicMaterial, { color: color('--line-3'), opacity: .4 })); e.scale.set(du, b.h - 6, b.d - 30); e.position.set(u, 3, 14); g.add(e); } }
      const l = led(g, M, 8, b.h - 6, b.d + .5, n.st);
      return n2 => { (n2.disks || []).forEach((dk, i) => bays[i]?.set(dk.fill, dk.health === false ? '--bad' : hot(dk.fill, '--accent'))); l.set(n2.st); };
    },
    router(n, g, M, b) {
      glass(g, M, b, '--c2');
      const ls = [0, 1, 2, 3].map(i => led(g, M, 12 + i * 9, b.h / 2, b.d + .5, i < 3 ? 'ok' : 'off', 1.4));
      for (const x of [14, b.w - 14]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 34, 6), M.mk(THREE.MeshStandardMaterial, { color: color('--text'), opacity: .5 })); a.position.set(x, b.h + 17, 8); g.add(a); }
      return n2 => ls[0].set(n2.st);
    },
    guest(n, g, M, b) {
      glass(g, M, b, '--ok');
      if (n.lxc) { for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(UNIT, M.mk(THREE.MeshStandardMaterial, { color: color('--ok'), opacity: .22, emissive: color('--ok'), emissiveIntensity: .2 })); s.scale.set(b.w - 16, 6, b.d - 16); s.position.set(8, 6 + i * 12, 8); g.add(s); } }
      const t = tank(g, M, 14, 3, 14, b.w - 28, b.h - 10, b.d - 28, n.load * 3, '--ok');
      const l = led(g, M, 6, b.h - 6, b.d + .5, n.st, 1.5);
      return n2 => { t.set(n2.st === 'ok' ? Math.min(1, (n2.load || 0) * 3) : 0); l.set(n2.st); };
    },
    ct(n, g, M, b) {
      glass(g, M, b, '--c3');
      const t = tank(g, M, 8, 3, 8, b.w - 16, b.h - 8, b.d - 16, (n.load || 0) * 5, '--c3');
      const l = led(g, M, 4, b.h - 5, b.d + .5, n.st, 1.3);
      return n2 => { t.set(n2.st === 'ok' ? Math.min(1, (n2.load || 0) * 5) : 0); l.set(n2.st); };
    },
    vps(n, g, M, b) {
      glass(g, M, b, '--accent');
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, b.z, 6), M.mk(THREE.MeshBasicMaterial, { color: color('--accent'), opacity: .35 })); pole.position.set(b.w / 2, -b.z / 2, b.d / 2); g.add(pole);
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(UNIT, M.mk(THREE.MeshStandardMaterial, { color: color('--accent'), emissive: color('--accent'), emissiveIntensity: .4, opacity: .5 })); s.scale.set(b.w - 30, 4, 12); s.position.set(15, 6, 10 + i * 18); g.add(s); }
      const l = led(g, M, 8, b.h - 7, b.d + .5, n.st);
      return n2 => l.set(n2.st);
    },
    cloud(n, g, M, b) {
      glass(g, M, b, '--accent');
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, b.z, 6), M.mk(THREE.MeshBasicMaterial, { color: color('--accent'), opacity: .3 })); pole.position.set(b.w / 2, -b.z / 2, b.d / 2); g.add(pole);
      const m = M.mk(THREE.MeshStandardMaterial, { color: color('--accent'), emissive: color('--accent'), emissiveIntensity: .35, opacity: .55, roughness: .6 });
      for (const [x, y, z, r] of [[.38, 22, .5, 15], [.55, 28, .45, 19], [.7, 21, .55, 13]]) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), m); s.position.set(b.w * x, y, b.d * z); g.add(s); }
      return () => {};
    },
    globe(n, g, M, b) {
      const r = 38;
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(r, 2)), M.mk(THREE.LineBasicMaterial, { color: color('--c2'), opacity: .55 }));
      const core = new THREE.Mesh(new THREE.SphereGeometry(r * .96, 32, 16), M.mk(THREE.MeshStandardMaterial, { color: color('--c2'), emissive: color('--c2'), emissiveIntensity: .25, opacity: .18, depthWrite: false }));
      g.add(wire, core); g.userData.spin = wire;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, b.z - r, 6), M.mk(THREE.MeshBasicMaterial, { color: color('--c2'), opacity: .3 })); pole.position.y = -(b.z + r) / 2; g.add(pole);
      return () => {};
    },
    generic(n, g, M, b) { glass(g, M, b, '--text-3'); const l = led(g, M, 5, b.h - 7, b.d + .5, n.st); return n2 => l.set(n2.st); },
  };

  const isGlobe = n => n.kind === 'globe';
  const center = n => isGlobe(n) ? W(n.box.x, n.box.y, n.box.z) : W(n.box.x + n.box.w / 2, n.box.y + n.box.d / 2, (n.box.z || 0) + n.box.h / 2);
  const topOf = n => isGlobe(n) ? W(n.box.x, n.box.y, n.box.z + 40) : W(n.box.x + n.box.w / 2, n.box.y + n.box.d / 2, (n.box.z || 0) + n.box.h);

  function disposeAll(o) { o.traverse(x => { if (x.geometry && ![UNIT, UNIT_EDGES, DOT].includes(x.geometry)) x.geometry.dispose(); if (x.material) [].concat(x.material).forEach(m => m.dispose()); }); }

  function build(M) {
    disposeAll(world); scene.remove(world); world = new THREE.Group(); scene.add(world);
    nodes = new Map(); edges = []; hit.length = 0; spins.length = 0; labels.innerHTML = '';
    for (const n of M.N) {
      const b = n.box, g = new THREE.Group(), MM = mats(n);
      g.position.copy(isGlobe(n) ? W(b.x, b.y, b.z) : W(b.x, b.y, b.z || 0));
      const upd = (BUILD[n.kind] || BUILD.generic)(n, g, MM, b);
      if (!isGlobe(n) && !b.z) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 30, b.d + 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: dark() ? .9 : .5 }));
        sh.position.set(b.w / 2, .3, b.d / 2); g.add(sh); }
      const hb = new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial({ visible: false }));
      if (isGlobe(n)) { hb.scale.setScalar(90); hb.position.set(-45, -45, -45); } else { hb.scale.set(b.w + 16, Math.max(b.h, 20) + 10, b.d + 16); hb.position.set(-8, -2, -8); }
      hb.userData.id = n.id; g.add(hb); hit.push(hb);
      const el = document.createElement('div'); el.className = 'l3';
      el.innerHTML = `<i></i><b></b><span></span>`; labels.appendChild(el);
      world.add(g); if (g.userData.spin) spins.push(g.userData.spin); nodes.set(n.id, { n, g, upd, mats: MM.list, el, top: topOf(n).add(new THREE.Vector3(0, 14, 0)) });
    }
    layoutRack(M);
    const byId = id => nodes.get(id)?.n;
    let total = 0;
    for (const e of M.E) {
      let curve;
      if (e.air) {   // Luftlinie zwischen den Geräten, Bogen nach oben
        const a = byId(e.f), z = byId(e.t); if (!a || !z) continue;
        const p0 = topOf(a), p2 = topOf(z), mid = p0.clone().add(p2).multiplyScalar(.5); mid.y = Math.max(p0.y, p2.y) + (e.cls === 'tun' ? 140 : 70);
        curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
      } else {
        curve = new THREE.CurvePath();
        for (let i = 1; i < e.pts.length; i++) { const [a, c] = [e.pts[i - 1], e.pts[i]]; const v0 = W(a[0], a[1], a[2] + .9), v1 = W(c[0], c[1], c[2] + .9); if (v0.distanceTo(v1) > .01) curve.add(new THREE.LineCurve3(v0, v1)); }
        if (!curve.curves.length) continue;
      }
      const len = curve.getLength();
      const mat = new THREE.MeshStandardMaterial({ color: color(COLVAR[e.cls]), transparent: true, opacity: e.virt ? .35 : .5, roughness: .4, emissive: color(COLVAR[e.cls]), emissiveIntensity: .15 });
      const r = e.cls === 'tun' ? .9 : 1.1;
      let tube;
      if (e.air) tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), mat);
      else {   // je Teilstück eine gerade Röhre + Kugel an jeder Ecke: Röhre folgt exakt dem Pfad der Pakete (TubeGeometry über den ganzen Pfad schnitt die Ecken ab)
        tube = new THREE.Group(); tube.material = mat;
        curve.curves.forEach((c, k) => { tube.add(new THREE.Mesh(new THREE.TubeGeometry(c, 1, r, 8, false), mat));
          const j = new THREE.Mesh(DOT, mat); j.scale.setScalar(r); j.position.copy(c.v2); tube.add(j);
          if (!k) { const j0 = j.clone(); j0.position.copy(c.v1); tube.add(j0); } });
      }
      tube.material.userData.base = tube.material.opacity; world.add(tube);
      const n = Math.max(2, Math.min(90, Math.round(len / 20)));
      edges.push({ e, curve, len, tube, n, start: total }); total += n;
    }
    // alle Pakete in einem einzigen Draw-Call
    packets = new THREE.InstancedMesh(DOT, new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, total));
    packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); packets.frustumCulled = false; world.add(packets);
    packets.setColorAt(0, new THREE.Color());
  }
  let packets = null;

  // ── Rack: Standardansicht. Alle physischen Geräte stecken übereinander im Schrank, VMs/Container in ihrem Host,
  //    Internet/Cloud oben drin. Antippen → Tür auf, alles fliegt versetzt an seinen eigenen Platz. ──
  let rack = null, R = null, exploded = false, prog = 0, poseDirty = true, pendingFocus = null;
  const metal = () => new THREE.MeshStandardMaterial({ color: dark() ? '#3a4254' : '#8d97a8', metalness: .85, roughness: .3, transparent: true });
  function layoutRack(M) {
    if (rack) { disposeAll(rack); scene.remove(rack); }
    rack = new THREE.Group(); scene.add(rack);
    const RW = 150, RD = 120, ORDER = ['nas', 'generic', 'server', 'switch', 'router'];   // von unten nach oben
    const all = [...nodes.values()];
    const bb = new THREE.Box3(); all.filter(o => !o.n.box.z && !isGlobe(o.n)).forEach(o => bb.expandByPoint(center(o.n)));
    const c = bb.isEmpty() ? new THREE.Vector3() : bb.getCenter(new THREE.Vector3()), RX = c.x, RZ = c.z + 60;
    let y = 16; const phys = all.filter(o => ORDER.includes(o.n.kind)).sort((a, b) => ORDER.indexOf(a.n.kind) - ORDER.indexOf(b.n.kind) || a.n.box.x - b.n.box.x);
    for (const o of phys) { const b = o.n.box, sc = Math.min(RW / b.w, RD / b.d, 1.15);
      o.rk = { p: new THREE.Vector3(RX - b.w * sc / 2, y, RZ - b.d * sc / 2), s: sc, c: new THREE.Vector3(RX, y + b.h * sc / 2, RZ) }; y += b.h * sc + 7; }
    const H = y + (phys.some(o => o.n.kind === 'router') ? 46 : 16);   // Platz für die Router-Antennen
    const parentOf = id => M.E.find(e => e.t === id && (e.virt || e.cls === 'vm' || e.cls === 'ct'))?.f;
    for (const o of all) if (!o.rk) {   // VMs/Container stecken in ihrem Host, Cloud oben im Rack
      let pid = parentOf(o.n.id), guard = 0; while (pid && !nodes.get(pid)?.rk && guard++ < 4) pid = parentOf(pid);
      const pc = pid && nodes.get(pid)?.rk ? nodes.get(pid).rk.c : new THREE.Vector3(RX, H - 20, RZ);
      o.rk = { p: pc.clone(), s: .001, c: pc.clone() };
    }
    all.forEach((o, i) => { o.lay = { p: o.g.position.clone(), s: 1 }; o.delay = (i / Math.max(1, all.length - 1)) * .45; });
    // Schrank
    const m = metal(), fw = RW + 22, fd = RD + 22, x0 = RX - fw / 2, z0 = RZ - fd / 2, mats = [m];
    const box = (w, h, d, x, y2, z, mat) => { const b = new THREE.Mesh(UNIT, mat); b.scale.set(w, h, d); b.position.set(x, y2, z); rack.add(b); return b; };
    for (const [x, z] of [[x0, z0], [x0 + fw - 6, z0], [x0, z0 + fd - 6], [x0 + fw - 6, z0 + fd - 6]]) box(6, H, 6, x, 0, z, m);
    box(fw, 6, fd, x0, 0, z0, m);
    const roof = new THREE.MeshStandardMaterial({ color: dark() ? '#2a3141' : '#a7b0bf', metalness: .8, roughness: .35, transparent: true, opacity: .55, depthWrite: false }); mats.push(roof);
    box(fw, 3, fd, x0, H - 3, z0, roof);   // Dach halbdurchsichtig – man sieht von oben hinein
    const side = new THREE.MeshPhysicalMaterial({ color: dark() ? '#6f86b8' : '#9fb3d6', metalness: .2, roughness: .08, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false }); mats.push(side);
    box(1, H - 12, fd - 12, x0 + 2, 6, z0 + 6, side); box(1, H - 12, fd - 12, x0 + fw - 3, 6, z0 + 6, side); box(fw - 12, H - 12, 1, x0 + 6, 6, z0 + 2, side);
    const fe = new THREE.LineSegments(UNIT_EDGES, new THREE.LineBasicMaterial({ color: dark() ? '#7d8fb5' : '#7b879b', transparent: true, opacity: .55 })); fe.scale.set(fw, H, fd); fe.position.set(x0, 0, z0); rack.add(fe); mats.push(fe.material);
    // Lochblech-Schienen vorn
    const rail = new THREE.MeshStandardMaterial({ color: dark() ? '#2a3140' : '#7d8797', metalness: .8, roughness: .4, transparent: true }); mats.push(rail);
    box(4, H - 12, 3, x0 + 8, 6, z0 + fd - 10, rail); box(4, H - 12, 3, x0 + fw - 12, 6, z0 + fd - 10, rail);
    // Glastür mit Scharnier links
    const door = new THREE.Group(); door.position.set(x0, 6, z0 + fd); rack.add(door);
    const dg = new THREE.MeshPhysicalMaterial({ color: dark() ? '#9fb4e0' : '#c9d6ee', metalness: .1, roughness: .04, transparent: true, opacity: .09, side: THREE.DoubleSide, depthWrite: false }); mats.push(dg);
    const pane = new THREE.Mesh(UNIT, dg); pane.scale.set(fw, H - 12, 1.2); door.add(pane);
    const de = new THREE.LineSegments(UNIT_EDGES, new THREE.LineBasicMaterial({ color: css('--accent'), transparent: true, opacity: .8 })); de.scale.copy(pane.scale); door.add(de); mats.push(de.material);
    const handle = new THREE.Mesh(UNIT, m); handle.scale.set(3, 40, 4); handle.position.set(fw - 12, H / 2 - 26, 1); door.add(handle);
    // Lichtleiste oben + Glow am Boden
    const strip = new THREE.MeshBasicMaterial({ color: css('--accent'), toneMapped: false, transparent: true }); mats.push(strip);
    box(fw - 20, 2.4, 2, x0 + 10, H - 10, z0 + fd - 4, strip);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(fw * 2.6, fd * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: css('--accent'), transparent: true, opacity: .22, depthWrite: false, toneMapped: false }));
    glow.position.set(RX, .5, RZ); rack.add(glow); mats.push(glow.material);
    const hb = new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial({ visible: false })); hb.scale.set(fw + 20, H + 10, fd + 20); hb.position.set(x0 - 10, 0, z0 - 10); hb.userData.id = '__rack'; rack.add(hb);
    const el = document.createElement('div'); el.className = 'l3 rk'; el.innerHTML = '<i></i><b></b><span></span>'; labels.appendChild(el);
    mats.forEach(x => { x.userData.base = x.opacity ?? 1; });
    R = { door, hb, el, mats, center: new THREE.Vector3(RX, H / 2, RZ), top: new THREE.Vector3(RX, H + 18, RZ), H, size: Math.max(fw, H, fd) };
    poseDirty = true;
  }
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const cl = v => Math.max(0, Math.min(1, v));
  function pose() {   // Stand der Explosion (prog 0 = Rack, 1 = alles verteilt) auf alle Geräte anwenden
    nodes.forEach(o => {
      if (!o.rk) return;
      const k = ease(cl((prog * 1.45 - o.delay))), lift = Math.sin(Math.PI * k) * 55;
      o.g.position.lerpVectors(o.rk.p, o.lay.p, k); o.g.position.y += lift;
      const s = o.rk.s + (1 - o.rk.s) * k; o.g.scale.setScalar(s); o.g.visible = s > .01; o.k = k;
    });
    if (R) { R.door.rotation.y = -1.85 * ease(cl(prog * 3));
      const f = 1 - cl((prog - .45) / .4); R.mats.forEach(m => { m.opacity = m.userData.base * f; }); rack.visible = f > 0.01; }
    const ef = cl((prog - .78) / .22); edges.forEach(x => { x.tube.visible = ef > 0; x.tube.material.opacity = x.tube.material.userData.base * (x.dim ? .2 : 1) * ef; x.ef = ef; });
  }
  function setExploded(on) {
    if (on === exploded) return; exploded = on; hooks.mode?.(on);
    if (on) fitAll(1500); else { hooks.pick(null); fitRack(1300); }
  }

  function apply(M, sel) {
    selId = sel;
    const rel = new Set(); if (sel) { rel.add(sel); M.E.forEach(e => { if (e.f === sel) rel.add(e.t); if (e.t === sel) rel.add(e.f); }); }
    for (const n of M.N) { const o = nodes.get(n.id); if (!o) continue; o.n = n; o.upd?.(n);
      const dim = sel && !rel.has(n.id); o.mats.forEach(m => { m.opacity = m.userData.base * (dim ? .22 : 1); });
      o.el.classList.toggle('dim', !!dim); o.el.classList.toggle('sel', n.id === sel);
      o.el.querySelector('i').style.background = css(stVar(n.st)); o.el.querySelector('b').textContent = n.label; o.el.querySelector('span').textContent = n.sub || '';
      o.el.title = n.label; }
    edges.forEach(x => { const m = M.E.find(e => e.f === x.e.f && e.t === x.e.t && e.port === x.e.port) || x.e; x.e = m;
      const dim = sel && m.f !== sel && m.t !== sel; x.dim = dim; x.tube.material.opacity = x.tube.material.userData.base * (dim ? .2 : 1) * (x.ef ?? 0);
      x.v = m.cls === 'tun' ? 40 : (speed(m.bps) ? 120 / speed(m.bps) : 0); x.w = (m.cls === 'tun' ? 2 : width(m.bps)) * .55;
      const c = color(COLVAR[m.cls]); if (dim) c.lerp(new THREE.Color(dark() ? '#141a28' : '#eef2f7'), .8);
      for (let i = 0; i < x.n; i++) packets.setColorAt(x.start + i, c); });
    if (packets.instanceColor) packets.instanceColor.needsUpdate = true;
    if (R) { const up = M.N.filter(n => n.st === 'ok').length; R.el.querySelector('i').style.background = css(up === M.N.length ? '--ok' : '--warn');
      R.el.querySelector('b').textContent = 'Homelab-Rack'; R.el.querySelector('span').textContent = `${up}/${M.N.length} aktiv · antippen zum Öffnen`; }
    ring.visible = !!sel && exploded; if (sel) { const n = nodes.get(sel)?.n; if (n) { const b = n.box, r = isGlobe(n) ? 60 : Math.hypot(b.w, b.d) / 2 + 16;
      ring.position.copy(isGlobe(n) ? W(b.x, b.y, .5) : W(b.x + b.w / 2, b.y + b.d / 2, (b.z || 0) + .5)); ring.scale.setScalar(r); } }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: css('--accent'), transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
  ring.visible = false; scene.add(ring);

  // ── Kamera ──
  let anim = null;
  function bounds() { const bb = new THREE.Box3(); nodes.forEach(o => bb.expandByPoint(center(o.n))); return bb; }
  // engerer der beiden Blickwinkel zählt (Hochformat am Handy!)
  const halfFov = () => { const v = THREE.MathUtils.degToRad(camera.fov) / 2; return Math.min(v, Math.atan(Math.tan(v) * camera.aspect)); };
  function fitRack(ms = 700) {
    if (!R) return; const d = Math.min(controls.maxDistance, R.size / Math.sin(halfFov()) * .8);
    fly(R.center.clone(), R.center.clone().add(new THREE.Vector3(.55, .42, 1).normalize().multiplyScalar(d)), ms);
  }
  function fitAll(ms) { fitCore(ms); }
  function fit(animate = true) { exploded ? fitCore(animate ? 700 : 0) : fitRack(animate ? 700 : 0); }
  function fitCore(ms) {
    const bb = bounds(); if (bb.isEmpty()) return;
    const c = bb.getCenter(new THREE.Vector3()), r = Math.max(200, bb.getSize(new THREE.Vector3()).length() / 2);
    const dist = Math.min(controls.maxDistance, r / Math.sin(halfFov()) * .8);
    const dir = new THREE.Vector3(.62, .72, .95).normalize();
    fly(c, c.clone().add(dir.multiplyScalar(dist)), ms);
  }
  function fly(target, pos, ms = 650) {
    if (!ms) { controls.target.copy(target); camera.position.copy(pos); controls.update(); return; }
    const t0 = performance.now(), ft = controls.target.clone(), fp = camera.position.clone();
    anim = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      controls.target.lerpVectors(ft, target, e); camera.position.lerpVectors(fp, pos, e); if (k >= 1) anim = null; };
  }
  function focus(id) {
    if (!exploded) { pendingFocus = id; return setExploded(true); }
    const o = nodes.get(id); if (!o) return;
    const b = o.n.box, c = center(o.n), size = isGlobe(o.n) ? 90 : Math.max(b.w, b.d, b.h);
    const off = camera.position.clone().sub(controls.target).normalize().multiplyScalar(Math.max(150, Math.min(700, size * 2.6)));
    fly(c, c.clone().add(off));
  }
  function zoom(f) { const off = camera.position.clone().sub(controls.target); const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() * f));
    fly(controls.target.clone(), controls.target.clone().add(off.setLength(d)), 280); }

  // ── Antippen = auswählen, Doppeltipp = hinfliegen ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null, lastTap = { t: 0, id: null };
  cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; anim = null; });
  cvs.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 400) return;
    const r = cvs.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (prog < .5) { if (R && ray.intersectObject(R.hb, false).length) setExploded(true); return; }
    const h = ray.intersectObjects(hit, false)[0], id = h?.object.userData.id || null;
    const now = performance.now(), dbl = now - lastTap.t < 320 && lastTap.id === id; lastTap = { t: now, id };
    if (dbl && id) focus(id); else hooks.pick(id);
  });

  // ── Größe, Bildrate, Schleife ──
  let w = 0, h = 0;
  function size() { const W0 = stage.clientWidth, H0 = stage.clientHeight; if (W0 === w && H0 === h) return; w = W0; h = H0; renderer.setSize(w, h, false); cvs.style.width = w + 'px'; cvs.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let raf = 0, last = 0, acc = 0, cnt = 0, running = true, lastAdapt = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!running || document.hidden) return;
    size();
    const dt = last ? t - last : 16; last = t;
    acc += dt; cnt++;
    if (t - lastAdapt > 1500 && cnt > 30) {   // Auflösung an Bildrate anpassen
      const avg = acc / cnt; acc = 0; cnt = 0; lastAdapt = t;
      const np = avg > 24 ? Math.max(1, pr - .25) : avg < 15 ? Math.min(maxPR, pr + .25) : pr;
      if (np !== pr) { pr = np; renderer.setPixelRatio(pr); w = 0; size(); }
    }
    const goal = exploded ? 1 : 0;
    if (prog !== goal) { prog = goal > prog ? Math.min(1, prog + dt / 1500) : Math.max(0, prog - dt / 1200); poseDirty = true;
      if (prog === 1 && pendingFocus) { const id = pendingFocus; pendingFocus = null; hooks.pick(id); focus(id); } }
    if (poseDirty) { poseDirty = false; pose(); }
    if (anim) anim(t);
    controls.update();
    // Sheet offen → Bildausschnitt verschieben, damit das Gerät sichtbar bleibt
    const off = hooks.offset(); if (off.x || off.y) camera.setViewOffset(w, h, off.x, off.y, w, h); else camera.clearViewOffset();
    // Pakete bewegen
    if (packets) {
      const s = t / 1000;
      for (const x of edges) {
        const L = x.len, dir = x.e.rev ? -1 : 1;
        for (let i = 0; i < x.n; i++) {
          if (!x.v) { m4.makeScale(0, 0, 0); packets.setMatrixAt(x.start + i, m4); continue; }
          let u = ((i * (L / x.n) + dir * s * x.v) % L + L) % L / L;
          x.curve.getPointAt(u, tmp); sc.setScalar(x.w * (x.ef ?? 0)); m4.compose(tmp, q, sc); packets.setMatrixAt(x.start + i, m4);
        }
      }
      packets.instanceMatrix.needsUpdate = true;
    }
    spins.forEach(o => { o.rotation.y = t / 9000; });
    ring.material.opacity = .55 + .35 * Math.sin(t / 300);
    // Schildchen über den Geräten
    if (R) { const show = prog < .25; R.el.style.display = show ? '' : 'none';
      if (show) { tmp.copy(R.top).project(camera); const x = (tmp.x * .5 + .5) * w, y = (-tmp.y * .5 + .5) * h; R.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`; } }
    nodes.forEach(o => {
      if ((o.k ?? 0) < .95) { if (o.el.style.display !== 'none') o.el.style.display = 'none'; return; }
      tmp.copy(o.top); const dist = tmp.distanceTo(camera.position); tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2 && dist < 2600;
      if (!vis) { if (o.el.style.display !== 'none') o.el.style.display = 'none'; return; }
      if (o.el.style.display === 'none') o.el.style.display = '';
      const x = (tmp.x * .5 + .5) * w, y = (-tmp.y * .5 + .5) * h, k = Math.max(.6, Math.min(1.15, 520 / dist));
      o.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%) scale(${k.toFixed(3)})`;
      o.el.style.zIndex = String(10000 - Math.round(dist));
    });
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  const mo = new MutationObserver(() => { theme(); if (lastM) { key = ''; update(lastM, selId); } }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let lastM = null, first = true;
  function update(M, sel) {
    lastM = M;
    const k = M.N.map(n => `${n.id}:${n.kind}:${n.box.x},${n.box.y},${n.box.z || 0},${n.box.w},${n.box.d},${n.box.h}:${n.disks?.length ?? ''}`).join('|') + '#' + M.E.map(e => `${e.f}>${e.t}:${e.port || ''}`).join('|');
    if (k !== key) { key = k; build(M); }
    apply(M, sel);
    if (first) { first = false; size(); pose(); fitRack(0); }
  }
  return {
    update, focus, zoom, fit: () => fit(true), rack: on => setExploded(!on), get exploded() { return exploded; },
    show(on) { running = on; cvs.style.display = labels.style.display = on ? '' : 'none'; if (on) { w = 0; size(); } },
  };
}
