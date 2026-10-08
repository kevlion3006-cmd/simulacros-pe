/* =====================================================================
   EXAMEN (simulacro cronometrado y modo práctica)
   ===================================================================== */
let S = null;                 // intento en curso
const ATT_KEY = 'spe.attempt'; // copia local del intento, para retomarlo si se recarga la página

/* ---------------------------------------------------------------------
   EXÁMENES ESTÁNDAR: sorteo individual o por código de grupo
   - Individual (por defecto): cada vez que el estudiante inicia el examen se sortean
     preguntas, orden y alternativas al azar, solo para él.
   - En grupo: el código de grupo es la "semilla". Todos los que entren con el mismo
     código obtienen exactamente el mismo examen (mismas preguntas, mismo orden y mismo
     orden de alternativas), sin necesidad de un servidor que los sincronice.
   - Personalizado en grupo: el banco lo elige quien arma el simulacro, así que las
     preguntas exactas viajan guardadas en el servidor con el código (/grupos) y el
     código sigue siendo la semilla del orden. No se usa en las prácticas.
   --------------------------------------------------------------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffleWith(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const normGroupCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function randomGroupCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0 ni 1 para no confundir al dictarlo
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// Devuelve copias de las preguntas ya sorteadas, ordenadas y con las alternativas revueltas.
// q._perm guarda cómo se revolvieron las alternativas (para poder retomar el examen tras recargar).
function pickExamQuestions(ex, groupCode) {
  const pool = ex.poolIds.map(Q).filter(Boolean);
  const n = Math.min(ex.count || pool.length, pool.length);
  const code = normGroupCode(groupCode);
  const qRand = code ? mulberry32(hashSeed(ex.id + '|' + code)) : Math.random;
  const aRand = code ? mulberry32(hashSeed(ex.id + '|' + code + '|alt')) : Math.random;
  const qs = shuffleWith(pool, qRand).slice(0, n).map(q => ({...q}));
  qs.forEach(q => {
    const perm = shuffleWith([0, 1, 2, 3], aRand);   // perm[i] = índice original de la alternativa que se muestra en la posición i
    q._perm = perm;
    q.o = perm.map(i => q.o[i]);
    q.c = perm.indexOf(q.c);
  });
  return qs;
}

function makeRandomExam({title, uni, n, pool}) {
  const ids = shuffle((pool || DB.questions).map(q => q.id)).slice(0, n);
  return {id:'custom', uni, title, full:'', mins:builderMins(ids.length), ids};
}
function startById(id, opts) {
  if (id === 'quick') return startExam(makeRandomExam({title:'Simulacro rápido', uni:'Mixto', n:5}), opts);
  const ex = DB.exams.find(e => e.id === id); if (ex) startExam(ex, opts);
}
function practiceArea(area, n = 10) {
  const pool = DB.questions.filter(q => q.area === area);
  startExam(makeRandomExam({title:`Práctica de ${area}`, uni:'Práctica', n, pool}), {practice:true, area});
}
function practiceCurso(curso, n = 10) {
  const pool = DB.questions.filter(q => q.curso === curso);
  startExam(makeRandomExam({title:`Práctica de ${curso}`, uni:'Práctica', n, pool}), {practice:true, curso});
}

const todayAttempts = u => u.results.filter(r => !r.practice && sameDay(r.ts, new Date())).length;

async function startExam(ex, opts = {}) {
  const practice = !!opts.practice, trial = !!opts.trial;
  // El código de grupo vale para el catálogo (semilla sobre poolIds) y para el
  // personalizado (sus ids ya vienen del grupo guardado en el servidor).
  const groupCode = (ex.poolIds || ex.id === 'custom') && !practice && !trial
    ? normGroupCode(opts.groupCode) : '';
  if (!trial) {
    if (!requireAccess()) return;
    if (!practice && todayAttempts(me()) >= DB.settings.maxPerDay) {
      toast(`Llegaste al límite de ${DB.settings.maxPerDay} simulacros por día. La práctica sin cronómetro sigue disponible.`);
      return;
    }
  }
  // Exámenes del catálogo (tienen banco): sorteo individual o por código de grupo.
  // El personalizado entra con los ids que ya trae el grupo; el rápido y las
  // prácticas siguen exactamente como antes.
  const qs = ex.poolIds ? pickExamQuestions(ex, groupCode) : ex.ids.map(Q).filter(Boolean).map(q => ({...q}));
  if (!qs.length) { toast('Este examen aún no tiene preguntas.'); return; }
  const now = Date.now();
  S = {
    exam:ex, active:true, practice, trial, groupCode, cur:0, qs,
    ans:qs.map(() => null), checked:qs.map(() => false), flags:qs.map(() => false),
    startedAt:now, deadline: practice ? null : now + ex.mins * 60000, left: practice ? null : ex.mins * 60,
    timer:null, dirty:false
  };
  track('exam_started', {mode: trial ? 'trial' : practice ? 'practice' : groupCode ? 'group' : ex.id === 'custom' ? 'custom' : 'standard'});
  // Con servidor: crea el intento y usa el sorteo del día del backend
  if (API.online && !trial) {
    try {
      if (!await sincronizarIntento(ex, opts)) S.intentoId = null;
    } catch (err) {
      S.intentoId = null;
      if (!err.red) { // el servidor rechazó el intento (sin acceso, sin preguntas, etc.)
        S = null;
        toast(err.message);
        return;
      }
      // sin conexión: continúa en local (modo demo)
    }
  }
  begin();
}

/* ---------- Intento en el servidor (API) ---------- */
async function sincronizarIntento(ex, opts) {
  let payload;
  if (opts.practice) {
    payload = opts.area ? {modo: 'practica', area: opts.area} : {modo: 'practica', curso: opts.curso};
  } else if (ex.dbId) {
    payload = {modo: 'simulacro', examen_id: ex.dbId};
  } else {
    // ejercitador / examen rápido: el cliente elige las preguntas
    const ids = S.qs.map(q => q.dbId).filter(id => id != null);
    if (!ids.length) return false;
    payload = {modo: 'libre', preguntas: ids};
  }
  const r = await apiCrearIntento(payload);
  S.intentoId = r.intento_id;
  const pq = await apiPreguntasIntento(S.intentoId);
  return aplicarSorteoServidor(pq.preguntas || []);
}

