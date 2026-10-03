/* =====================================================================
   ÍCONOS
   ===================================================================== */
const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  cap:   svg('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/>'),
  book:  svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19.5A2 2 0 0 0 6 21h13"/>'),
  sigma: svg('<path d="M18 5H6l6 7-6 7h12"/>'),
  flask: svg('<path d="M9 3h6"/><path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.5 15h9"/>'),
  leaf:  svg('<path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16z"/><path d="M4 21c2-5 5-8 9-10"/>'),
  bulb:  svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  list:  svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', 2),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 2),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.6),
  ok:    svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>', 2),
  bad:   svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>', 2),
  blank: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/>', 2),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>')
};
const LABEL = {ok:'Correcta', bad:'Incorrecta', blank:'En blanco'};
const AREA_ICON = {'Aptitud Académica':'bulb', 'Matemáticas':'sigma', 'Ciencias':'flask', 'Humanidades':'book'};

/* =====================================================================
   UTILIDADES
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const fmtClock = s => { const h = Math.floor(s/3600), m = Math.floor(s%3600/60); return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s%60); };
const fmtDur = s => s >= 3600 ? `${Math.floor(s/3600)} h ${Math.floor(s%3600/60)} min` : s >= 60 ? `${Math.floor(s/60)} min ${s%60} s` : `${s} s`;
const fmtMins = m => m >= 60 ? (m % 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m/60} h`) : `${m} min`;
const fmtDate = d => d ? d.toLocaleDateString('es-PE', {day:'numeric', month:'long'}) : '—';
const fmtDT = d => d ? d.toLocaleString('es-PE', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';
const fmtRemain = ms => { const h = Math.ceil(ms / 36e5); if(h < 24) return h + (h === 1 ? ' hora' : ' horas'); const d = Math.ceil(ms / 864e5); return d + (d === 1 ? ' día' : ' días'); };
const shuffle = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plan = id => PLANS.find(p => p.id === id);
const Q = id => DB.questions.find(q => q.id === id);
const me = () => DB.users.find(u => u.id === meId);
const accessState = u => (u && u.rol === 'admin') ? 'active' : (u.until && u.until > new Date() ? 'active' : (u.plan ? 'expired' : 'none'));
const hasPending = u => DB.payments.some(p => p.userId === u.id && p.status === 'pending');
const difBadge = k => `<span class="dif d${DIF_LVL[k]}"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>${DIF_LABEL[k]}</span>`;
const examIcon = e => e.uni === 'UNALM' ? 'leaf' : /matem/i.test(e.title) ? 'sigma' : /cienc/i.test(e.title) ? 'flask' : /human/i.test(e.title) ? 'book' : 'cap';
const recFor = eff => eff < 60 ? ['low', 'Se sugiere repasar'] : eff < 80 ? ['mid', 'Refuerza los detalles'] : ['high', 'Buen dominio'];

// Avatar del estudiante: muestra su foto (u.photo) o la inicial de su nombre.
function setAvatar(el, u){
  if (!el || !u) return;
  const photo = u.photo || '';
  if (!photo) {
    // Si no hay foto, siempre mostramos inicial y limpiamos el dataset.
    el.dataset.photo = '';
    el.innerHTML = esc((u.name || '?').trim()[0].toUpperCase());
    return;
  }
  // Si ya tenemos foto y el dataset coincide, no re-renderizar.
  if (el.dataset.photo === photo) return;
  el.dataset.photo = photo;
  el.innerHTML = `<img src="${photo}" alt="">`;
}

/* Foto de perfil: se guarda en este navegador para que no se pierda al recargar
   la pagina ni al volver a hidratar los datos del usuario (mapUser la reseteaba). */
const FOTO_LS = id => 'spe.foto.' + id;
function guardarFoto(id, dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(FOTO_LS(id), dataUrl);
    else localStorage.removeItem(FOTO_LS(id));
  } catch (e) { /* modo privado o cuota llena: queda solo en memoria */ }
}
function fotoGuardada(id) {
  try { return localStorage.getItem(FOTO_LS(id)) || null; } catch (e) { return null; }
}

