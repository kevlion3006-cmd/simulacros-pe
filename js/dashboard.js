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
  // La mascota se sortea aquí: como todo acceso al panel pasa por renderHero,
  // cambia sola en cada cambio de pantalla y también tras terminar un simulacro.
  pintarMascota(u, st, w);
  let pill, title, text, actions;
  if (st === 'active') {
    const def = u.plan ? plan(u.plan) : null;
    pill = def ? `Plan ${def.name}: te quedan ${fmtRemain(u.until - new Date())}` : 'Administrador';
    title = `Hola, ${first}. Practica como en el examen real.`;
    text = w >= WEEKLY_GOAL ? 'Cumpliste tu meta semanal. Sigue practicando para mantener el ritmo.' : `Vas ${w} de ${WEEKLY_GOAL} simulacros de tu meta de esta semana. ${WEEKLY_GOAL - w === 1 ? 'Uno más y la cumples.' : 'Cada simulacro cuenta.'}`;
    actions = '<button class="btn" type="button" data-start="quick">Iniciar simulacro<span class="largo"> rápido</span></button><button class="btn ghost" type="button" data-goto="res"><span class="largo">Ver mis</span> Resultados</button>';
  } else if (hasPending(u)) {
    pill = 'Pago en revisión';
    title = `Hola, ${first}. Estamos revisando tu pago.`;
    text = (DB.settings.eta || '').trim() || 'Apenas confirmemos tu operación, activaremos tu acceso a los simulacros.';
    actions = '<button class="btn" type="button" data-plans>Elegir otro plan</button><button class="btn ghost" type="button" data-goto="res"><span class="largo">Ver mis</span> Resultados</button>';
  } else {
    pill = st === 'expired' ? 'Tu plan venció' : 'Sin plan activo';
    title = `Hola, ${first}. Elige un plan para practicar.`;
    text = 'Con un plan accedes a todos los simulacros, a los bancos de preguntas y a tu historial.';
    actions = '<button class="btn" type="button" data-plans>Elegir plan</button><button class="btn ghost" type="button" data-goto="res"><span class="largo">Ver mis</span> Resultados</button>';
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
  const limit = periodoDePlan(u.plan) === 'dia' ? 3 * 36e5 : 24 * 36e5;
  ex.hidden = !(st === 'active' && remaining <= limit);
  if (!ex.hidden) { const def = u.plan ? plan(u.plan) : null; ex.innerHTML = `<span class="notice-ico">${ICON.bell}</span><span>Tu plan ${def ? def.name : 'actual'} vence en ${fmtRemain(remaining)}. Renuévalo para no perder el ritmo.</span><button class="btn sm" type="button" data-plans>Renovar</button>`; }

  $('#ringBar').style.strokeDashoffset = 263.9 * (1 - shown / WEEKLY_GOAL);
  $('#ringNum').textContent = shown + '/' + WEEKLY_GOAL;
  // El aria-label arranca con el texto que se ve dentro del anillo ("0/5") para
  // que las ayudas técnicas lo lean como el elemento que muestra.
  $('#ring').setAttribute('aria-label', `${shown}/${WEEKLY_GOAL} meta semanal: ${shown} de ${WEEKLY_GOAL} simulacros completados esta semana`);
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
  // Las cuentas se cuentan con las dificultades que su plan deja practicar:
  // de otro modo prometeríamos preguntas que el servidor no le va a dar.
  const permitidas = permitidasDe(me());
  $('#banks').innerHTML = AREAS.map(a => {
    const qs = DB.questions.filter(q => q.area === a && permitidas.includes(q.dif));
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

/* ---------- Simulacro personalizado ----------
   Un solo estado de selección: un Set de claves "área|curso|tema".
   Todo lo demás (casillas, globitos, etiquetas, resumen) se calcula de ahí. */
const B = { sel: new Set(), difs: new Set(DIFS.map(d => d[0])), n: 10, practice: false, open: '', cq: '',
  q: '',      // texto del buscador general (arriba del formulario)
  sheet: '',  // clave "área|curso" de la hoja de temas abierta (vacío = cerrada)
  sq: '',     // texto del buscador dentro de esa hoja
  unis: new Set() };  // universidades elegidas (vacío = todas, como "Todas")

// Colores de área y de dificultad (los mismos que la maqueta)
const AREA_COLOR = { 'Aptitud Académica': '#8b9bff', 'Matemáticas': '#ff9f43', 'Ciencias': '#2fcf8a', 'Humanidades': '#ff6fae' };
const DIFF_COLOR = { facil: '#5fd38d', intermedio: '#f2c14e', dificil: '#ff6b6b' };
const areaColor = a => AREA_COLOR[a] || 'var(--accent)';

const bKey = q => q.area + '|' + q.curso + '|' + q.tema;
const plur = (n, s, p) => `${n} ${n === 1 ? s : p}`;

/* Universidades.
   Las píldoras salen de los exámenes publicados (las mismas que filtran
   "Exámenes estándar") y de la columna "universidad" de cada pregunta
   (la que se clasifica al importar el CSV). La de una pregunta puede venir
   de los exámenes que la incluyen en su pool (poolIds), así que una misma
   pregunta puede servir para varias universidades y las que no están en
   ningún sitio solo aparecen con "Todas". */
const uniTags = () => {
  const s = new Set(DB.exams.filter(e => e.published !== false && e.uni).map(e => e.uni));
  for (const q of DB.questions) for (const u of (q.unis || [])) if (u) s.add(u);
  return [...s];
};

function mapaUnis() {
  const m = new Map();
  for (const e of DB.exams) {
    if (!e.uni) continue;
    for (const id of (e.poolIds || [])) {
      let s = m.get(id); if (!s) m.set(id, s = new Set());
      s.add(e.uni);
    }
  }
  // La universidad escrita en la pregunta se suma a la de sus exámenes.
  for (const q of DB.questions) {
    if (!q.unis || !q.unis.length) continue;
    let s = m.get(q.id); if (!s) m.set(q.id, s = new Set());
    for (const u of q.unis) s.add(u);
  }
  return m;
}

function pasaUni(q, mapa) {
  if (!B.unis.size) return true;          // "Todas": todo el banco
  const s = mapa.get(q.id);
  if (!s) return false;
  for (const u of s) if (B.unis.has(u)) return true;
  return false;
}

/* El filtro de dificultad sigue operando sobre las preguntas, igual que siempre.
   Como hoy ningún tema mezcla dificultades, es idéntico a filtrar por tema; y si
   algún día mezcla, limita las preguntas sin descartar el tema entero. */
/* Solo las preguntas que el nivel del plan deja practicar: el servidor hace
   el mismo filtro al crear el intento, aquí evita ofrecer lo que no se podrá. */
const builderPool = () => { const mu = mapaUnis(); return DB.questions.filter(q =>
  pasaUni(q, mu) && B.difs.has(q.dif) && difPermitida(q.dif) && (!B.sel.size || B.sel.has(bKey(q)))); };
const builderMins = n => Math.max(1, Math.round(n * DB.settings.minPerQ));

/* Índice real del banco: área -> curso -> tema. Se reconstruye en cada pintado y
   solo se dibuja el panel del área abierta, nunca todos los temas a la vez. */
function bIndex() {
  const areas = new Map();
  const mu = mapaUnis();
  for (const q of DB.questions) {
    if (!pasaUni(q, mu)) continue;   // solo lo que llega de las universidades elegidas
    const an = q.area || '(sin área)';
    let A = areas.get(an);
    if (!A) { A = { name: an, cursos: new Map(), nTemas: 0, sel: 0 }; areas.set(an, A); }
    const cn = q.curso || '(sin curso)';
    let C = A.cursos.get(cn);
    if (!C) { C = { name: cn, area: an, k: an + '|' + cn, temas: new Map(), sel: 0 }; A.cursos.set(cn, C); }
    const tn = q.tema || '(sin tema)', tk = C.k + '|' + tn;
    let T = C.temas.get(tn);
    if (!T) { T = { name: tn, key: tk, preg: 0 }; C.temas.set(tn, T); A.nTemas++; }
    T.preg++;
    if (B.sel.has(tk)) { C.sel++; A.sel++; }
  }
  const orden = AREAS.filter(n => areas.has(n)).map(n => areas.get(n));
  areas.forEach((v, n) => { if (!AREAS.includes(n)) orden.push(v); });
  return orden;
}
const cursoKeys = c => [...c.temas.keys()].map(t => c.k + '|' + t);
const areaKeys = A => [...A.cursos.values()].flatMap(cursoKeys);
function findCurso(k) {
  const i = k.indexOf('|');
  const A = bIndex().find(x => x.name === k.slice(0, i));
  return A ? A.cursos.get(k.slice(i + 1)) : null;
}
const estado = (k, total) => k === 0 ? '' : (k === total ? 'all' : 'some');
function toggleKeys(keys) {
  const todas = keys.every(k => B.sel.has(k));
  keys.forEach(k => todas ? B.sel.delete(k) : B.sel.add(k));
}
function focusB(attr, val) {
  for (const el of document.querySelectorAll('#builder [data-' + attr + ']'))
    if (el.getAttribute('data-' + attr) === val) { el.focus(); break; }
}

/* ---------- Hoja de temas ---------- */
const cursoTemas = c => [...c.temas.values()];

/* Pinta el panel lateral (o bottom-sheet en celular) con los temas de un curso.
   Solo se dibujan los de ese curso: nunca el banco entero. Aquí NO aparece la
   dificultad: es una propiedad de los problemas, no de los temas. */
function renderSheet() {
  const ov = $('#ov');
  const C = B.sheet ? findCurso(B.sheet) : null;
  if (!C) { ov.hidden = true; ov.innerHTML = ''; return; }

  const k = areaColor(C.area), total = C.temas.size;
  const lista = cursoTemas(C), elegidos = lista.filter(t => B.sel.has(t.key)).length;
  const q = B.sq.trim().toLowerCase();
  const ts = q ? lista.filter(t => t.name.toLowerCase().includes(q)) : lista;

  ov.hidden = false;
  ov.innerHTML = `<div class="sh" style="--k:${k}" role="dialog" aria-modal="true"
      aria-label="Temas de ${esc(C.name)}, ${esc(C.area)}">
    <div class="sh-h">
      <button class="sh-x" type="button" data-cl="1" aria-label="Cerrar la lista de temas">&lsaquo;</button>
      <b>${esc(C.name)}<small>${esc(C.area)} · ${plur(total, 'tema', 'temas')}</small></b>
    </div>
    <div class="sh-b">
      <input class="sh-input" id="shQ" type="search" value="${esc(B.sq)}"
        placeholder="Buscar tema" aria-label="Buscar tema en ${esc(C.name)}">
      <div class="sh-chips" style="--k:${k}">
        <button class="sh-chip" type="button" data-qa="all">Todos</button>
        <button class="sh-chip" type="button" data-qa="none">Ninguno</button>
      </div>
    </div>
    <div class="sh-list">${ts.map(t => {
      const on = B.sel.has(t.key);
      return `<button class="sh-row" type="button" style="--k:${k}"
          data-t="${esc(t.key)}" aria-pressed="${on}">
        <span class="sh-ck ${on ? 'all' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>
        <span class="sh-nm">${esc(t.name)}</span>
      </button>`;
    }).join('') || '<p class="hint">Sin resultados.</p>'}</div>
    <div class="sh-f"><span><b>${elegidos}</b> de ${plur(total, 'tema', 'temas')} seleccionados</span>
      <button class="btn" type="button" data-cl="1">Listo</button></div>
  </div>`;
}

/* Buscador general. Recorre los temas de todo el banco y ofrece los primeros
   12 como etiquetas que se marcan de un clic, sin abrir el panel del área. */
function renderBSearch(q, idx) {
  const box = $('#bResults');
  if (!q) { box.hidden = true; box.innerHTML = ''; return; }
  const res = [];
  for (const A of idx) for (const c of A.cursos.values()) for (const t of c.temas.values())
    if ((t.name + c.name).toLowerCase().includes(q)) res.push([A, c, t]);
  box.hidden = false;
  if (!res.length) { box.innerHTML = '<p class="hint">No hay resultados.</p>'; return; }
  box.innerHTML = `<p class="hint">${plur(res.length, 'resultado', 'resultados')}${
      res.length > 12 ? ' · mostrando 12, escribe más para afinar' : ''}</p>
    <div class="bd-rl">${res.slice(0, 12).map(([A, c, t]) => {
      const on = B.sel.has(t.key);
      return `<button class="bd-r ${on ? 'on' : ''}" type="button" style="--k:${areaColor(A.name)}"
          data-t="${esc(t.key)}" aria-pressed="${on}">${esc(t.name)} <small>· ${esc(c.name)}</small></button>`;
    }).join('')}</div>`;
}

/* Abrir/cerrar la hoja. Al cerrar, el foco vuelve al botón "Temas ›" que la abrió. */
function openSheet(key) {
  B.sheet = key; B.sq = '';
  renderBuilder();
  const s = $('#shQ'); if (s) s.focus();
}
function closeSheet() {
  if (!B.sheet) return;
  const key = B.sheet;
  B.sheet = ''; B.sq = '';
  renderBuilder();
  focusB('btemas', key);
}
function toggleTema(k) { B.sel.has(k) ? B.sel.delete(k) : B.sel.add(k); }

/* Atajos de la hoja: "Todos" y "Ninguno" sobre todo el curso. Aquí no se filtra
   por dificultad, porque la dificultad es de los problemas, no de los temas. */
function bulkTema(mode, cursoKey) {
  const C = findCurso(cursoKey); if (!C) return;
  const ks = cursoKeys(C);
  ks.forEach(k => mode === 'all' ? B.sel.add(k) : B.sel.delete(k));
}
function focusSh(attr, val) {
  for (const el of document.querySelectorAll('#ov [data-' + attr + ']'))
    if (el.getAttribute('data-' + attr) === val) { el.focus(); break; }
}

/* Píldoras de universidad: las mismas que filtran "Exámenes estándar", pero aquí
   se pueden elegir varias a la vez. "Todas" vacía el filtro. */
function renderBUnis() {
  const tags = uniTags();
  $('#bUniWrap').hidden = !tags.length;
  const on = t => t === 'all' ? !B.unis.size : B.unis.has(t);
  $('#bUnis').innerHTML = ['all', ...tags].map(t =>
    `<button class="chip-btn" type="button" data-buni="${esc(t)}" aria-pressed="${on(t)}">${t === 'all' ? 'Todas' : esc(t)}</button>`).join('');
}

/* Al cambiar de universidad se descartan los temas elegidos que esa combinación
   no trae: lo que ves en pantalla y lo que se rinde tienen que coincidir. */
function toggleUni(code) {
  if (code === 'all') B.unis.clear();
  else B.unis.has(code) ? B.unis.delete(code) : B.unis.add(code);
  const validos = new Set();
  bIndex().forEach(A => A.cursos.forEach(c => c.temas.forEach(t => validos.add(t.key))));
  [...B.sel].forEach(k => { if (!validos.has(k)) B.sel.delete(k); });
}

function renderBuilder() {
  const S = DB.settings, idx = bIndex();
  const q = B.q.trim().toLowerCase();
  renderBUnis();

  /* Tarjetas de área (una por área, con su color). Si hay texto en el buscador
     general se ocultan y se pintan los resultados en su lugar. */
  $('#bAreas').hidden = !!q;
  $('#bAreas').innerHTML = idx.map(A => `
    <button class="bd-ac ${B.open === A.name ? 'open' : ''}" type="button" style="--k:${areaColor(A.name)}"
      data-bopen="${esc(A.name)}" aria-expanded="${B.open === A.name}" aria-controls="bPanel">
      <b>${esc(A.name)}</b>
      <small>${plur(A.cursos.size, 'curso', 'cursos')} · ${plur(A.nTemas, 'tema', 'temas')}</small>
      ${A.sel ? `<em>${A.sel}<span class="vh"> temas elegidos</span></em>` : ''}
    </button>`).join('');

  /* Panel del área abierta: solo esa se pinta */
  const A = (!q && B.open) ? idx.find(x => x.name === B.open) : null;
  const panel = $('#bPanel');
  if (!A) { panel.innerHTML = ''; }
  else {
    const lista = [...A.cursos.values()].filter(c => !B.cq || c.name.toLowerCase().includes(B.cq.toLowerCase()));
    panel.innerHTML = `<div class="bd-panel" style="--k:${areaColor(A.name)}">
      <div class="bd-ph">
        <span>${esc(A.name)}</span>
        <small>Toda el área</small>
        <button class="bd-ck ${estado(A.sel, A.nTemas)}" type="button" data-bsarea="${esc(A.name)}"
          aria-label="Seleccionar o quitar todo el área de ${esc(A.name)}">${A.sel === 0 ? '' : (A.sel === A.nTemas ? '✓' : '–')}</button>
      </div>
      ${A.cursos.size > 6 ? `<input class="bd-sr" id="bCq" type="search" value="${esc(B.cq)}"
        placeholder="Buscar curso en ${esc(A.name)}" aria-label="Buscar curso en ${esc(A.name)}">` : ''}
      <div class="bd-crl">${lista.map(c => {
        const k = c.sel, tot = c.temas.size;
        return `<div class="bd-cri" style="--k:${areaColor(A.name)}">
          <button class="bd-ck ${estado(k, tot)}" type="button" data-bscurso="${esc(c.k)}"
            aria-label="Seleccionar o quitar todo el curso ${esc(c.name)}">${k === 0 ? '' : (k === tot ? '✓' : '–')}</button>
          <span title="${esc(c.name)}">${esc(c.name)} <small>${k ? `${k}/${tot}` : plur(tot, 'tema', 'temas')}</small></span>
          <button class="bd-mini" type="button" data-btemas="${esc(c.k)}"
            aria-expanded="${B.sheet === c.k}" aria-label="Elegir temas de ${esc(c.name)}">Temas &rsaquo;</button>
        </div>`;
      }).join('') || '<p class="note" style="margin:8px 0 0">Sin cursos con ese nombre.</p>'}</div>
    </div>`;
  }

  renderBSearch(q, idx);

  /* Tu selección, agrupada por curso */
  const mine = $('#bMine'), grupos = [];
  idx.forEach(A2 => A2.cursos.forEach(c => { if (c.sel) grupos.push([A2.name, c]); }));
  if (!grupos.length) { mine.hidden = true; mine.innerHTML = ''; }
  else {
    mine.hidden = false;
    mine.innerHTML = `<p>Tu selección · ${plur(grupos.length, 'curso', 'cursos')}, ${plur(B.sel.size, 'tema', 'temas')}</p>
      <div class="bd-chips">${grupos.map(([an, c]) => `
        <span class="bd-gc" style="--k:${areaColor(an)}">
          <button class="bd-c on" type="button" data-btemas="${esc(c.k)}">${esc(c.name)} · ${c.sel === c.temas.size ? 'completo' : `${c.sel}/${c.temas.size}`}</button>
          <button class="bd-c on" type="button" data-brm="${esc(c.k)}" aria-label="Quitar ${esc(c.name)}">✕</button>
        </span>`).join('')}</div>`;
  }

  /* Dificultad: el nivel del plan decide qué botones se pueden usar.
     Las que no incluye quedan marcadas y sin posibilidad de activarse. */
  const permitidas = permitidasDe(me());
  [...B.difs].forEach(d => { if (!permitidas.includes(d)) B.difs.delete(d); });
  if (!B.difs.size) permitidas.forEach(d => B.difs.add(d));
  $('#bDifs').innerHTML = DIFS.map(([k, l]) => {
    const dentro = permitidas.includes(k), on = dentro && B.difs.has(k);
    return `<button class="bd-d${on ? ' on' : ''}${dentro ? '' : ' locked'}" type="button" style="--k:${DIFF_COLOR[k]}"
      data-bdif="${k}" aria-pressed="${on}"${dentro ? '' : ' aria-disabled="true"'}>${l}</button>`;
  }).join('');
  const pista = $('#bDifsHint');
  if (pista) {
    const fuera = DIFS.filter(([k]) => !permitidas.includes(k)).map(([, l]) => l);
    pista.hidden = !fuera.length;
    if (fuera.length) {
      const def = me() && me().plan ? plan(me().plan) : null;
      pista.textContent = `${fuera.join(' y ')} ${fuera.length > 1 ? 'quedan' : 'queda'} fuera de tu plan${def ? ' ' + def.name : ''}. `
        + 'Con el plan Completo practicas las 3 dificultades.';
    }
  }

  /* Cantidad: nunca por encima de lo disponible ni de maxQ */
  const max = Math.min(builderPool().length, S.maxQ);
  B.n = S.showQuestionSlider ? (max ? Math.min(Math.max(B.n, 1), max) : 0) : max;
  $('#bQtyWrap').hidden = !S.showQuestionSlider;
  $('#bN').textContent = B.n;
  $('#bMinus').disabled = B.n <= 1;
  $('#bPlus').disabled = B.n >= max;
  $('#bPresets').innerHTML = [5, 10, 20, 50].map(n =>
    `<button class="bd-chip ${B.n === n ? 'on' : ''}" type="button" data-bn="${n}"
      aria-pressed="${B.n === n}">${n}</button>`).join('');

  /* Modo */
  $('#bMode').innerHTML = [['Examen', 'con cronómetro'], ['Práctica', 'respuesta después de cada pregunta']]
    .map(([t, d]) => {
      const on = B.practice === (t === 'Práctica');
      return `<button class="bd-s ${on ? 'on' : ''}" type="button" data-bmode="${t}" aria-pressed="${on}"><b>${t}</b>${d}</button>`;
    }).join('');

  renderBuilderSummary();
  renderSheet();
}
function renderBuilderSummary() {
  const pool = builderPool().length;
  $('#bN').textContent = B.n; $('#sN').textContent = B.n;
  $('#sClock').innerHTML = ICON.clock;
  $('#sT').textContent = B.practice ? 'Sin límite' : (B.n ? fmtMins(builderMins(B.n)) : '0 min');
  $('#sTLabel').textContent = B.practice ? 'de tiempo. Verás la respuesta después de cada pregunta.' : 'de tiempo total';
  $('#sNote').textContent = pool
    ? `Hay ${pool} ${pool === 1 ? 'pregunta disponible' : 'preguntas disponibles'} con tu selección. Se eligen al azar.`
    : 'Con estos filtros no hay preguntas. Prueba quitando alguno.';
  // Mismo texto que usan las tarjetas de "Exámenes estándar": la acción es la misma.
  $('#bStart').textContent = B.practice ? 'Empezar práctica' : 'Iniciar examen';
  $('#bStart').disabled = !B.n;
}
function keepFocus(sel) { const el = document.querySelector(sel); if (el) el.focus(); }
function presetBuilder(area, practice = true) {
  const A = bIndex().find(x => x.name === area);
  B.sel = new Set(A ? areaKeys(A) : []);
  B.difs = new Set(DIFS.map(d => d[0]));
  B.open = area; B.cq = ''; B.practice = practice;
  // El buscador general se limpia: si dejara texto, las tarjetas de área seguirían ocultas.
  B.q = ''; const bq = $('#bQ'); if (bq) bq.value = '';
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