// Reemplaza S.qs por el sorteo del servidor (mismo set para todos los del día).
// Conserva el contenido local (con su respuesta correcta) y alinea las alternativas visibles.
function aplicarSorteoServidor(filas) {
  if (!Array.isArray(filas) || !filas.length || !S || !S.qs.length) return false;
  const originales = S.qs.slice();
  const nuevas = [];
  filas.forEach(fila => {
    const clave = fila.clave || (DB.qmapInv && DB.qmapInv[fila.pregunta_id]) || null;
    const enLocal = originales.find(x => x.dbId === fila.pregunta_id || (clave && x.id === clave));
    const base = clave ? Q(clave) : null;
    if (!base && !enLocal) return; // sin contenido local no se puede puntuar
    const altOrig = (fila.alternativas || []).map(a => a.id);
    let q;
    if (base) {
      // copia canónica: o, c y alternativas del servidor en el mismo orden
      q = {...base};
      q.altIds = altOrig;
      q._perm = null;
    } else {
      // sorteo local ya revuelto: alinea los ids con el orden visible
      q = {...enLocal};
      q.altIds = q._perm ? q._perm.map(i => altOrig[i]) : altOrig;
    }
    q.dbId = fila.pregunta_id;
    if (!q.q) { q.q = fila.texto; q.why = fila.sustento || ''; }
    nuevas.push(q);
  });
  if (!nuevas.length) return false;
  const idx = q => originales.indexOf(q);
  S.qs = nuevas;
  S.ans = nuevas.map(q => { const i = idx(q); return i >= 0 ? S.ans[i] : null; });
  S.checked = nuevas.map(q => { const i = idx(q); return i >= 0 ? S.checked[i] : false; });
  S.flags = nuevas.map(q => { const i = idx(q); return i >= 0 ? S.flags[i] : false; });
  S.cur = Math.min(S.cur, S.qs.length - 1);
  return true;
}

function begin() {
  guestState.on = S.trial;
  $('#crumbExam').textContent = S.exam.title;
  $('#practiceTag').hidden = !S.practice;
  $('#groupTag').hidden = !S.groupCode; $('#groupTag').textContent = S.groupCode ? 'Grupo ' + S.groupCode : '';
  $('#finish').textContent = S.practice ? 'Terminar práctica' : 'Terminar y calificar';
  document.body.classList.toggle('practice', S.practice);
  setView('exam'); pushPath(S.trial ? '/prueba' : '/examen');
  applyScale(); setWatermark();
  renderQuestion(); updateNet(); setSaveState('saved');
  if (!S.practice) { tick(); clearInterval(S.timer); S.timer = setInterval(tick, 250); }
  persistAttempt();
}

