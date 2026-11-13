// Kleine Helfer für Viewer + Editor.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const patch = (el, html) => { if (el && el._h !== html) { el.innerHTML = html; el._h = html; } };
function bytes(b, d = 1) { if (b == null || isNaN(b)) return '–'; const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let i = 0; while (Math.abs(b) >= 1024 && i < u.length - 1) { b /= 1024; i++; } return b.toFixed(i < 2 ? 0 : d) + ' ' + u[i]; }
function bits(Bps) { let b = (Bps || 0) * 8; const u = ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s']; let i = 0; while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; } return (b < 10 && i ? b.toFixed(1) : Math.round(b)) + ' ' + u[i]; }
function poll(render, ms = 3000) {
  let fails = 0;
  const tick = async () => {
    try { const r = await fetch('/api/state', { cache: 'no-store' }); render(await r.json(), null); fails = 0; }
    catch (e) { if (++fails > 2) render(null, 'Server nicht erreichbar – neuer Versuch …'); }
    setTimeout(tick, ms);
  };
  tick();
}
// Farbschema: Auto (System) → Dunkel → Hell
(() => {
  try { const t = localStorage.getItem('pt.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  const qs = new URLSearchParams(location.search).get('theme'); if (qs === 'dark' || qs === 'light') document.documentElement.dataset.theme = qs;
  addEventListener('DOMContentLoaded', () => {
    const tb = $('theme'); if (!tb) return;
    const MODES = [['', 'Auto', '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'], ['dark', 'Dunkel', '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>'], ['light', 'Hell', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>']];
    const draw = () => { const m = MODES.find(x => x[0] === (document.documentElement.dataset.theme || '')) || MODES[0]; tb.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${m[2]}</svg>`; tb.title = 'Farbschema: ' + m[1]; };
    tb.addEventListener('click', () => { const cur = document.documentElement.dataset.theme || ''; const next = MODES[(MODES.findIndex(x => x[0] === cur) + 1) % MODES.length][0];
      if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
      try { next ? localStorage.setItem('pt.theme', next) : localStorage.removeItem('pt.theme'); } catch {} draw(); });
    draw();
  });
})();