function grant(u, planId){
  const p = plan(planId);
  const base = accessState(u) === 'active' ? u.until : new Date();
  u.until = new Date(+base + p.ms); u.plan = planId;
}

let toastTimer;
function toast(msg){
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function announce(msg){ $('#srLive').textContent = msg; }

function ask({title, text, yes, no}){
  return new Promise(resolve => {
    const d = $('#dlg');
    $('#dlgTitle').textContent = title; $('#dlgText').textContent = text;
    $('#dlgYes').textContent = yes; $('#dlgNo').textContent = no;
    d.returnValue = '';
    $('#dlgYes').onclick = () => { d.returnValue = 'yes'; d.close(); };
    $('#dlgNo').onclick = () => d.close();
    d.onclose = () => resolve(d.returnValue === 'yes');
    d.showModal();
  });
}


/* =====================================================================
   NUEVOS ÍCONOS, ANALÍTICA, ESTADOS DE CARGA Y UTILIDADES
   ===================================================================== */
Object.assign(ICON, {
  flag:     svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>', 2),
  share:    svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>', 2),
  download: svg('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', 2),
  expand:   svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 2),
  camera:   svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 2),
  gift:     svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M8.5 8a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8s1-5 3.5-5a2.5 2.5 0 1 1 0 5"/>', 2),
  bell:     svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/>', 2),
  chart:    svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 2),
  wifi:     svg('<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>', 2)
});

// ---------- Rutas de la API ----------
// Guarda las respuestas del intento en curso en el servidor (FastAPI).
// Si no hay conexión o no hay backend, no hace nada: el modo demo sigue
// funcionando con los datos locales de data.js.
const api = {
  // attemptId = intento en el servidor; answers = {id de pregunta: índice visible}
  // snapshot = copia de las preguntas (por si S ya se limpió al finalizar)
  async saveAnswers(attemptId, answers, snapshot) {
    if (!navigator.onLine) throw new Error('sin conexión');
    if (typeof API === 'undefined' || !API.online) return; // modo demo
    if (!attemptId) return;                                // sin intento remoto
    const preguntas = snapshot || (typeof S !== 'undefined' && S ? S.qs : []);
    const porId = {};
    preguntas.forEach(q => { porId[q.id] = q; });
    for (const qid of Object.keys(answers)) {
      const idx = answers[qid];
      if (idx == null) continue; // sin respuesta: queda en blanco
      const q = porId[qid];
      if (!q || q.dbId == null || !q.altIds || q.altIds[idx] == null) continue;
      await apiGuardarRespuesta(attemptId, q.dbId, q.altIds[idx]);
    }
  }
};

// ---------- Analítica y errores ----------
// En memoria; si hay backend conectado, también se envía a POST /eventos.
function track(name, props = {}) {
  DB.events.push({name, props, at: new Date()});
  if (typeof API !== 'undefined' && API.online && typeof apiEvento === 'function') {
    apiEvento(name, JSON.stringify(props).slice(0, 300)).catch(() => { /* mejor esforzarse */ });
  }
}
function reportError(err, where = '') {
  console.warn('[error]', where, err);
  DB.clientErrors.push({message: String(err && err.message || err), where, at: new Date()});
  // Aquí puedes enviarlo a POST /api/client-errors o a Sentry (Sentry.captureException(err)).
}
window.addEventListener('error', e => reportError(e.error || e.message, 'window.onerror'));
window.addEventListener('unhandledrejection', e => reportError(e.reason, 'unhandledrejection'));

// ---------- Botones ocupados: evitan doble clic mientras algo se envía ----------
async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Archivos descargables ----------
function downloadFile(name, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + text], {type: mime}); // el BOM hace que Excel muestre bien las tildes
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');

// Lee un CSV (con comillas y saltos de línea dentro de las celdas). Detecta coma o punto y coma.
function parseCSV(text) {
  text = text.replace(/^\ufeff/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const normKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => todayKey(a) === todayKey(b);
const money = n => 'S/ ' + (Math.round(n * 100) / 100).toFixed(2);
const guestState = {on: false};

function fillIcons() { $$('[data-ic]').forEach(el => { el.innerHTML = ICON[el.dataset.ic]; }); }