/* ---------- Copia local y guardado ---------- */
function persistAttempt() {
  if (!S || !S.active || S.trial) return;
  try {
    localStorage.setItem(ATT_KEY, JSON.stringify({
      v:2, user:meId, practice:S.practice, groupCode:S.groupCode || '', perms:S.qs.map(q => q._perm || null), cur:S.cur, ans:S.ans, checked:S.checked, flags:S.flags, startedAt:S.startedAt, deadline:S.deadline, intentoId:S.intentoId || null,
      exam:{id:S.exam.id, title:S.exam.title, uni:S.exam.uni, full:S.exam.full || '', mins:S.exam.mins, ids:S.qs.map(q => q.id), pc:S.exam.pc, pw:S.exam.pw, scale:S.exam.scale}
    }));
  } catch { /* almacenamiento lleno o bloqueado: se ignora */ }
}
function clearAttempt() { try { localStorage.removeItem(ATT_KEY); } catch { /* nada */ } }

// Devuelve true si retomó un examen en curso
function restoreAttempt() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(ATT_KEY) || 'null'); } catch { raw = null; }
  if (!raw || raw.v !== 2 || raw.user !== meId) return false;
  const qs = raw.exam.ids.map(Q).filter(Boolean).map(q => ({...q}));
  if (!qs.length || qs.length !== raw.exam.ids.length) { clearAttempt(); return false; }
  // Volver a aplicar el mismo orden de alternativas que vio el estudiante (si no, sus respuestas apuntarían a otra opción)
  qs.forEach((q, i) => {
    const perm = raw.perms && raw.perms[i];
    if (perm) {
      const alt = q.altIds;
      q._perm = perm;
      q.o = perm.map(k => q.o[k]);
      q.c = perm.indexOf(q.c);
      if (alt) q.altIds = perm.map(k => alt[k]);
    }
  });
  S = {
    exam:DB.exams.find(e => e.id === raw.exam.id) || raw.exam, active:true, practice:raw.practice, trial:false, groupCode:raw.groupCode || '', cur:Math.min(raw.cur || 0, qs.length - 1), qs,
    ans:raw.ans, checked:raw.checked, flags:raw.flags, startedAt:raw.startedAt, deadline:raw.deadline,
    left: raw.deadline ? Math.max(0, Math.ceil((raw.deadline - Date.now()) / 1000)) : null, timer:null, dirty:false, intentoId: raw.intentoId || null
  };
  begin();
  return true;
}

let saveTimer = null, savingNow = false;
function answersMap() { const m = {}; S.qs.forEach((q, i) => { m[q.id] = S.ans[i]; }); return m; }
function setSaveState(s) {
  const el = $('#saveState');
  el.textContent = {saved:'Respuestas guardadas', saving:'Guardando...', offline:'Sin conexión: se guardarán al volver'}[s];
  el.dataset.s = s;
}
function queueSave() {
  if (!S || S.trial) return;
  persistAttempt(); S.dirty = true; setSaveState('saving');
  clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 400);
}
async function flushSave() {
  if (!S || !S.dirty || savingNow) return;
  savingNow = true;
  try { await api.saveAnswers(S && S.intentoId, answersMap()); if (S) { S.dirty = false; setSaveState('saved'); } }
  catch { setSaveState('offline'); }
  finally { savingNow = false; }
}
function updateNet() {
  const off = !navigator.onLine;
  $('#netBanner').hidden = !off;
  if (S && S.active && off) setSaveState('offline');
}
window.addEventListener('offline', updateNet);
window.addEventListener('online', () => { updateNet(); if (S && S.active) { S.dirty = true; flushSave(); } });

