/* =====================================================================
   DASHBOARD
   ===================================================================== */
let filter = 'all', query = '';

function weekCount(u) { const from = ago(7); return u.results.filter(r => !r.practice && r.ts >= from).length; }

function daysUntil(dateStr) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00') - start) / 864e5);
}

function renderHero() {
  const u = me(), st = accessState(u), first = u.name.split(' ')[0];
  const w = weekCount(u), shown = Math.min(w, WEEKLY_GOAL);
  setAvatar($('#userAvatar'), u);
  $('#userName').textContent = first;
  let pill, title, text, actions;
  if (st === 'active') {
    const def = u.plan ? plan(u.plan) : null;
    pill = def ? `Plan ${def.name}: te quedan ${fmtRemain(u.until - new Date())}` : 'Administrador';
    title = `Hola, ${first}. Practica como en el examen real.`;
    text = w >= WEEKLY_GOAL ? 'Cumpliste tu meta semanal. Sigue practicando para mantener el ritmo.' : `Vas ${w} de ${WEEKLY_GOAL} simulacros de tu meta de esta semana. ${WEEKLY_GOAL - w === 1 ? 'Uno más y la cumples.' : 'Cada simulacro cuenta.'}`;
    actions = '<button class="btn" type="button" data-start="quick">Iniciar simulacro rápido</button><button class="btn ghost" type="button" data-goto="res">Ver mis resultados</button>';
  } else if (hasPending(u)) {
    pill = 'Pago en revisión';
    title = `Hola, ${first}. Estamos revisando tu pago.`;
    text = (DB.settings.eta || '').trim() || 'Apenas confirmemos tu operación, activaremos tu acceso a los simulacros.';
    actions = '<button class="btn" type="button" data-plans>Elegir otro plan</button><button class="btn ghost" type="button" data-goto="res">Ver mis resultados</button>';
  } else {
    pill = st === 'expired' ? 'Tu plan venció' : 'Sin plan activo';
    title = `Hola, ${first}. Elige un plan para practicar.`;
    text = 'Con un plan accedes a todos los simulacros, a los bancos de preguntas y a tu historial.';
    actions = '<button class="btn" type="button" data-plans>Elegir plan</button><button class="btn ghost" type="button" data-goto="res">Ver mis resultados</button>';
  }
  $('#heroPill').textContent = pill;
  const ht = $('#heroTitle');
  ht.replaceChildren();
  title.split(' ').forEach((w, i) => {
    if (i) ht.append(' ');
    const s = document.createElement('span');
    s.className = w.includes(first) ? 'hero-name' : 'hw';
    s.textContent = w;
    ht.append(s);
  });
  $('#heroText').textContent = text; $('#heroActions').innerHTML = actions;

  // Cuenta regresiva hacia el examen del estudiante
  const gp = $('#goalPill'), g = u.goal;
  const d = g && g.date ? daysUntil(g.date) : -1;
  gp.hidden = d < 0;
  if (d >= 0) gp.textContent = d === 0 ? `Tu examen${g.uni ? ' ' + g.uni : ''} es hoy` : `${d === 1 ? 'Falta 1 día' : 'Faltan ' + d + ' días'} para tu examen${g.uni ? ' ' + g.uni : ''}`;

  // Aviso de vencimiento cercano (solo planes con vencimiento real; el admin no tiene plan)
  const ex = $('#expiry'), remaining = st === 'active' && u.until ? u.until - new Date() : NaN;
  const limit = u.plan === 'dia' ? 3 * 36e5 : 24 * 36e5;
  ex.hidden = !(st === 'active' && remaining <= limit);
  if (!ex.hidden) { const def = u.plan ? plan(u.plan) : null; ex.innerHTML = `<span class="notice-ico">${ICON.bell}</span><span>Tu plan ${def ? def.name : 'actual'} vence en ${fmtRemain(remaining)}. Renuévalo para no perder el ritmo.</span><button class="btn sm" type="button" data-plans>Renovar</button>`; }

  $('#ringBar').style.strokeDashoffset = 263.9 * (1 - shown / WEEKLY_GOAL);
  $('#ringNum').textContent = shown + '/' + WEEKLY_GOAL;
  $('#ring').setAttribute('aria-label', `${shown} de ${WEEKLY_GOAL} simulacros completados esta semana`);
  const r = u.results.filter(x => !x.practice), n = r.length;
  $('#statDone').textContent = n;
  $('#statAvg').textContent = n ? Math.round(r.reduce((a, b) => a + b.pct, 0) / n) + '%' : '-';
  $('#statBest').textContent = n ? Math.max(...r.map(x => x.pct)) + '%' : '-';
}

