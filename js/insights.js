/* =====================================================================
   ESTADÍSTICAS DEL ESTUDIANTE: evolución, aciertos por área, dificultad y curso, tiempo por pregunta
   (pestaña "Mis resultados")
   ===================================================================== */
function aggregate(results, key) {
  const out = {};
  results.filter(r => !r.practice).forEach(r => Object.entries(r[key] || {}).forEach(([k, v]) => {
    const a = out[k] || (out[k] = {ok:0, total:0});
    a.ok += v.ok; a.total += v.total;
  }));
  return out;
}

function evolutionSVG(asc) {
  const W = 640, Hh = 236, L = 44, R = 18, T = 18, Bm = 40, pw = W - L - R, ph = Hh - T - Bm;
  const x = i => L + (asc.length === 1 ? pw / 2 : i * pw / (asc.length - 1));
  const y = p => T + (1 - p / 100) * ph;
  const avg = asc.reduce((a, r) => a + r.pct, 0) / asc.length;
  const grid = [0, 25, 50, 75, 100].map(v => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-txt" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const pts = asc.map((r, i) => `${x(i).toFixed(1)},${y(r.pct).toFixed(1)}`).join(' ');
  const dots = asc.map((r, i) => `<circle class="ch-dot" cx="${x(i).toFixed(1)}" cy="${y(r.pct).toFixed(1)}" r="5"/>${i === asc.length - 1 || asc.length <= 6 ? `<text class="ch-val" x="${x(i).toFixed(1)}" y="${(y(r.pct) - 11).toFixed(1)}" text-anchor="${i === 0 && asc.length > 1 ? 'start' : i === asc.length - 1 && asc.length > 1 ? 'end' : 'middle'}">${r.pct}%</text>` : ''}`).join('');
  const labels = asc.map((r, i) => `<text class="ch-txt" x="${x(i).toFixed(1)}" y="${Hh - 14}" text-anchor="middle">${r.ts.getDate()}/${r.ts.getMonth() + 1}</text>`).join('');
  const label = `Evolución de tus últimos ${asc.length} simulacros: empezó en ${asc[0].pct}% y el último fue ${asc[asc.length - 1].pct}%. Promedio ${Math.round(avg)}%.`;
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(label)}">
    ${grid}
    <line class="ch-avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>
    ${asc.length > 1 ? `<polyline class="ch-line" points="${pts}"/>` : ''}${dots}${labels}</svg>`;
}

function barRows(map, order, labelFn) {
  const rows = order.filter(k => map[k] && map[k].total).map(k => {
    const v = map[k], p = Math.round(v.ok / v.total * 100);
    return `<div class="bar-row"><span class="bar-label">${labelFn(k)}</span><span class="meter" role="img" aria-label="${p}% de aciertos"><i style="width:${p}%"></i></span><b class="num">${p}%</b><small>${v.total} preg.</small></div>`;
  });
  return rows.length ? rows.join('') : '<p class="muted">Aún no hay datos suficientes.</p>';
}

function renderInsights() {
  const el = $('#insights'), all = me().results, r = all.filter(x => !x.practice);
  if (!r.length) { el.innerHTML = '<div class="section-head"><h2>Historial de simulacros</h2></div>'; return; }
  const asc = [...r].sort((a, b) => a.ts - b.ts).slice(-10);
  const byArea = aggregate(all, 'areas'), byDif = aggregate(all, 'difs'), byCurso = aggregate(all, 'cursos');
  const totalQ = r.reduce((a, x) => a + (x.total || 0), 0), totalT = r.reduce((a, x) => a + (x.used || 0), 0);
  const perQ = totalQ ? Math.round(totalT / totalQ) : 0;
  const cursosOrder = Object.keys(byCurso).sort((a, b) => byCurso[a].ok / byCurso[a].total - byCurso[b].ok / byCurso[b].total);
  const weakCursos = cursosOrder.filter(k => byCurso[k].total >= 3)
    .map(k => ({ k, p: Math.round(byCurso[k].ok / byCurso[k].total * 100), n: byCurso[k].total })).slice(0, 3);
  el.innerHTML = `
    <div class="section-head"><h2>Tu evolución</h2></div>
    <div class="insight-card">
      ${evolutionSVG(asc)}
      <p class="chart-note"><span class="lg lg-line"></span>Cada punto es un simulacro <span class="lg lg-avg"></span>Tu promedio</p>
    </div>
    <div class="insight-grid">
      <div class="insight-card"><h3>Aciertos por área</h3>${barRows(byArea, AREAS, k => esc(k))}</div>
      <div class="insight-card"><h3>Aciertos por dificultad</h3>${barRows(byDif, DIFS.map(d => d[0]), k => difBadge(k))}</div>
      <div class="insight-card">
        <h3>Tiempo por pregunta</h3>
        <p class="big">${perQ ? fmtDur(perQ) : '-'}</p>
        <p class="muted">en promedio, sin contar la práctica.</p>
        ${weakCursos.length ? `<h3 class="mt">Cursos por reforzar</h3>${weakCursos.map(t => `<div class="topic-row"><span>${esc(t.k)}</span><b class="num">${t.p}%</b><button class="link-btn" type="button" data-practice-curso="${esc(t.k)}">Practicar</button></div>`).join('')}` : ''}
      </div>
    </div>
    <div class="section-head"><h2>Historial de simulacros</h2></div>`;
}