/* ---------- Tamaño de letra, pantalla completa y protección ---------- */
let qScale = 1;
try { qScale = parseFloat(localStorage.getItem('spe.qscale')) || 1; } catch { /* nada */ }
function applyScale() { $('#qCard').style.setProperty('--q-scale', qScale); }
function changeScale(d) {
  qScale = Math.min(1.5, Math.max(0.9, Math.round((qScale + d) * 10) / 10));
  try { localStorage.setItem('spe.qscale', String(qScale)); } catch { /* nada */ }
  applyScale();
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}
// Marca de agua con el correo del estudiante: disuade de compartir capturas del banco de preguntas
function setWatermark() {
  const card = $('#qCard');
  if (S.trial) { card.style.removeProperty('--wm'); return; }
  const color = isDark() ? '%23FFFFFF' : '%2312305F';
  const svgText = `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='150'><text x='14' y='95' transform='rotate(-24 140 75)' font-family='sans-serif' font-size='15' fill='${color}' fill-opacity='0.085'>${escapeHTML(me().email)}</text></svg>`;
  card.style.setProperty('--wm', `url("data:image/svg+xml;utf8,${encodeURIComponent(svgText).replace(/%2523/g, '%23')}")`);
}
$('#qCard').addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.q-card')) e.preventDefault(); });

/* ---------- Cronómetro ---------- */
function tick() {
  if (!S || !S.active || S.practice) return;
  const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
  if (left !== S.left) {
    S.left = left;
    if (left === 300) announce('Quedan 5 minutos.');
    if (left === 60) announce('Queda 1 minuto.');
  }
  const t = fmtClock(left), warn = left <= 300;
  $('#timer').textContent = t; $('#hdrTime').textContent = t;
  $('#timer').classList.toggle('warn', warn); $('#hdrTimer').classList.toggle('warn', warn);
  if (left === 0) {
    if ($('#dlg').open) $('#dlg').close();
    toast('Se acabó el tiempo. Calificando tu examen.');
    finishExam({expired:true});
  }
}

/* ---------- Pregunta actual ---------- */
function renderQuestion() {
  const q = S.qs[S.cur], n = S.qs.length;
  $('#qCount').textContent = `Pregunta ${S.cur + 1} de ${n}`;
  $('#qArea').textContent = q.area;
  $('#qText').innerHTML = rich(q.q);
  $('#qFig').innerHTML = figHTML(q.img, 'Imagen del problema');
  $('#opts').innerHTML = q.o.map((t, i) => `
    <label class="opt"><input type="radio" name="opt" value="${i}"><span class="letter">${'ABCD'[i]}</span><span class="opt-text">${rich(t)}</span></label>`).join('');
  $('#prev').disabled = S.cur === 0;
  $('#next').textContent = S.cur === n - 1 ? (S.practice ? 'Terminar' : 'Revisar y terminar') : 'Siguiente';
  syncAnswer();
}

function syncAnswer() {
  const a = S.ans[S.cur], n = S.qs.length, q = S.qs[S.cur], locked = S.practice && S.checked[S.cur];
  $$('#opts .opt').forEach((l, i) => {
    const input = l.querySelector('input');
    l.classList.toggle('sel', i === a);
    input.checked = i === a; input.disabled = locked;
    l.classList.toggle('right', locked && i === q.c);
    l.classList.toggle('wrong', locked && i === a && a !== q.c);
  });
  $('#clearAns').classList.toggle('invisible', a == null || locked);
  $('#checkBtn').hidden = !(S.practice && a != null && !S.checked[S.cur]);
  const flagged = S.flags[S.cur];
  $('#flagBtn').setAttribute('aria-pressed', String(flagged));
  $('#flagBtn').querySelector('.flag-text').textContent = flagged ? 'Marcada para revisar' : 'Marcar para revisar';
  const answered = S.ans.filter(x => x != null).length;
  $('#qProg').style.width = (answered / n * 100) + '%';
  $('#qAnswered').textContent = `${answered} de ${n} respondidas`;
  $('#map').innerHTML = S.qs.map((_, i) => {
    const done = S.ans[i] != null, cur = i === S.cur;
    const label = `Pregunta ${i + 1}, ${done ? 'respondida' : 'sin responder'}${S.flags[i] ? ', marcada para revisar' : ''}`;
    return `<button type="button" data-i="${i}" class="${done ? 'done' : ''} ${cur ? 'cur' : ''} ${S.flags[i] ? 'flag' : ''}" aria-label="${label}"${cur ? ' aria-current="true"' : ''}>${i + 1}</button>`;
  }).join('');
  renderFeedback();
}