function renderExams() {
  const published = DB.exams.filter(e => e.published !== false);
  const tags = [...new Set(published.map(e => e.uni))];
  if (filter !== 'all' && !tags.includes(filter)) filter = 'all';
  $('#filters').innerHTML = ['all', ...tags].map(t => `<button class="chip-btn" type="button" data-f="${esc(t)}" aria-pressed="${t === filter}">${t === 'all' ? 'Todos' : esc(t)}</button>`).join('');
  const q = query.trim().toLowerCase();
  const list = published.filter(e => (filter === 'all' || e.uni === filter) && (!q || (e.title + ' ' + e.full + ' ' + e.uni).toLowerCase().includes(q)));
  $('#exams').innerHTML = list.length ? list.map(e => {
    const n = Math.min(e.count, e.poolIds.filter(id => Q(id)).length);
    return `<article class="card">
      <div class="card-top"><span class="tag">${esc(e.uni)}</span><span class="ico" aria-hidden="true">${ICON[examIcon(e)]}</span></div>
      <h3>${esc(e.title)}</h3>
      <p class="uni">${esc(e.full)}</p>
      <div class="meta">
        <span>${ICON.list}<b>${n}</b> preguntas</span>
        <span>${ICON.clock}<b>${fmtMins(e.mins)}</b></span>
      </div>
      <button class="btn block" type="button" data-start="${e.id}"${n ? '' : ' disabled'}>${n ? 'Iniciar examen' : 'Próximamente'}</button>
      ${n ? `<div class="card-links"><button class="link-btn" type="button" data-group-exam="${e.id}">Rendir en grupo</button><button class="link-btn" type="button" data-practice-exam="${e.id}">Practicar sin cronómetro</button></div>` : ''}
    </article>`;
  }).join('') : '<div class="empty">No hay simulacros que coincidan. Prueba con otro nombre o quita el filtro.</div>';
}

function resultRows(items) {
  if (!items.length) return '<li class="empty-li">Aún no rindes ningún simulacro. Inicia uno y tus resultados aparecerán aquí.</li>';
  return items.map(r => `
    <li class="result">
      <div><strong>${esc(r.name)}</strong>${r.practice ? ' <span class="tag">Práctica</span>' : ''}<small>${fmtDate(r.ts)}</small></div>
      <div class="meter" role="img" aria-label="${r.pct}% de aciertos"><i style="width:${r.pct}%"></i></div>
      <div class="score">${r.pct}%</div>
    </li>`).join('');
}
function renderLists() {
  const r = me().results;
  $('#recent').innerHTML = resultRows(r.slice(0, 3));
  $('#history').innerHTML = resultRows(r);
}

function renderBanks() {
  $('#banks').innerHTML = AREAS.map(a => {
    const qs = DB.questions.filter(q => q.area === a);
    return `<article class="card">
      <div class="card-top"><span class="tag">${qs.length} preguntas</span><span class="ico" aria-hidden="true">${ICON[AREA_ICON[a]]}</span></div>
      <h3>${a}</h3>
      <ul class="dif-list" aria-label="Preguntas por dificultad">${DIFS.map(([k]) => `<li>${difBadge(k)}<b class="num">${qs.filter(q => q.dif === k).length}</b></li>`).join('')}</ul>
      <button class="btn line block" type="button" data-practice="${esc(a)}"${qs.length ? '' : ' disabled'}>Practicar</button>
    </article>`;
  }).join('');
}

