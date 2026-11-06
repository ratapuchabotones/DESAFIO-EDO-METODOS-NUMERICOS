'use strict';
/* ===== 1. DATOS (valores HIPOTÉTICOS Y DEMOSTRATIVOS) ===== */
const $ = i => document.getElementById(i);
const fx = (x, d = 4) => Number.isFinite(x) ? x.toFixed(d) : 'N/A';
const fe = x => Number.isFinite(x) ? (x === 0 ? '0' : x.toExponential(4)) : 'N/A';
const DEF = {
  carbon: { n: 'Adsorción con carbón activado', k: .45, Ce: 5, col: '#21B6B0', d: 'El carbón activado puede retener determinados contaminantes en su superficie mediante adsorción.' },
  coag: { n: 'Coagulación y floculación', k: .30, Ce: 8, col: '#E8B64B', d: 'Permite agrupar determinadas partículas y sustancias para facilitar su separación del agua.' },
  bio: { n: 'Proceso biológico', k: .15, Ce: 3, col: '#39A878', d: 'Ciertos microorganismos pueden contribuir a degradar contaminantes biodegradables.' }
};
const DV = { C0: 100, t0: 0, tf: 12, h1: 1, h2: .5 };
let P = structuredClone(DEF), cur = 'carbon', R = null, ch = {};

/* ===== 2. NÚCLEO MATEMÁTICO ===== */
// Partición del intervalo: el último paso se ajusta para llegar exactamente a tf
function grid(t0, tf, h) {
  const n = Math.floor((tf - t0) / h + 1e-9), t = [];
  for (let i = 0; i <= n; i++) t.push(t0 + i * h);
  if (tf - t[n] > 1e-9) t.push(tf); else t[n] = tf;
  return t;
}
// m = 'h' (Heun, RK2) | 'r' (RK4 clásico). f(t,C) = -k(C - Ce)
function solve(m, p, C0, ts) {
  const f = (t, C) => -p.k * (C - p.Ce), y = [C0], st = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t = ts[i], h = ts[i + 1] - t, c = y[i]; let k, yn;
    if (m === 'h') {
      const k1 = f(t, c), k2 = f(t + h, c + h * k1);
      k = [k1, k2]; yn = c + h / 2 * (k1 + k2);
    } else {
      const k1 = f(t, c), k2 = f(t + h / 2, c + h * k1 / 2), k3 = f(t + h / 2, c + h * k2 / 2), k4 = f(t + h, c + h * k3);
      k = [k1, k2, k3, k4]; yn = c + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    y.push(yn); st.push({ t, h, c, k, yn });
  }
  return { y, st };
}
const rel = (a, e) => Math.abs(e) < 1e-12 ? NaN : a / Math.abs(e) * 100;
const red = (C0, Cf) => C0 === 0 ? NaN : (C0 - Cf) / C0 * 100;
function analyze(p, c, h) {
  const ts = grid(c.t0, c.tf, h);
  const ex = ts.map(t => p.Ce + (c.C0 - p.Ce) * Math.exp(-p.k * (t - c.t0)));
  const H = solve('h', p, c.C0, ts), K = solve('r', p, c.C0, ts);
  const eh = ex.map((e, i) => Math.abs(e - H.y[i])), er = ex.map((e, i) => Math.abs(e - K.y[i]));
  return { h, ts, ex, H, K, eh, er, rh: eh.map((a, i) => rel(a, ex[i])), rr: er.map((a, i) => rel(a, ex[i])), mh: Math.max(...eh), mr: Math.max(...er) };
}

/* ===== 3. ENTRADAS Y VALIDACIÓN ===== */
function readCfg() {
  const g = i => { const s = $(i).value.trim(); return s === '' ? NaN : Number(s); };
  const e = [], bad = [];
  const c = { C0: g('C0'), t0: g('t0'), tf: g('tf'), h1: g('h1'), h2: g('h2') };
  const names = { C0: 'C₀', t0: 'Tiempo inicial', tf: 'Tiempo final', h1: 'h₁', h2: 'h₂', k: 'k', Ce: 'Cₑ' };
  const k = g('k'), Ce = g('Ce');
  for (const [n, v] of Object.entries({ ...c, k, Ce })) if (!Number.isFinite(v)) { e.push(`${names[n]} está vacío o no es un número válido.`); bad.push(n); }
  if (!e.length) {
    P[cur].k = k; P[cur].Ce = Ce;
    if (c.C0 < 0) { e.push('C₀ debe ser mayor o igual a cero.'); bad.push('C0'); }
    if (c.tf <= c.t0) { e.push('El tiempo final debe ser mayor que el tiempo inicial.'); bad.push('tf'); }
    for (const h of ['h1', 'h2']) {
      if (c[h] <= 0) { e.push(`${names[h]} debe ser mayor que cero.`); bad.push(h); }
      else if (c.tf > c.t0 && c[h] > c.tf - c.t0) { e.push(`${names[h]} no puede ser mayor que el intervalo de simulación.`); bad.push(h); }
      else if ((c.tf - c.t0) / c[h] > 20000) { e.push(`${names[h]} es demasiado pequeño (más de 20 000 pasos).`); bad.push(h); }
    }
    for (const key in P) {
      const p = P[key];
      if (p.k <= 0) e.push(`${p.n}: k debe ser mayor que cero.`);
      if (p.Ce < 0) e.push(`${p.n}: Cₑ debe ser mayor o igual a cero.`);
      if (p.Ce > c.C0) e.push(`${p.n}: Cₑ (${p.Ce}) no debe superar C₀ (${c.C0}) en un escenario de eliminación.`);
    }
  }
  ['C0', 't0', 'tf', 'h1', 'h2', 'k', 'Ce'].forEach(i => $(i).classList.toggle('bad', bad.includes(i)));
  return { c, e };
}