// Modo práctica: después de comprobar, se ve la respuesta correcta y el sustento
function renderFeedback() {
  const box = $('#qFeedback'), q = S.qs[S.cur];
  if (!(S.practice && S.checked[S.cur])) { box.hidden = true; box.innerHTML = ''; return; }
  const a = S.ans[S.cur], ok = a === q.c;
  box.hidden = false; box.className = 'feedback ' + (ok ? 'ok' : 'bad');
  box.innerHTML = `<div class="fb-head">${ICON[ok ? 'ok' : 'bad']}<b>${ok ? '¡Correcto!' : 'Incorrecta'}</b>${ok ? '' : `<span>La correcta es ${'ABCD'[q.c]}) ${rich(q.o[q.c])}</span>`}</div>
    <p><strong>Sustento:</strong> ${rich(q.why)}</p>${figHTML(q.whyImg, 'Imagen del sustento')}`;
}
function checkCurrent() {
  if (!S.practice || S.ans[S.cur] == null || S.checked[S.cur]) return;
  S.checked[S.cur] = true; persistAttempt(); syncAnswer();
  announce(S.ans[S.cur] === S.qs[S.cur].c ? 'Correcto.' : 'Incorrecta. Revisa el sustento.');
}
function toggleFlag() { S.flags[S.cur] = !S.flags[S.cur]; persistAttempt(); syncAnswer(); }
function chooseOption(i) {
  if (!S || i >= S.qs[S.cur].o.length || (S.practice && S.checked[S.cur])) return;
  S.ans[S.cur] = i; syncAnswer(); queueSave();
}
function goTo(i) { if (i < 0 || i >= S.qs.length) return; S.cur = i; persistAttempt(); renderQuestion(); }
function nextQuestion() { S.cur === S.qs.length - 1 ? askFinish() : goTo(S.cur + 1); }