/* ---------- Recomendación y referidos ---------- */
function renderReco() {
  const u = me(), el = $('#reco');
  const ag = aggregate(u.results, 'areas');
  const weak = Object.entries(ag).filter(([, v]) => v.total >= 3)
    .map(([k, v]) => ({k, pct: Math.round(v.ok / v.total * 100), n: v.total})).sort((a, b) => a.pct - b.pct)[0];
  el.hidden = !weak;
  if (!weak) return;
  el.innerHTML = `<span class="reco-ico">${ICON.chart}</span>
    <div><h3>Te sugerimos practicar ${esc(weak.k)}</h3>
    <p>Aciertas el ${weak.pct} % de las preguntas de esta área (${weak.n} respondidas). Empieza con 10 preguntas sin cronómetro.</p></div>
    <button class="btn" type="button" data-practice-now="${esc(weak.k)}">Practicar ahora</button>`;
}

function renderRef() {
  const u = me(), friends = DB.users.filter(x => x.referredBy === u.id).length, days = DB.settings.referralDays;
  const msg = encodeURIComponent(`Practica para tu examen de admisión en Simulacros PE. Usa mi código ${u.refCode} al registrarte. ${location.origin}`);
  $('#refCard').innerHTML = `<span class="reco-ico">${ICON.gift}</span>
    <div><h3>Invita a un amigo</h3>
    <p>Cuando tu amigo compre el <strong>plan Mensual</strong> y lo aprobemos, ganas ${days} ${days === 1 ? 'día' : 'días'} de acceso. Solo aplica con pagos mensuales: los diarios o semanales no dan bono. ${friends ? `Ya se unieron ${friends} ${friends === 1 ? 'amigo' : 'amigos'} con tu código.` : ''}</p>
    <p class="ref-code">Tu código: <code>${esc(u.refCode)}</code></p></div>
    <div class="ref-actions"><button class="btn line sm" type="button" data-copy="${esc(u.refCode)}">Copiar código</button><a class="btn sm" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>`;
}

/* ---------- Simulacro personalizado ---------- */
const B = {areas:new Set(AREAS), difs:new Set(DIFS.map(d => d[0])), cursos:new Set(), temas:new Set(), n:10, practice:false};
const builderPool = () => DB.questions.filter(q =>
  B.areas.has(q.area) && B.difs.has(q.dif) &&
  (!B.cursos.size || B.cursos.has(q.curso)) && (!B.temas.size || B.temas.has(q.tema)));
const builderMins = n => Math.max(1, Math.round(n * DB.settings.minPerQ));
// El admin decide, chip por chip, si se muestra la cantidad de preguntas disponibles
const cnt = (show, n) => show ? `<span class="cnt">${n}</span>` : '';