/* ===== 4. SIMULACIÓN ===== */
function simulate() {
  const { c, e } = readCfg(), box = $('err');
  box.hidden = !e.length;
  if (e.length) { box.innerHTML = '<b>Revisa los datos:</b><ul>' + e.map(x => `<li>${x}</li>`).join('') + '</ul>'; return; }
  const hmin = Math.min(c.h1, c.h2), all = {};
  for (const k in P) all[k] = analyze(P[k], c, hmin);
  R = { c, cur: [analyze(P[cur], c, c.h1), analyze(P[cur], c, c.h2)], all, hmin };
  const sel = $('hSel'), old = sel.value;
  sel.innerHTML = `<option value="0">h₁ = ${c.h1} h</option><option value="1">h₂ = ${c.h2} h</option>`;
  sel.value = old || '0';
  render();
}
const sel = () => R.cur[+$('hSel').value];
const finalOf = r => r.K.y[r.K.y.length - 1];

/* ===== 5. PRESENTACIÓN ===== */
function render() {
  const p = P[cur], c = R.c, fin = R.all[cur], Cf = finalOf(fin), s = sel();
  $('kC0').textContent = fx(c.C0, 2); $('kCf').textContent = fx(Cf, 3);
  $('kRed').textContent = Number.isFinite(red(c.C0, Cf)) ? fx(red(c.C0, Cf), 2) + '%' : 'N/A';
  $('kT').textContent = fx(c.tf - c.t0, 2); $('kTr').textContent = p.n;
  charts(); table(s); iter(s); conv(); cards(); monitor(); interp();
}
function ds(label, ts, ys, col, o = {}) {
  return { label, data: ts.map((t, i) => ({ x: t, y: ys[i] })), borderColor: col, backgroundColor: col, borderWidth: 2, pointRadius: o.pr ?? 0, borderDash: o.d || [], tension: 0 };
}
function mkChart(id, title, xl, yl) {
  return new Chart($(id), {
    type: 'line', data: { datasets: [] }, options: {
      responsive: true, maintainAspectRatio: false, parsing: false, interaction: { mode: 'nearest', intersect: false },
      scales: { x: { type: 'linear', title: { display: true, text: xl } }, y: { type: 'linear', title: { display: true, text: yl } } },
      plugins: { title: { display: true, text: title, color: '#e6f1f8', font: { size: 14 } }, legend: { labels: { color: '#cfe3f1' } } }
    }
  });
}
function charts() {
  if (!ch.a) {
    Chart.defaults.color = '#9fb6c8'; Chart.defaults.borderColor = 'rgba(159,182,200,.15)';
    ch.a = mkChart('c1', 'Comparación de métodos', 'Tiempo (h)', 'Concentración (mg/L)');
    ch.b = mkChart('c2', 'Comparación entre tratamientos (RK4)', 'Tiempo (h)', 'Concentración (mg/L)');
    ch.c = mkChart('c3', 'Errores absolutos de Heun y RK4', 'Tiempo (h)', 'Error absoluto (mg/L)');
  }
  const s = sel(), p = P[cur];
  ch.a.options.plugins.title.text = `Comparación de métodos · h = ${s.h} h`;
  ch.a.data.datasets = [ds('Analítica', s.ts, s.ex, '#21B6B0'), ds('Heun', s.ts, s.H.y, '#E8B64B', { pr: 4, d: [6, 4] }), ds('RK4', s.ts, s.K.y, '#7ddc9e', { pr: 3 })];
  const keys = $('cmp').value === 'all' ? Object.keys(P) : [cur];
  ch.b.data.datasets = keys.map(k => ds(P[k].n + ` (k=${P[k].k})`, R.all[k].ts, R.all[k].K.y, P[k].col, { pr: 2 }));
  const lg = $('logE').checked, z = v => lg && v <= 0 ? null : v;
  ch.c.options.scales.y.type = lg ? 'logarithmic' : 'linear';
  ch.c.data.datasets = [ds('Error Heun', s.ts, s.eh.map(z), '#E8B64B', { pr: 3 }), ds('Error RK4', s.ts, s.er.map(z), '#7ddc9e', { pr: 3 })];
  Object.values(ch).forEach(x => x.update());
}
function table(s) {
  $('tab').tBodies[0].innerHTML = s.ts.map((t, i) => `<tr><td>${fx(t, 4)}</td><td>${fx(s.ex[i], 8)}</td><td>${fx(s.H.y[i], 8)}</td><td>${fx(s.K.y[i], 8)}</td><td>${fe(s.eh[i])}</td><td>${fe(s.er[i])}</td><td>${Number.isFinite(s.rh[i]) ? fe(s.rh[i]) : 'N/A'}</td><td>${Number.isFinite(s.rr[i]) ? fe(s.rr[i]) : 'N/A'}</td></tr>`).join('');
}
function iter(s) {
  const p = P[cur], n = Math.min(4, s.H.st.length);
  let o = `f(t,C) = -${p.k}·(C - ${p.Ce}),  C0 = ${R.c.C0},  h = ${s.h}\n\n── HEUN ──\n`;
  for (let i = 0; i < n; i++) { const a = s.H.st[i]; o += `n=${i}: t=${fx(a.t, 4)}  C=${fx(a.c, 8)}\n  k1=${fx(a.k[0], 8)}\n  k2=${fx(a.k[1], 8)}\n  C(n+1)=C+(h/2)(k1+k2)=${fx(a.yn, 8)}\n`; }
  o += '\n── RK4 ──\n';
  for (let i = 0; i < n; i++) { const a = s.K.st[i]; o += `n=${i}: t=${fx(a.t, 4)}  C=${fx(a.c, 8)}\n  k1=${fx(a.k[0], 8)}  k2=${fx(a.k[1], 8)}\n  k3=${fx(a.k[2], 8)}  k4=${fx(a.k[3], 8)}\n  C(n+1)=C+(h/6)(k1+2k2+2k3+k4)=${fx(a.yn, 8)}\n`; }
  $('iter').textContent = o;
}
function conv() {
  const p = P[cur], c = R.c, L = c.tf - c.t0, rows = [];
  for (let h = L; h >= L / 64 - 1e-12 && rows.length < 7; h /= 2) { const r = analyze(p, c, h), i = r.ts.length - 1; rows.push({ h, a: r.eh[i], b: r.er[i] }); }
  $('conv').tBodies[0].innerHTML = rows.map(r => `<tr><td>${fx(r.h, 4)}</td><td>${fe(r.a)}</td><td>${fe(r.b)}</td><td>${r.a === r.b ? 'Igual' : r.a < r.b ? 'Heun' : 'RK4'}</td></tr>`).join('');
  $('convtxt').textContent = 'Prueba de convergencia: al dividir h entre 2, los errores de ambos métodos disminuyen (Heun ≈ O(h²), RK4 ≈ O(h⁴)).';
}
function cards() {
  const keys = $('cmp').value === 'all' ? Object.keys(P) : [cur], c = R.c;
  const rs = keys.map(k => ({ k, Cf: finalOf(R.all[k]) })), best = Math.min(...rs.map(r => r.Cf));
  $('cards').innerHTML = rs.map(r => {
    const p = P[r.k], rd = red(c.C0, r.Cf);
    return `<div class="tc ${rs.length > 1 && r.Cf === best ? 'best' : ''}" style="border-color:${p.col}"><b>${p.n}</b>k = ${p.k} h⁻¹ · Cₑ = ${p.Ce} mg/L<br>C₀ = ${fx(c.C0, 2)} → C_final ≈ ${fx(r.Cf, 3)} mg/L en ${fx(c.tf - c.t0, 2)} h<br>Reducción: <b style="display:inline">${Number.isFinite(rd) ? fx(rd, 2) + '%' : 'N/A'}</b></div>`;
  }).join('');
}
// Esquema de monitoreo: estaciones coloreadas según la concentración exacta en el instante elegido
const ST = [[70, 70], [150, 120], [230, 60], [300, 150], [390, 90], [470, 140], [110, 210], [200, 250], [320, 240], [430, 220], [520, 260], [540, 70], [60, 150], [260, 190]];
function monitor() {
  const c = R.c, p = P[cur], t = c.t0 + (+$('tsl').value / 1000) * (c.tf - c.t0);
  const C = p.Ce + (c.C0 - p.Ce) * Math.exp(-p.k * (t - c.t0)), lvl = c.C0 > 0 ? Math.min(1, C / c.C0) : 0;
  $('mlab').textContent = `t = ${fx(t, 2)} h · C(t) = ${fx(C, 3)} mg/L (analítica)`;
  let s = `<defs><radialGradient id="hz"><stop offset="0" stop-color="hsl(${130 * (1 - lvl)},80%,50%)" stop-opacity=".55"/><stop offset="1" stop-color="#14799a" stop-opacity=".05"/></radialGradient></defs>
  <path d="M20 40 Q150 10 300 40 T580 60 L580 270 Q420 295 300 270 T20 280Z" fill="#0d3b57" stroke="#1d4160" stroke-width="2"/>
  <ellipse cx="170" cy="130" rx="200" ry="120" fill="url(#hz)"/>`;
  ST.forEach(([x, y], i) => {
    const v = p.Ce + (C - p.Ce) * (0.7 + (i % 5) * 0.15), r = c.C0 > 0 ? Math.max(0, Math.min(1, v / c.C0)) : 0;
    s += `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#21B6B0" stroke-width="3"/><circle cx="${x}" cy="${y}" r="9" fill="hsl(${130 * (1 - r)},80%,50%)"><title>Estación ${i + 1}: ${fx(v, 2)} mg/L</title></circle>`;
  });
  $('mon').innerHTML = s;
}
function interp() {
  const p = P[cur], c = R.c, a = R.cur[0], b = R.cur[1], Cf = finalOf(R.all[cur]), rd = red(c.C0, Cf);
  const w = r => r.mh === r.mr ? 'ambos métodos por igual' : r.mh < r.mr ? 'Heun' : 'RK4';
  const lines = [
    `La concentración inicial era de ${fx(c.C0, 2)} mg/L.`,
    `Después de ${fx(c.tf - c.t0, 2)} h con «${p.n}» (k = ${p.k} h⁻¹, Cₑ = ${p.Ce} mg/L), la concentración estimada es de ${fx(Cf, 3)} mg/L.`,
    `Reducción estimada: ${Number.isFinite(rd) ? fx(rd, 2) + '%' : 'N/A'}.`,
    `Con h₁ = ${a.h} h: error absoluto máximo de Heun = ${fe(a.mh)} y de RK4 = ${fe(a.mr)}. En este ensayo, menor error: ${w(a)}.`,
    `Con h₂ = ${b.h} h: error absoluto máximo de Heun = ${fe(b.mh)} y de RK4 = ${fe(b.mr)}. En este ensayo, menor error: ${w(b)}.`,
    `Al pasar de h₁ a h₂, el error de Heun cambió de ${fe(a.mh)} a ${fe(b.mh)} y el de RK4 de ${fe(a.mr)} a ${fe(b.mr)}.`
  ];
  const keys = Object.keys(P), top = keys.reduce((m, k) => finalOf(R.all[k]) < finalOf(R.all[m]) ? k : m);
  lines.push(`Con estos parámetros hipotéticos, el escenario con menor concentración final fue «${P[top].n}» (${fx(finalOf(R.all[top]), 3)} mg/L). Esto no implica que sea siempre el más eficiente.`);
  lines.push('Aviso: reducir la concentración no garantiza que el agua sea potable.');
  $('interp').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
  $('concl').textContent = `La concentración decae de forma exponencial hacia Cₑ = ${p.Ce} mg/L. ${p.n} alcanza ${fx(Cf, 3)} mg/L en ${fx(c.tf - c.t0, 2)} h. Con h = ${b.h} h el error máximo de Heun es ${fe(b.mh)} y el de RK4 ${fe(b.mr)}; al reducir h los errores bajan, y en este ensayo ${w(b)} tuvo menor error. Los resultados dependen de parámetros hipotéticos.`;
}

/* ===== 6. EVENTOS ===== */
function loadTrat() {
  const p = P[cur]; $('k').value = p.k; $('Ce').value = p.Ce; $('tdesc').textContent = p.d;
}
$('trat').onchange = e => { const { c, e: er } = readCfg(); cur = e.target.value; loadTrat(); simulate(); };
$('run').onclick = simulate;
$('reset').onclick = () => {
  P = structuredClone(DEF); cur = 'carbon'; $('trat').value = cur;
  for (const k in DV) $(k).value = DV[k];
  loadTrat(); $('tsl').value = 0; simulate();
};
['hSel', 'cmp', 'logE'].forEach(i => $(i).onchange = () => R && render());
$('tsl').oninput = () => R && monitor();
document.querySelectorAll('.cfg input').forEach(i => i.addEventListener('keydown', e => e.key === 'Enter' && simulate()));

loadTrat(); simulate();
if (window.lucide) lucide.createIcons();
if (window.renderMathInElement) renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }], throwOnError: false });