// Atajos de teclado: A-D o 1-4 responden, flechas se mueven, M marca, Enter comprueba (práctica) o avanza
document.addEventListener('keydown', e => {
  if (!S || !S.active || document.body.dataset.view !== 'exam' || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($$('dialog[open]').length) return;
  if (e.target.closest && e.target.closest('input[type="text"], input[type="search"], textarea, select')) return;
  const k = e.key.toLowerCase();
  if ('abcd'.includes(k) && k.length === 1) { chooseOption('abcd'.indexOf(k)); e.preventDefault(); }
  else if ('1234'.includes(k) && k.length === 1) { chooseOption(+k - 1); e.preventDefault(); }
  else if (k === 'arrowright' || k === 'n') { nextQuestion(); e.preventDefault(); }
  else if (k === 'arrowleft' || k === 'p') { goTo(S.cur - 1); e.preventDefault(); }
  else if (k === 'm') { toggleFlag(); e.preventDefault(); }
  else if (k === 'enter' && e.target.tagName !== 'BUTTON') {
    (S.practice && S.ans[S.cur] != null && !S.checked[S.cur]) ? checkCurrent() : nextQuestion(); e.preventDefault();
  }
});

/* ---------- Terminar o abandonar ---------- */
async function askFinish() {
  if (!S.practice && !S.trial && !navigator.onLine) { toast('Sin conexión. Vuelve a conectarte para terminar y calificar tu examen.'); return; }
  const u = S.ans.filter(x => x == null).length, f = S.flags.filter(Boolean).length;
  const parts = [];
  if (u) parts.push(`Tienes ${u} ${u === 1 ? 'pregunta sin responder' : 'preguntas sin responder'}. Se calificarán como en blanco.`);
  if (f) parts.push(`Marcaste ${f} ${f === 1 ? 'pregunta' : 'preguntas'} para revisar.`);
  if (!parts.length) parts.push(S.practice ? 'Ya respondiste todas las preguntas.' : 'Ya respondiste todas las preguntas. Después de calificar no podrás cambiar tus respuestas.');
  const ok = await ask({title: S.practice ? '¿Terminar la práctica?' : '¿Terminar y calificar?', text: parts.join(' '), yes: S.practice ? 'Terminar práctica' : 'Terminar y calificar', no:'Seguir respondiendo'});
  if (ok && S && S.active) finishExam();
}

async function leaveExam() {
  const ok = await ask({
    title:'¿Abandonar el examen?',
    text: S && S.practice ? 'Perderás tu avance de esta práctica.' : 'Perderás tus respuestas y este intento no se guardará en tu historial.',
    yes:'Abandonar examen', no:'Seguir en el examen'
  });
  if (ok && S && S.active) {
    const trial = S.trial;
    clearInterval(S.timer); S = null; clearAttempt(); document.body.classList.remove('practice');
    trial ? showHome() : showTab('eval');
  }
}

/* ---------- Puntaje según las reglas de cada examen ---------- */
// Puntos por correcta / incorrecta (puede ser negativo) y escala final. Verifica las reglas oficiales de cada universidad.
function scoreFor(ex, ok, bad, total) {
  const pc = ex.pc ?? 1, pw = ex.pw ?? 0, scale = ex.scale ?? SCORE_MAX;
  const raw = Math.max(0, ok * pc + bad * pw), maxRaw = total * pc;
  return scale > 0 ? {score: maxRaw ? raw / maxRaw * scale : 0, max: scale} : {score: raw, max: maxRaw};
}

function tally(items, keyFn) {
  const out = {};
  items.forEach(it => {
    const k = keyFn(it); if (!k) return;
    const a = out[k] || (out[k] = {ok:0, bad:0, blank:0, total:0});
    a[it.st]++; a.total++;
  });
  return out;
}

function finishExam(opts = {}) {
  if (!S || !S.active) return;
  if (!opts.expired && !S.practice && !S.trial && !navigator.onLine) { toast('Sin conexión. Vuelve a conectarte para terminar y calificar tu examen.'); return; }
  S.active = false; clearInterval(S.timer); clearAttempt(); document.body.classList.remove('practice');
  const secs = S.practice ? Math.round((Date.now() - S.startedAt) / 1000) : Math.min(S.exam.mins * 60, Math.round((Date.now() - S.startedAt) / 1000));
  const items = S.qs.map((q, i) => {
    const a = S.ans[i];
    return {n:i + 1, q, ans:a, st: a == null ? 'blank' : (a === q.c ? 'ok' : 'bad')};
  });
  const ok = items.filter(x => x.st === 'ok').length, bad = items.filter(x => x.st === 'bad').length, blank = items.length - ok - bad;
  const pct = Math.round(ok / items.length * 100), sc = scoreFor(S.exam, ok, bad, items.length);
  LAST = {exam:S.exam, items, ok, bad, blank, total:items.length, score:sc.score, max:sc.max, pct, used:secs,
          areas:tally(items, it => it.q.area), difs:tally(items, it => it.q.dif), cursos:tally(items, it => it.q.curso), temas:tally(items, it => it.q.tema),
          practice:S.practice, trial:S.trial};
  solFilter = 'all'; solDif = 'all';
  const wasTrial = S.trial, practice = S.practice;
  const intentoId = S.intentoId || null;
  const respuestasFinales = answersMap();
  const snapshot = S.qs.map(q => ({id:q.id, dbId:q.dbId, altIds:q.altIds}));
  const ensucio = S.dirty;
  S = null;

  if (!wasTrial) {
    me().results.unshift({name:LAST.exam.title, uni:LAST.exam.uni, ts:new Date(), pct, total:LAST.total, used:secs, areas:LAST.areas, difs:LAST.difs, cursos:LAST.cursos, temas:LAST.temas, practice});
    if (!practice) items.forEach(it => { const s = DB.qstats[it.q.id] || (DB.qstats[it.q.id] = {n:0, ok:0}); s.n++; if (it.st === 'ok') s.ok++; });
    // Cierra el intento en el servidor (calificación, historial y estadísticas)
    if (API.online && intentoId) guardarIntentoServidor(intentoId, respuestasFinales, snapshot, ensucio);
  }
  track('exam_finished', {practice, trial:wasTrial, pct});
  renderResults();
  showResultsView();
  toast(wasTrial ? 'Este es tu resultado de la prueba gratis.' : 'Tu resultado se guardó en el historial.');
}

/* Envía las respuestas pendientes y cierra el intento en el servidor */
async function guardarIntentoServidor(intentoId, answers, snapshot, ensucio) {
  try {
    if (ensucio) await api.saveAnswers(intentoId, answers, snapshot);
    await apiFinalizarIntento(intentoId);
  } catch (e) {
    if (!e.red) console.warn('[servidor] no se pudo cerrar el intento:', e.message);
  }
}

/* ---------- Rendir en grupo (exámenes estándar y personalizado) ----------
   En los estándar el código es solo la "semilla": el banco ya está fijado en
   el examen, así que no hace falta guardar nada. En el personalizado el banco
   lo define quien arma el simulacro, así que al generar el código se guardan
   esas preguntas exactas en el servidor (/grupos) y todas las personas que
   entren con el mismo código rinden lo mismo, aunque sus filtros sean otros. */
let groupExamId = null;
function openGroupDialog(examId) {
  groupExamId = examId;
  const esCustom = examId === 'custom';
  const ex = esCustom ? null : DB.exams.find(e => e.id === examId);
  $('#groupExam').textContent = esCustom ? 'Simulacro personalizado' : (ex ? ex.title : '');
  $('#groupCode').value = ''; $('#groupErr').textContent = '';
  $('#groupSel').hidden = true; $('#groupSel').textContent = '';
  $('#groupDlg').showModal();
  $('#groupCode').focus();
}
$('#groupGen').onclick = async () => {
  const c = randomGroupCode();
  $('#groupErr').textContent = '';
  if (groupExamId !== 'custom') { $('#groupCode').value = c; return; }

  // Personalizado: el código necesita llevarse las preguntas elegidas.
  // Guardarlas cuesta escritura en el servidor, así que pide plan activo
  // (el mismo requisito para poder rendir después).
  if (!requireAccess()) return;
  const pool = builderPool();
  if (!pool.length) { $('#groupErr').textContent = 'Con estos filtros no hay preguntas para compartir.'; return; }
  const n = Math.min(B.n, pool.length);
  const ids = shuffle(pool).map(q => q.dbId).filter(id => id != null).slice(0, n);
  if (!ids.length) {
    $('#groupErr').textContent = 'Sin conexión con el servidor no se pueden crear grupos de examen personalizado.';
    return;
  }
  const btn = $('#groupGen');
  btn.disabled = true;
  $('#groupCode').value = c;
  try {
    await net('/grupos', {
      method: 'POST', auth: true,
      body: {
        codigo: c,
        titulo: 'Simulacro personalizado',
        minutos: builderMins(ids.length),
        preguntas: ids,
        resumen: resumenGrupo(),
      },
    });
    const sel = $('#groupSel');
    sel.hidden = false;
    sel.textContent = 'Examen compartido: ' + resumenGrupo() + '.';
    toast('Código ' + c + ' listo. Compártelo con tu grupo.');
  } catch (err) {
    $('#groupCode').value = '';
    $('#groupErr').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
};
$('#groupCopy').onclick = async () => {
  const c = normGroupCode($('#groupCode').value);
  if (!c) return $('#groupErr').textContent = 'Primero genera o escribe un código.';
  try { await navigator.clipboard.writeText(c); toast('Código copiado. Compártelo con tu grupo.'); }
  catch { toast('No pudimos copiarlo. Selecciónalo y cópialo a mano.'); }
};
$('#groupCode').addEventListener('input', () => { $('#groupErr').textContent = ''; });
$('#groupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const c = normGroupCode($('#groupCode').value);
  if (c.length < 4 || c.length > 12) { $('#groupErr').textContent = 'El código debe tener entre 4 y 12 letras o números. Puedes generar uno nuevo.'; return; }

  if (groupExamId !== 'custom') {
    $('#groupDlg').close();
    startById(groupExamId, {groupCode: c});
    return;
  }

  // Personalizado: se recuperan las preguntas que guardó quien generó el código.
  if (!requireAccess()) return;
  let g;
  try {
    g = await net('/grupos/' + c, { auth: true });
  } catch (err) {
    $('#groupErr').textContent = err.message;
    return;
  }
  // En el servidor viven los ids numéricos; en el navegador la clave (q.id).
  const porServidor = id => DB.questions.find(q => q.dbId === id);
  const pedidas = g.preguntas || [];
  const qs = pedidas.map(porServidor).filter(Boolean);
  if (!qs.length) { $('#groupErr').textContent = 'No encontramos las preguntas de ese grupo en tu banco. Recarga la página y vuelve a intentar.'; return; }

  $('#groupDlg').close();
  if (qs.length < pedidas.length) {
    toast(`Faltan ${pedidas.length - qs.length} preguntas de este grupo en tu banco; el examen quedará más corto.`);
  }
  startExam({
    id: 'custom',
    uni: 'Personalizado',
    title: g.titulo || 'Simulacro personalizado',
    full: '',
    mins: Math.max(1, g.minutos || builderMins(qs.length)),
    ids: qs.map(q => q.id),
  }, {groupCode: c});
});