function renderBuilder() {
  const S = DB.settings;
  $('#bAreas').innerHTML = AREAS.map(a => `<button class="chip-btn" type="button" data-barea="${esc(a)}" aria-pressed="${B.areas.has(a)}">${a}${cnt(S.showCountArea, DB.questions.filter(q => q.area === a && B.difs.has(q.dif)).length)}</button>`).join('');
  $('#bDifs').innerHTML = DIFS.map(([k, l]) => `<button class="chip-btn" type="button" data-bdif="${k}" aria-pressed="${B.difs.has(k)}">${l}${cnt(S.showCountDif, DB.questions.filter(q => q.dif === k && B.areas.has(q.area)).length)}</button>`).join('');

  // Cursos de las áreas elegidas (si no eliges ninguno, se usan todos)
  const cursos = [...new Set(DB.questions.filter(q => B.areas.has(q.area) && q.curso).map(q => q.curso))].sort();
  B.cursos.forEach(c => { if (!cursos.includes(c)) B.cursos.delete(c); });
  $('#bCursosWrap').hidden = !cursos.length;
  $('#bCursos').innerHTML = cursos.map(c => `<button class="chip-btn" type="button" data-bcurso="${esc(c)}" aria-pressed="${B.cursos.has(c)}">${esc(c)}${cnt(S.showCountCurso, DB.questions.filter(q => q.curso === c && B.areas.has(q.area) && B.difs.has(q.dif)).length)}</button>`).join('');

  // Temas del curso elegido (si no eliges ninguno, se usan todos los de las áreas/cursos activos)
  const temaBase = q => B.areas.has(q.area) && (!B.cursos.size || B.cursos.has(q.curso)) && q.tema;
  const temas = [...new Set(DB.questions.filter(temaBase).map(q => q.tema))].sort();
  B.temas.forEach(t => { if (!temas.includes(t)) B.temas.delete(t); });
  $('#bTemasWrap').hidden = !temas.length;
  $('#bTemas').innerHTML = temas.map(t => `<button class="chip-btn" type="button" data-btema="${esc(t)}" aria-pressed="${B.temas.has(t)}">${esc(t)}${cnt(S.showCountTema, DB.questions.filter(q => q.tema === t && temaBase(q) && B.difs.has(q.dif)).length)}</button>`).join('');

  const max = Math.min(builderPool().length, S.maxQ);
  $('#bCountWrap').hidden = !S.showQuestionSlider;
  B.n = S.showQuestionSlider ? (max ? Math.min(Math.max(B.n, 1), max) : 0) : max; // sin el control, siempre se usa el máximo disponible
  const r = $('#bRange'); r.min = max ? 1 : 0; r.max = max; r.value = B.n; r.disabled = !max;
  const presets = [5, 10, 20].filter(n => n < max);
  $('#bPresets').innerHTML = [...presets.map(n => `<button class="chip-btn" type="button" data-bn="${n}" aria-pressed="${B.n === n}">${n}</button>`), max ? `<button class="chip-btn" type="button" data-bn="${max}" aria-pressed="${B.n === max}">Todas (${max})</button>` : ''].join('');
  $('#bPractice').checked = B.practice;
  renderBuilderSummary();
}
function renderBuilderSummary() {
  const pool = builderPool().length;
  $('#bN').textContent = B.n; $('#sN').textContent = B.n;
  $('#sClock').innerHTML = ICON.clock;
  $('#sT').textContent = B.practice ? 'Sin límite' : (B.n ? fmtMins(builderMins(B.n)) : '0 min');
  $('#sTLabel').textContent = B.practice ? 'de tiempo. Verás la respuesta después de cada pregunta.' : 'de tiempo total';
  $('#sNote').textContent = pool ? `Hay ${pool} ${pool === 1 ? 'pregunta disponible' : 'preguntas disponibles'} con tu selección. Se eligen al azar.` : 'No hay preguntas con esa combinación. Amplía las áreas o la dificultad.';
  $('#bStart').textContent = B.practice ? 'Empezar práctica' : 'Iniciar simulacro personalizado';
  $('#bStart').disabled = !B.n;
}
function keepFocus(sel) { const el = document.querySelector(sel); if (el) el.focus(); }
function presetBuilder(area, practice = true) {
  B.areas = new Set([area]); B.difs = new Set(DIFS.map(d => d[0])); B.cursos = new Set(); B.temas = new Set(); B.practice = practice;
  showTab('eval');
  $('#builder').scrollIntoView({behavior:'smooth', block:'center'});
}

function renderDash() {
  renderHero(); renderExams(); renderBuilder(); renderLists(); renderBanks(); renderReco(); renderRef(); renderInsights();
}

function requireAccess() {
  const u = me();
  if (accessState(u) === 'active') return true;
  if (hasPending(u)) { toast('Tu pago sigue en revisión. Activaremos tu acceso apenas lo confirmemos.'); return false; }
  toast('Necesitas un plan activo para rendir simulacros.');
  showPlans();
  return false;
}
