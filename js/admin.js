/* =====================================================================
   PANEL ADMIN
   ===================================================================== */
const ADMIN_TABS = ['resumen', 'pagos', 'usuarios', 'preguntas', 'examenes', 'reportes', 'cupones', 'actividad'];
let adminTab = 'resumen', payView = 'pending', uQuery = '', repView = 'open';
const qFilter = {text:'', area:'all', dif:'all', curso:'all', tema:'all', uni:'all'};

// Registro de quién hizo cada cambio. En producción lo guarda el servidor (tabla audit_log).
const audit = (action, detail) => DB.audit.unshift({at:new Date(), who:'Admin', action, detail});

// ¿Hay backend conectado? Si no, el panel trabaja con los datos demo locales.
const enServidor = () => typeof API !== 'undefined' && API.online;

async function showAdmin(tab) {
  // Solo el administrador real (rol admin) puede ver el panel; los demás vuelven al dashboard.
  const yo = me();
  if (!yo || yo.rol !== 'admin') return showDash();
  if (tab && ADMIN_TABS.includes(tab)) adminTab = tab;
  setView('admin'); pushPath('/admin/' + adminTab);
  $$('.admin-nav button').forEach(b => b.setAttribute('aria-current', String(b.dataset.admin === adminTab)));
  if (enServidor()) {
    try { await hidratarAdmin(); }
    catch (e) { if (!e.red) toast('No se pudo cargar el panel: ' + e.message); }
  }
  renderAdmin();
}

// Con servidor: trae todos los datos del panel y los vuelca sobre DB.*
// (las vistas siguen leyendo DB.* como siempre; si falla, quedan los de la demo)
async function hidratarAdmin() {
  const [usuarios, pagos, reportes, cupones, auditoria, preguntas, examenes, unis] = await Promise.all([
    apiAdmin('/usuarios'),
    apiAdmin('/pagos?estado=all'),
    apiAdmin('/reportes'),
    apiAdmin('/cupones'),
    apiAdmin('/auditoria'),
    apiAdmin('/preguntas'),
    net('/examenes'),
    net('/universidades'),
  ]);
  const yo = me();
  DB.users = usuarios.map(mapUser);
  if (yo && !DB.users.some(u => u.id === yo.id)) DB.users.unshift(yo);
  DB.payments = pagos.map(mapPayment);
  DB.reports = reportes.map(mapReport);
  DB.coupons = cupones.map(mapCoupon);
  DB.audit = auditoria.map(mapAudit);
  DB.exams = examenes.map(mapExam);          // incluye borradores (el panel los muestra)
  DB.unis = unis;
  const prev = new Map(DB.questions.map(q => [q.dbId, q]));
  DB.questions = preguntas.map(p => {
    const anterior = prev.get(p.id);
    return {
      id: p.clave || String(p.id), dbId: p.id,
      area: p.area, dif: p.dif, q: p.q, why: p.why || '',
      curso: p.curso || '', tema: p.tema || '', free: !!p.gratis,
      activa: p.activa !== false, o: p.o || [], c: p.c,
      unis: splitUnis(p.universidad),
      img: p.imagen || (anterior && anterior.img) || null,
      whyImg: p.sustento_imagen || (anterior && anterior.whyImg) || null,
      altIds: (anterior && anterior.altIds) || null,
    };
  });
  DB.qstats = {};
  DB.qmap = {}; DB.qmapInv = {};
  preguntas.forEach(p => {
    const k = p.clave || String(p.id);
    DB.qmap[k] = p.id; DB.qmapInv[p.id] = k;
    const s = p.stats || {};
    if (s.n) DB.qstats[k] = {n: s.n, ok: s.ok || 0};
  });
}

// Escribe en el panel (si hay servidor) y refresca los datos afectados.
// true  → el servidor lo guardó
// false → no hay conexión (el llamador aplica el cambio en local)
// 'error' → el servidor rechazó la operación (ya se mostró el mensaje)
async function guardarEnServidor(ruta, method, body, refrescar) {
  if (!enServidor()) return false;
  try {
    const respuesta = await apiAdmin(ruta, method, body);
    if (refrescar) { try { await hidratarAdmin(); } catch { /* espejo local */ } }
    return respuesta;
  } catch (e) {
    if (e.red) return false;
    toast(e.message);
    return 'error';
  }
}
function renderAdmin() {
  const np = DB.payments.filter(p => p.status === 'pending').length, nr = DB.reports.filter(r => r.status === 'open').length;
  $('#navPagos').hidden = !np; $('#navPagos').textContent = np;
  $('#navReportes').hidden = !nr; $('#navReportes').textContent = nr;
  ({resumen:renderOverview, pagos:renderPayments, usuarios:renderUsers, preguntas:renderQuestions, examenes:renderExamsAdmin, reportes:renderReports, cupones:renderCoupons, actividad:renderActivity})[adminTab]();
}
const pageHead = (t, r = '') => `<div class="page-head"><h1>${t}</h1><div class="page-meta">${r}</div></div>`;
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:28px">${msg}</td></tr>`;

/* ---------- Resumen ---------- */
function renderOverview() {
  const now = new Date(), paid = DB.payments.filter(p => p.status === 'approved');
  const income = paid.filter(p => p.ts.getMonth() === now.getMonth() && p.ts.getFullYear() === now.getFullYear()).reduce((a, p) => a + p.amount, 0);
  const active = DB.users.filter(u => accessState(u) === 'active').length;
  const pending = DB.payments.filter(p => p.status === 'pending').length;
  const today = DB.users.reduce((a, u) => a + (u.hoy != null ? u.hoy : u.results.filter(r => !r.practice && sameDay(r.ts, now)).length), 0);
  const openRep = DB.reports.filter(r => r.status === 'open').length;
  const kpis = [['Ingresos de este mes', money(income)], ['Usuarios con acceso activo', active], ['Pagos por revisar', pending], ['Simulacros rendidos hoy', today], ['Reportes abiertos', openRep], ['Errores del navegador', DB.clientErrors.length]];
  const worst = DB.questions.map(q => ({q, s:DB.qstats[q.id]})).filter(x => x.s && x.s.n >= 10)
    .map(x => ({...x, p:Math.round(x.s.ok / x.s.n * 100)})).sort((a, b) => a.p - b.p).slice(0, 5);
  const ev = n => DB.events.filter(e => e.name === n).length, f = DB.funnelBase;
  const steps = [['Visitaron la página de inicio', f.home + ev('view_home')], ['Empezaron la prueba gratis', f.trial + ev('trial_start')], ['Se registraron', f.register + ev('register')],
                 ['Eligieron un plan', f.plan + ev('plan_selected')], ['Enviaron un pago', f.payment + ev('payment_submitted')], ['Pago aprobado', f.approved + ev('payment_approved')]];
  $('#adminBody').innerHTML = pageHead('Resumen', enServidor() ? '<span class="st active">Datos del servidor</span>' : '<span class="st none">Datos de ejemplo</span>')
    + '<h2 class="sr">Indicadores del panel</h2>'
    + `<div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="two-col">
      <section class="insight-card"><h3>Preguntas más falladas</h3>
        ${worst.length ? worst.map(x => `<div class="topic-row"><span class="clamp">${rich(x.q.q)}</span><b class="num">${x.p}%</b><button class="link-btn" type="button" data-act="editq" data-id="${x.q.id}">Editar</button></div>`).join('') : '<p class="muted">Aún no hay suficientes respuestas.</p>'}
        <p class="hint">Solo cuentan preguntas respondidas al menos 10 veces.</p></section>
      <section class="insight-card"><h3>Embudo de registro y pago</h3>
        ${steps.map(([l, n], i) => `<div class="fun-row"><span>${l}</span><span class="meter" aria-hidden="true"><i style="width:${Math.round(n / steps[0][1] * 100)}%"></i></span><b class="num">${n}</b><small>${i ? Math.round(n / (steps[i - 1][1] || 1) * 100) + ' %' : ''}</small></div>`).join('')}
        <p class="hint">Mezcla datos de ejemplo con lo que ocurre en esta sesión.</p></section>
    </div>`;
}

/* ---------- Pagos ---------- */
async function fetchPayments() { return DB.payments; } // Reemplaza por: (await fetch('/api/admin/payments?status=...')).json()

async function renderPayments() {
  const body = $('#adminBody');
  let all;
  try { all = await fetchPayments(); }
  catch {
    body.innerHTML = pageHead('Pagos pendientes de revisión') + '<div class="error-card"><p>No pudimos cargar los pagos. Revisa tu conexión e inténtalo de nuevo.</p><button class="btn" type="button" data-act="retry">Reintentar</button></div>';
    return;
  }
  const pend = all.filter(p => p.status === 'pending'), rev = all.filter(p => p.status !== 'pending');
  const pending = payView === 'pending', list = pending ? pend : rev;
  const rows = list.map(p => {
    const u = DB.users.find(x => x.id === p.userId) || {name:'Usuario eliminado', email:''};
    const last = pending
      ? `<div class="row-actions"><button class="btn sm" type="button" data-act="approve" data-id="${p.id}">Aprobar</button><button class="btn sm line" type="button" data-act="reject" data-id="${p.id}">Rechazar</button></div>`
      : `<span class="st ${p.status === 'approved' ? 'active' : 'expired'}">${p.status === 'approved' ? 'Aprobado' : 'Rechazado'}</span>`;
    return `<tr><td class="cell-user"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></td><td>${plan(p.plan).name}</td>
      <td class="num">${money(p.amount)}${p.coupon ? `<small class="cp-note">${esc(p.coupon)}</small>` : ''}</td><td class="num">${esc(p.op)}</td>
      <td>${p.proof ? `<button class="link-btn" type="button" data-act="proof" data-id="${p.id}">Ver captura</button>` : '<span class="muted">-</span>'}</td>
      <td>${fmtDT(p.ts)}</td><td>${last}</td></tr>`;
  }).join('');
  body.innerHTML = pageHead(pending ? 'Pagos pendientes de revisión' : 'Pagos revisados', `<span class="st ${pend.length ? 'expired' : 'none'}">${pend.length} ${pend.length === 1 ? 'pendiente' : 'pendientes'}</span>`)
    + `<div class="toolbar"><div class="seg" role="group" aria-label="Estado de los pagos"><button type="button" data-payview="pending" aria-pressed="${pending}">Pendientes (${pend.length})</button><button type="button" data-payview="reviewed" aria-pressed="${!pending}">Revisados (${rev.length})</button></div>
       <button class="btn line sm push" type="button" data-act="exportPay">${ICON.download}<span>Exportar a Excel</span></button></div>`
    + (list.length
      ? `<div class="table-wrap wide"><table><thead><tr><th scope="col">Estudiante</th><th scope="col">Plan</th><th scope="col">Monto</th><th scope="col">N° de operación</th><th scope="col">Comprobante</th><th scope="col">Recibido</th><th scope="col">${pending ? 'Acciones' : 'Estado'}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">${pending ? 'No hay pagos pendientes. Cuando un estudiante confirme un pago, aparecerá aquí.' : 'Aún no hay pagos revisados.'}</div>`);
}

function grantHours(u, hours) {
  const base = accessState(u) === 'active' ? u.until : new Date();
  u.until = new Date(+base + hours * 36e5); u.plan = u.plan || 'dia-completo';
}
async function reviewPayment(id, action) {
  const p = DB.payments.find(x => x.id === id), u = DB.users.find(x => x.id === p.userId), approve = action === 'approve';
  const yes = await ask(approve
    ? {title:'¿Aprobar este pago?', text:`Se activará el plan ${plan(p.plan).name} para ${u.name}.`, yes:'Aprobar pago', no:'Cancelar'}
    : {title:'¿Rechazar este pago?', text:`${u.name} no recibirá acceso con esta operación.`, yes:'Rechazar pago', no:'Cancelar'});
  if (!yes) return;

  // Con servidor: él aplica todo (plan, bono de referido, cupón y auditoría)
  const r = await guardarEnServidor(
    `/pagos/${id}/${approve ? 'aprobar' : 'rechazar'}`,
    'POST',
    approve ? undefined : {motivo:'Rechazado desde el panel.'},
    true,   // recarga usuarios, pagos, cupones y auditoría
  );
  if (r === 'error') return;
  if (r === true) {
    track(approve ? 'payment_approved' : 'payment_rejected');
    toast(approve ? 'Pago aprobado y acceso activado.' : 'Pago rechazado.');
    return renderAdmin();
  }

  // Modo demo o sin conexión: aplica el cambio en local
  p.status = approve ? 'approved' : 'rejected';
  if (approve) {
    grant(u, p.plan);
    const cp = p.coupon && DB.coupons.find(x => x.code === p.coupon); if (cp) cp.used++;
    // Bono de referido: SOLO con pagos de cualquier plan MENSUAL del amigo
    // invitado (una única vez: cuenta el primer pago aprobado de periodo Mes;
    // los pagos de 24 h, semana o año no lo activan)
    const esMes = x => periodoDePlan(x.plan) === 'mes';
    if (u.referredBy && esMes(p) && DB.payments.filter(x => x.userId === u.id && x.status === 'approved' && esMes(x)).length === 1) {
      const inviter = DB.users.find(x => x.id === u.referredBy);
      if (inviter) { grantHours(inviter, DB.settings.referralDays * 24); audit('Bono de referido', `${inviter.name} recibió ${DB.settings.referralDays} día(s) por invitar a ${u.name} (plan Mensual)`); }
    }
    track('payment_approved');
  }
  audit(approve ? 'Aprobó un pago' : 'Rechazó un pago', `${u.name}, plan ${plan(p.plan).name}, ${money(p.amount)}, operación ${p.op}`);
  toast(approve ? 'Pago aprobado y acceso activado.' : 'Pago rechazado.');
  renderAdmin();
}

/* ---------- Accesos ---------- */
function renderUsers() {
  $('#adminBody').innerHTML = pageHead('Accesos de usuarios', `<span class="st none">${DB.users.length} usuarios</span>`)
    + `<div class="toolbar"><label class="search grow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="uSearch" type="search" placeholder="Buscar por nombre, correo o carrera" aria-label="Buscar usuarios" autocomplete="off" value="${esc(uQuery)}"></label>
       <button class="btn line sm" type="button" data-act="exportUsers">${ICON.download}<span>Exportar a Excel</span></button></div>`
    + '<div class="table-wrap wide"><table><thead><tr><th scope="col">Usuario</th><th scope="col">Universidad</th><th scope="col">Facultad y escuela</th><th scope="col">Plan</th><th scope="col">Estado</th><th scope="col">Vence</th><th scope="col">Simulacros</th><th scope="col">Acciones</th></tr></thead><tbody id="uRows"></tbody></table></div>';
  fillUsers();
}
const STATE_CHIP = {active:['active', 'Activo'], expired:['expired', 'Vencido'], none:['none', 'Sin plan']};
function fillUsers() {
  const q = uQuery.trim().toLowerCase();
  const list = DB.users.filter(u => {
    if (!q) return true;
    const g = u.goal || {};
    return (u.name + ' ' + u.email + ' ' + (g.uni || '') + ' ' + (g.facultad || '') + ' ' + (g.escuela || '')).toLowerCase().includes(q);
  });
  $('#uRows').innerHTML = list.length ? list.map(u => {
    const st = accessState(u), chip = STATE_CHIP[st];
    const g = u.goal || {}, carr = [];
    if (g.facultad) carr.push(esc(g.facultad));
    if (g.escuela) carr.push(`<small>${esc(g.escuela)}</small>`);
    const vence = !u.until ? '<span class="muted">Sin plan</span>' : st === 'active' ? `${fmtDate(u.until)}<br><small class="muted">quedan ${fmtRemain(u.until - new Date())}</small>` : st === 'expired' ? `<span class="muted">Venció el ${fmtDate(u.until)}</span>` : '<span class="muted">-</span>';
    const nSim = u.simulacros != null ? u.simulacros : u.results.filter(r => !r.practice).length;
    return `<tr>
      <td class="cell-user"><strong>${esc(u.name)}${u.id === meId ? ' (tú)' : ''}</strong><small>${esc(u.email)}</small></td>
      <td>${g.uni ? esc(g.uni) : '<span class="muted">-</span>'}</td>
      <td>${carr.join('<br>') || '<span class="muted">-</span>'}</td>
      <td>${u.plan ? plan(u.plan).name : '<span class="muted">-</span>'}</td>
      <td><span class="st ${chip[0]}">${chip[1]}</span></td>
      <td>${vence}</td>
      <td class="num">${nSim}</td>
      <td>${u.rol === 'admin'
        ? '<span class="muted">Cuenta de administrador</span>'
        : `<div class="row-actions"><button class="btn sm" type="button" data-act="grant" data-id="${u.id}">Dar acceso</button><button class="btn sm line" type="button" data-act="revoke" data-id="${u.id}"${st === 'none' ? ' disabled' : ''}>Revocar</button><button class="link-btn danger" type="button" data-act="delu" data-id="${u.id}">Eliminar</button></div>`}</td>
    </tr>`;
  }).join('') : emptyRow(8, 'No hay usuarios que coincidan con la búsqueda.');
}
let grantUser = null, grantPlan = 'semana-completo';
function openGrant(id) {
  grantUser = DB.users.find(u => u.id === id);
  // Si ya tiene un plan, se preselecciona el mismo (normalizado al id de la
  // matriz): normalmente lo que quiere es sumarle tiempo, no cambiarle el nivel.
  // Si no, vuelve el valor por defecto (no se arrastra el del usuario anterior).
  const actual = plan(grantUser.plan);
  grantPlan = actual ? actual.id : 'semana-completo';
  $('#gText').textContent = `Elige el plan para ${grantUser.name}. Si ya tiene acceso activo, el tiempo se suma al que le queda.`;
  $('#gPlans').innerHTML = PLANS.map(p => `<label class="rpill"><input type="radio" name="gPlan" value="${p.id}"${p.id === grantPlan ? ' checked' : ''}>${p.name} · S/ ${p.price}</label>`).join('');
  $('#gDlg').showModal();
}
$('#gOk').onclick = async () => {
  const sel = document.querySelector('input[name="gPlan"]:checked'); if (!sel) return;
  grantPlan = sel.value;
  if (enServidor()) {
    // El servidor suma los dias sobre el acceso vigente y devuelve la fecha ya
    // calculada: asi el panel y la app del usuario siempre muestran lo mismo.
    const r = await guardarEnServidor('/usuarios/' + grantUser.id, 'PATCH', { plan: grantPlan }, true);
    if (r === 'error') return;
    if (r === false) { toast('Sin conexión con el servidor. Intenta de nuevo.'); return; }
    const actualizado = r && r.usuario;
    if (actualizado) {
      // El servidor ya refresco los datos: se toma el objeto actualizado.
      grantUser = DB.users.find(x => x.id === actualizado.id) || grantUser;
      grantUser.plan = actualizado.plan;
      grantUser.until = actualizado.plan_hasta ? new Date(actualizado.plan_hasta) : null;
    } else grant(grantUser, grantPlan);   // respaldo sin conexion
  } else grant(grantUser, grantPlan);
  audit('Dio acceso', `${grantUser.name}, plan ${plan(grantPlan).name}`);
  $('#gDlg').close(); toast(`Acceso ${plan(grantPlan).name} activado para ${grantUser.name}.`); renderAdmin();
};

/* ---------- Preguntas ---------- */
const suggestDif = s => s && s.n >= 10 ? (s.ok / s.n >= 0.85 ? 'facil' : s.ok / s.n >= 0.5 ? 'intermedio' : 'dificil') : null;

function renderQuestions() {
  const cursos = [...new Set(DB.questions.map(q => q.curso).filter(Boolean))].sort();
  const temas = [...new Set(DB.questions.map(q => q.tema).filter(Boolean))].sort();
  const unis = codigosDePreguntas();
  $('#adminBody').innerHTML = pageHead('Banco de preguntas', `<span class="st none">${DB.questions.length} preguntas</span>`)
    + bloqueCatalogo()
    + `<div class="toolbar">
        <label class="search grow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="qSearch" type="search" placeholder="Buscar en los enunciados" aria-label="Buscar preguntas" autocomplete="off" value="${esc(qFilter.text)}"></label>
        <select class="select sm" id="qArea" aria-label="Filtrar por área"><option value="all">Todas las áreas</option>${AREAS.map(a => `<option${qFilter.area === a ? ' selected' : ''}>${a}</option>`).join('')}</select>
        <select class="select sm" id="qDif" aria-label="Filtrar por dificultad"><option value="all">Toda dificultad</option>${DIFS.map(([k, l]) => `<option value="${k}"${qFilter.dif === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select class="select sm" id="qCurso" aria-label="Filtrar por curso"><option value="all">Todos los cursos</option>${cursos.map(c => `<option${qFilter.curso === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="select sm" id="qTema" aria-label="Filtrar por tema"><option value="all">Todos los temas</option>${temas.map(t => `<option${qFilter.tema === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select class="select sm" id="qUni" aria-label="Filtrar por universidad"><option value="all">Todas las universidades</option>${unis.map(u => `<option${qFilter.uni === u ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>
        <button class="btn line sm push" type="button" data-act="importq">Importar desde Excel</button>
        <button class="btn" type="button" data-act="newq">Nueva pregunta</button>
      </div>`
    + '<div class="table-wrap wide"><table><thead><tr><th scope="col">Enunciado</th><th scope="col">Área, curso y tema</th><th scope="col">Universidad</th><th scope="col">Dificultad</th><th scope="col">Aciertos</th><th scope="col">Correcta</th><th scope="col">Acciones</th></tr></thead><tbody id="qRows"></tbody></table></div>';
  pintarCatalogo();
  fillQuestions();
}
function fillQuestions() {
  const t = qFilter.text.trim().toLowerCase();
  const list = DB.questions.filter(q => (qFilter.area === 'all' || q.area === qFilter.area) && (qFilter.dif === 'all' || q.dif === qFilter.dif) && (qFilter.curso === 'all' || q.curso === qFilter.curso) && (qFilter.tema === 'all' || q.tema === qFilter.tema) && (qFilter.uni === 'all' || (q.unis || []).includes(qFilter.uni)) && (!t || q.q.toLowerCase().includes(t)));
  $('#qRows').innerHTML = list.length ? list.map(q => {
    const s = DB.qstats[q.id], sug = suggestDif(s);
    const stat = s && s.n ? `<b class="num">${Math.round(s.ok / s.n * 100)}%</b><small class="muted"> de ${s.n}</small>${sug && sug !== q.dif ? `<small class="suggest">Sugerida: ${DIF_LABEL[sug]}</small>` : ''}` : '<span class="muted">Sin datos</span>';
    const etiquetas = (q.unis || []).length ? q.unis.map(u => `<span class="tag">${esc(u)}</span>`).join(' ') : '<span class="muted">Todas</span>';
    return `<tr>
      <td><div class="clamp">${rich(q.q)}</div>${q.img ? '<span class="tag img-tag">Con imagen</span> ' : ''}${q.free ? '<span class="tag img-tag">Prueba gratis</span>' : ''}</td>
      <td><span class="tag">${esc(q.area)}</span>${q.curso ? `<small class="cp-note">${esc(q.curso)}${q.tema ? ' · ' + esc(q.tema) : ''}</small>` : ''}</td>
      <td class="cat-unis">${etiquetas}</td>
      <td><select class="select sm" data-difsel="${q.id}" aria-label="Dificultad de la pregunta">${DIFS.map(([k, l]) => `<option value="${k}"${q.dif === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
      <td>${stat}</td>
      <td class="num">${'ABCD'[q.c]}</td>
      <td><div class="row-actions"><button class="btn sm line" type="button" data-act="editq" data-id="${q.id}">Editar</button><button class="link-btn danger" type="button" data-act="delq" data-id="${q.id}">Eliminar</button></div></td>
    </tr>`;
  }).join('') : emptyRow(7, 'No hay preguntas con esos filtros.');
}

/* ---------- Catálogos: universidades, cursos y temas ---------- */
/* Universidades viven en la tabla universidades (nombre + código). Cursos y
   temas viven en sus tablas y además como texto en cada pregunta: lo que se
   renombra aquí se arrastra a todas las preguntas de una sola vez. Sin
   servidor (modo demo) todo se aplica en memoria, igual que el resto del panel. */
let catSeccion = 'unis', catEdit = null, catDatos = null, catCargado = false;

const codigosDePreguntas = () => [...new Set([
  ...(DB.unis || []).map(u => String(u.codigo || '').toUpperCase()),
  ...DB.questions.flatMap(q => q.unis || []),
  ...(DB.exams || []).map(e => e.uni || ''),
].filter(Boolean))].sort();

const nUsoCurso = nombre => DB.questions.filter(q => q.curso === nombre).length;
const nUsoTema = nombre => DB.questions.filter(q => q.tema === nombre).length;
const nUsoUni = codigo => DB.questions.filter(q => (q.unis || []).includes(codigo)).length;
const nExamenesUni = id => DB.exams.filter(e => String(e.dbUniId) === String(id)).length;

// Catálogo en memoria: sirve cuando no hay servidor y como respaldo de lectura.
function catLocal() {
  const cursos = [], temas = [], vC = new Set(), vT = new Set();
  for (const q of DB.questions) {
    if (q.curso && !vC.has(q.curso)) { vC.add(q.curso); cursos.push({ id: 'c' + cursos.length, area: q.area, nombre: q.curso, activo: true, preguntas: 0 }); }
    if (q.tema && !vT.has(q.tema)) { vT.add(q.tema); temas.push({ id: 't' + temas.length, curso: q.curso || '', nombre: q.tema, activo: true, preguntas: 0 }); }
  }
  return { areas: AREAS.map((n, i) => ({ id: i + 1, nombre: n })), cursos, temas };
}

async function catApi(ruta, method, cuerpo) {
  try {
    const r = await apiAdmin(ruta, method, cuerpo);
    if (r && r.error) { toast(r.error); return null; }
    return r;
  } catch (e) {
    toast(e.red ? 'Sin conexión con el servidor: no se pudo guardar.' : (e.message || 'No se pudo guardar.'));
    return null;
  }
}

// Lee el catálogo (el servidor da de alta lo que ya esté escrito en las preguntas)
async function catCargar() {
  if (!enServidor()) { catDatos = catDatos || catLocal(); catCargado = true; return catDatos; }
  try {
    catDatos = await apiAdmin('/catalogos');
    if (catDatos && catDatos.error) { toast(catDatos.error); return null; }
    catCargado = true;
    return catDatos;
  } catch (e) {
    toast(e.red ? 'Sin conexión con el servidor.' : (e.message || 'No se pudo leer el catálogo.'));
    return null;
  }
}

function bloqueCatalogo() {
  return `<details class="catalogo" id="catBloque">
    <summary>Catálogo: universidades, cursos y temas</summary>
    <div id="catPanel"></div>
  </details>`;
}

function pintarCatalogo() {
  const panel = document.getElementById('catPanel');
  if (!panel) return;
  if (!catCargado) {
    panel.innerHTML = '<div class="cat-in"><p class="hint">Abre el catálogo para cargarlo.</p></div>';
    return;
  }
  const cat = catDatos || catLocal();
  const secciones = [['unis', 'Universidades'], ['cursos', 'Cursos'], ['temas', 'Temas']];
  panel.innerHTML = `<div class="cat-in">
    <p class="hint">Lo que renombres aquí se aplica de inmediato a todas las preguntas que lo usan (y a los filtros de la práctica).</p>
    <div class="chips cat-tabs" role="group" aria-label="Elegir catálogo">
      ${secciones.map(([k, l]) => `<button class="chip-btn" type="button" data-act="catsec" data-id="${k}" aria-pressed="${catSeccion === k}">${l}</button>`).join('')}
      <button class="chip-btn" type="button" data-act="catreload">Actualizar</button>
    </div>
    ${catSeccion === 'unis' ? catUniversidades() : catSeccion === 'cursos' ? catCursos(cat) : catTemas(cat)}
  </div>`;
}

const tablaCatalogo = (cab, filas, vacio) => `<div class="table-wrap"><table><thead><tr>${cab.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${filas.length ? filas.join('') : emptyRow(cab.length, vacio)}</tbody></table></div>`;

function catUniversidades() {
  const unis = DB.unis || [];
  const filas = unis.map(u => {
    const enUso = `${nExamenesUni(u.id)} examen(es) · ${nUsoUni(u.codigo)} pregunta(s)`;
    if (catEdit && catEdit.tipo === 'uni' && String(catEdit.id) === String(u.id)) {
      return `<tr>
        <td><input class="input sm" id="catCodigo" maxlength="12" value="${esc(u.codigo || '')}" aria-label="Código de la universidad"></td>
        <td><input class="input sm" id="catNombre" maxlength="150" value="${esc(u.nombre || '')}" aria-label="Nombre de la universidad"></td>
        <td>${enUso}</td>
        <td><label class="check"><input type="checkbox" id="catActiva"${u.activa === false ? '' : ' checked'}><span>Activa</span></label></td>
        <td><div class="row-actions"><button class="btn sm" type="button" data-act="catsav">Guardar</button><button class="link-btn" type="button" data-act="catcan">Cancelar</button></div></td>
      </tr>`;
    }
    return `<tr>
      <td><span class="tag">${esc(u.codigo || '')}</span></td>
      <td>${esc(u.nombre || '')}</td>
      <td>${enUso}</td>
      <td>${u.activa === false ? '<span class="muted">Inactiva</span>' : 'Sí'}</td>
      <td><div class="row-actions"><button class="btn sm line" type="button" data-act="catedit" data-tipo="uni" data-id="${u.id}">Editar</button><button class="link-btn danger" type="button" data-act="catdel" data-tipo="uni" data-id="${u.id}">Eliminar</button></div></td>
    </tr>`;
  });
  return `<form id="catUniForm" class="cat-nuevo">
      <div class="field"><label for="catUniCodigo">Código</label><input class="input" id="catUniCodigo" maxlength="12" placeholder="UNI" autocomplete="off" required></div>
      <div class="field"><label for="catUniNombre">Nombre</label><input class="input" id="catUniNombre" maxlength="150" placeholder="Universidad Nacional de Ingeniería" autocomplete="off" required></div>
      <label class="check"><input type="checkbox" id="catUniActiva" checked><span>Activa</span></label>
      <button class="btn sm" type="submit">Añadir universidad</button>
    </form>
    ${tablaCatalogo(['Código', 'Nombre', 'En uso', 'Activa', 'Acciones'], filas, 'Aún no hay universidades.')}`;
}

function catCursos(cat) {
  const areas = [...new Set([...AREAS, ...cat.areas.map(a => a.nombre)])].filter(Boolean);
  const filas = cat.cursos.map(c => {
    const uso = `${nUsoCurso(c.nombre)} pregunta(s)`;
    if (catEdit && catEdit.tipo === 'curso' && String(catEdit.id) === String(c.id)) {
      return `<tr>
        <td><select class="select sm" id="catAreaCurso" aria-label="Área del curso">${areas.map(a => `<option${a === c.area ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></td>
        <td><input class="input sm" id="catNombreCurso" maxlength="100" value="${esc(c.nombre || '')}" aria-label="Nombre del curso"></td>
        <td>${uso}</td>
        <td><div class="row-actions"><button class="btn sm" type="button" data-act="catsav">Guardar</button><button class="link-btn" type="button" data-act="catcan">Cancelar</button></div></td>
      </tr>`;
    }
    return `<tr>
      <td><span class="tag">${esc(c.area || '')}</span></td>
      <td>${esc(c.nombre || '—')}</td>
      <td>${uso}</td>
      <td><div class="row-actions"><button class="btn sm line" type="button" data-act="catedit" data-tipo="curso" data-id="${c.id}">Editar</button><button class="link-btn danger" type="button" data-act="catdel" data-tipo="curso" data-id="${c.id}">Eliminar</button></div></td>
    </tr>`;
  });
  return `<form id="catCursoForm" class="cat-nuevo">
      <div class="field"><label for="catAreaNueva">Área</label><select class="select" id="catAreaNueva">${AREAS.map(a => `<option>${esc(a)}</option>`).join('')}</select></div>
      <div class="field"><label for="catCursoNuevo">Curso</label><input class="input" id="catCursoNuevo" maxlength="100" placeholder="Ej. Álgebra" autocomplete="off" required></div>
      <button class="btn sm" type="submit">Añadir curso</button>
    </form>
    ${tablaCatalogo(['Área', 'Curso', 'En uso', 'Acciones'], filas, 'Aún no hay cursos.')}`;
}

function catTemas(cat) {
  const filas = cat.temas.map(t => {
    const uso = `${nUsoTema(t.nombre)} pregunta(s)`;
    if (catEdit && catEdit.tipo === 'tema' && String(catEdit.id) === String(t.id)) {
      return `<tr>
        <td><select class="select sm" id="catCursoTema" aria-label="Curso del tema"><option value="">(sin curso)</option>${cat.cursos.map(c => `<option${c.nombre === t.curso ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></td>
        <td><input class="input sm" id="catNombreTema" maxlength="150" value="${esc(t.nombre || '')}" aria-label="Nombre del tema"></td>
        <td>${uso}</td>
        <td><div class="row-actions"><button class="btn sm" type="button" data-act="catsav">Guardar</button><button class="link-btn" type="button" data-act="catcan">Cancelar</button></div></td>
      </tr>`;
    }
    return `<tr>
      <td>${esc(t.curso || '—')}</td>
      <td>${esc(t.nombre || '')}</td>
      <td>${uso}</td>
      <td><div class="row-actions"><button class="btn sm line" type="button" data-act="catedit" data-tipo="tema" data-id="${t.id}">Editar</button><button class="link-btn danger" type="button" data-act="catdel" data-tipo="tema" data-id="${t.id}">Eliminar</button></div></td>
    </tr>`;
  });
  return `<form id="catTemaForm" class="cat-nuevo">
      <div class="field"><label for="catCursoSel">Curso</label><select class="select" id="catCursoSel"><option value="">(sin curso)</option>${cat.cursos.map(c => `<option>${esc(c.nombre)}</option>`).join('')}</select></div>
      <div class="field"><label for="catTemaNuevo">Tema</label><input class="input" id="catTemaNuevo" maxlength="150" placeholder="Ej. Radicación" autocomplete="off" required></div>
      <button class="btn sm" type="submit">Añadir tema</button>
    </form>
    ${tablaCatalogo(['Curso', 'Tema', 'En uso', 'Acciones'], filas, 'Aún no hay temas.')}`;
}

// Termina de guardar: relee el catálogo y repinta lo que depende de los textos
async function catListo(mensaje) {
  if (enServidor()) await catCargar();
  catCargado = true;
  pintarCatalogo();
  fillQuestions();
  if (mensaje) toast(mensaje);
}

function catNuevo(tipo) {
  if (tipo === 'uni') {
    const codigo = $('#catUniCodigo').value.trim().toUpperCase();
    const nombre = $('#catUniNombre').value.trim();
    if (!nombre) return toast('Escribe el nombre de la universidad.');
    if (!/^[A-Z0-9]{2,12}$/.test(codigo)) return toast('El código debe tener de 2 a 12 letras o números (ej. UNI).');
    if ((DB.unis || []).some(u => String(u.codigo).toUpperCase() === codigo)) return toast(`Ya existe el código ${codigo}.`);
    if ((DB.unis || []).some(u => String(u.nombre).toLowerCase() === nombre.toLowerCase())) return toast('Ya existe esa universidad.');
    if (enServidor()) return apiAdmin('/universidades', 'POST', { nombre, codigo, activa: $('#catUniActiva').checked })
      .then(async r => { if (r && r.error) return toast(r.error); DB.unis = DB.unis || []; DB.unis.push({ id: r.id, nombre, codigo, activa: $('#catUniActiva').checked }); await catListo('Universidad añadida.'); })
      .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
    DB.unis = DB.unis || [];
    if (DB.unis.some(u => String(u.codigo).toUpperCase() === codigo)) return toast(`Ya existe el código ${codigo}.`);
    DB.unis.push({ id: 'u' + Date.now(), nombre, codigo, activa: $('#catUniActiva').checked });
    return catListo('Universidad añadida (solo en esta sesión).');
  }
  if (tipo === 'curso') {
    const nombre = $('#catCursoNuevo').value.trim(), area = $('#catAreaNueva').value;
    if (!nombre) return toast('Escribe el nombre del curso.');
    const cat = catDatos || catLocal();
    if (cat.cursos.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) return toast(`Ya existe el curso ${nombre}.`);
    if (enServidor()) return apiAdmin('/catalogos/cursos', 'POST', { area, nombre })
      .then(r => { if (r && r.error) return toast(r.error); return catListo('Curso añadido.'); })
      .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
    cat.cursos.push({ id: 'c' + Date.now(), area, nombre, activo: true, preguntas: 0 });
    return catListo('Curso añadido (solo en esta sesión).');
  }
  const nombre = $('#catTemaNuevo').value.trim(), curso = $('#catCursoSel').value;
  if (!nombre) return toast('Escribe el nombre del tema.');
  const cat = catDatos || catLocal();
  if (cat.temas.some(t => t.nombre.toLowerCase() === nombre.toLowerCase())) return toast(`Ya existe el tema ${nombre}.`);
  if (enServidor()) return apiAdmin('/catalogos/temas', 'POST', { curso, nombre })
    .then(r => { if (r && r.error) return toast(r.error); return catListo('Tema añadido.'); })
    .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
  cat.temas.push({ id: 't' + Date.now(), curso, nombre, activo: true, preguntas: 0 });
  return catListo('Tema añadido (solo en esta sesión).');
}

function catGuardar() {
  const { tipo, id } = catEdit || {};
  if (!tipo) return;
  const cat = catDatos || catLocal();
  if (tipo === 'uni') {
    const codigo = $('#catCodigo').value.trim().toUpperCase();
    const nombre = $('#catNombre').value.trim();
    if (!nombre) return toast('Escribe el nombre de la universidad.');
    if (!/^[A-Z0-9]{2,12}$/.test(codigo)) return toast('El código debe tener de 2 a 12 letras o números (ej. UNI).');
    const activa = $('#catActiva').checked;
    if (enServidor()) return apiAdmin('/universidades/' + id, 'PUT', { nombre, codigo, activa })
      .then(async r => { if (r && r.error) return toast(r.error); const u = (DB.unis || []).find(x => String(x.id) === String(id)); if (u) Object.assign(u, { nombre, codigo, activa }); catEdit = null; await catListo('Universidad actualizada.'); })
      .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
    const u = (DB.unis || []).find(x => String(x.id) === String(id));
    if (u) Object.assign(u, { nombre, codigo, activa });
    catEdit = null;
    return catListo('Universidad actualizada (solo en esta sesión).');
  }
  if (tipo === 'curso') {
    const nombre = $('#catNombreCurso').value.trim(), area = $('#catAreaCurso').value;
    if (!nombre) return toast('El nombre del curso no puede quedar vacío.');
    const fila = cat.cursos.find(c => String(c.id) === String(id));
    if (!fila) return;
    const viejo = fila.nombre;
    if (viejo !== nombre && cat.cursos.some(c => c !== fila && c.nombre.toLowerCase() === nombre.toLowerCase())) return toast(`Ya existe el curso ${nombre}.`);
    const mover = () => { for (const q of DB.questions) if (q.curso === viejo) q.curso = nombre; };
    if (enServidor()) return apiAdmin('/catalogos/cursos/' + id, 'PUT', { nombre, area })
      .then(r => { if (r && r.error) return toast(r.error); mover(); Object.assign(fila, { nombre, area }); catEdit = null; return catListo(r && r.preguntas ? `Curso actualizado: ${r.preguntas} pregunta(s) cambiaron de nombre.` : 'Curso actualizado.'); })
      .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
    mover(); Object.assign(fila, { nombre, area }); catEdit = null;
    return catListo('Curso actualizado (solo en esta sesión).');
  }
  const nombre = $('#catNombreTema').value.trim(), curso = $('#catCursoTema').value;
  if (!nombre) return toast('El nombre del tema no puede quedar vacío.');
  const fila = cat.temas.find(t => String(t.id) === String(id));
  if (!fila) return;
  const viejo = fila.nombre;
  if (viejo !== nombre && cat.temas.some(t => t !== fila && t.nombre.toLowerCase() === nombre.toLowerCase())) return toast(`Ya existe el tema ${nombre}.`);
  const mover = () => { for (const q of DB.questions) if (q.tema === viejo) q.tema = nombre; };
  if (enServidor()) return apiAdmin('/catalogos/temas/' + id, 'PUT', { nombre, curso })
    .then(r => { if (r && r.error) return toast(r.error); mover(); Object.assign(fila, { nombre, curso }); catEdit = null; return catListo(r && r.preguntas ? `Tema actualizado: ${r.preguntas} pregunta(s) cambiaron de nombre.` : 'Tema actualizado.'); })
    .catch(e => toast(e.red ? 'Sin conexión con el servidor.' : e.message));
  mover(); Object.assign(fila, { nombre, curso }); catEdit = null;
  return catListo('Tema actualizado (solo en esta sesión).');
}

async function catEliminar(tipo, id) {
  const cat = catDatos || catLocal();
  if (tipo === 'uni') {
    const u = (DB.unis || []).find(x => String(x.id) === String(id));
    if (!u) return;
    const si = await ask({ title: '¿Eliminar esta universidad?', text: `Se borrará ${u.nombre}. Solo se puede si ningún examen ni ninguna pregunta la usa.`, yes: 'Eliminar', no: 'Cancelar' });
    if (!si) return;
    if (enServidor()) {
      const r = await catApi('/universidades/' + id, 'DELETE');
      if (!r) return;
      DB.unis = (DB.unis || []).filter(x => String(x.id) !== String(id));
      return catListo('Universidad eliminada.');
    }
    DB.unis = (DB.unis || []).filter(x => String(x.id) !== String(id));
    return catListo('Universidad eliminada (solo en esta sesión).');
  }
  const nombre = tipo === 'curso' ? (cat.cursos.find(c => String(c.id) === String(id)) || {}).nombre : (cat.temas.find(t => String(t.id) === String(id)) || {}).nombre;
  if (!nombre) return;
  const n = tipo === 'curso' ? nUsoCurso(nombre) : nUsoTema(nombre);
  const si = await ask({ title: `¿Eliminar ${tipo === 'curso' ? 'el curso' : 'el tema'}?`, text: n ? `${n} pregunta(s) lo usan. Renómbralas o quítales ${tipo === 'curso' ? 'el curso' : 'el tema'} antes de eliminarlo (aquí te avisaremos).` : `Se borrará "${nombre}" del catálogo. Las preguntas no se tocan.`, yes: 'Eliminar', no: 'Cancelar' });
  if (!si) return;
  if (enServidor()) {
    const r = await catApi(`/catalogos/${tipo === 'curso' ? 'cursos' : 'temas'}/` + id, 'DELETE');
    if (!r) return;
    if (tipo === 'curso') cat.cursos = cat.cursos.filter(c => String(c.id) !== String(id));
    else cat.temas = cat.temas.filter(t => String(t.id) !== String(id));
    return catListo('Eliminado del catálogo.');
  }
  if (tipo === 'curso') cat.cursos = cat.cursos.filter(c => String(c.id) !== String(id));
  else cat.temas = cat.temas.filter(t => String(t.id) !== String(id));
  return catListo('Eliminado (solo en esta sesión).');
}

let editingQ = null, lastField = 'fText';
function openQ(id) {
  editingQ = id ? Q(id) : null;
  const q = editingQ;
  $('#qDlgTitle').textContent = q ? 'Editar pregunta' : 'Nueva pregunta';
  $('#fArea').innerHTML = AREAS.map(a => `<option${q && q.area === a ? ' selected' : ''}>${a}</option>`).join('');
  const dif = q ? q.dif : 'intermedio';
  $('#fDif').innerHTML = DIFS.map(([k, l]) => `<label class="rpill"><input type="radio" name="fDif" value="${k}"${k === dif ? ' checked' : ''}>${l}</label>`).join('');
  $('#cursoList').innerHTML = [...new Set(DB.questions.map(x => x.curso).filter(Boolean))].sort().map(c => `<option value="${esc(c)}">`).join('');
  $('#temaList').innerHTML = [...new Set(DB.questions.map(x => x.tema).filter(Boolean))].sort().map(t => `<option value="${esc(t)}">`).join('');
  $('#fCurso').value = q ? q.curso || '' : '';
  $('#fTema').value = q ? q.tema || '' : '';
  $('#fFree').checked = !!(q && q.free);
  // Universidades del ejercicio: píldoras multi-selección (vacío = todas)
  const elegidas = new Set(q ? q.unis || [] : []);
  const codigos = codigosDePreguntas();
  $('#fUnis').innerHTML = codigos.length
    ? codigos.map(c => `<button class="chip-btn" type="button" data-unichip="${esc(c)}" aria-pressed="${elegidas.has(c)}">${esc(c)}</button>`).join('')
    : '<span class="muted">Aún no hay universidades en el catálogo: el ejercicio servirá para todas.</span>';
  $('#fText').value = q ? q.q : '';
  $('#fOpts').innerHTML = [0, 1, 2, 3].map(i => `<div class="opt-row"><input type="radio" name="fCorrect" value="${i}" aria-label="Marcar la alternativa ${'ABCD'[i]} como correcta"${q && q.c === i ? ' checked' : ''}><span class="letter">${'ABCD'[i]}</span><input class="input" id="fO${i}" placeholder="Alternativa ${'ABCD'[i]}" value="${q ? esc(q.o[i]) : ''}"></div>`).join('');
  $('#fWhy').value = q ? q.why : '';
  setImage('fImg', q && q.img ? {...q.img} : null);
  setImage('fWhyImg', q && q.whyImg ? {...q.whyImg} : null);
  $('#qErr').hidden = true; lastField = 'fText';
  renderQPreview();
  $('#qDlg').showModal();
}
function afterImageChange(p) { if (p === 'fImg' || p === 'fWhyImg') renderQPreview(); }

// Vista previa: así verá el estudiante la pregunta (con fórmulas e imágenes)
function renderQPreview() {
  const text = $('#fText').value, o = [0, 1, 2, 3].map(i => ($('#fO' + i) || {}).value || ''), why = $('#fWhy').value;
  const c = document.querySelector('input[name="fCorrect"]:checked');
  $('#qPreview').innerHTML = `<div class="qprev-title">Vista previa como la ve el estudiante</div>
    <div class="qprev">
      <p class="q-text">${text.trim() ? rich(text) : '<span class="muted">El enunciado aparecerá aquí.</span>'}</p>
      ${figHTML(IMG.fImg, 'Imagen del problema')}
      <div class="opts">${o.map((t, i) => `<div class="opt${c && +c.value === i ? ' right' : ''}"><span class="letter">${'ABCD'[i]}</span><span class="opt-text">${t.trim() ? rich(t) : '<span class="muted">Alternativa ' + 'ABCD'[i] + '</span>'}</span></div>`).join('')}</div>
      ${why.trim() || IMG.fWhyImg ? `<p class="sol-why"><strong>Sustento:</strong> ${rich(why)}</p>${figHTML(IMG.fWhyImg, 'Imagen del sustento')}` : ''}
    </div>`;
}
$('#qForm').addEventListener('input', renderQPreview);
$('#qForm').addEventListener('change', renderQPreview);
$('#qForm').addEventListener('focusin', e => { if (/^f(Text|Why|O\d)$/.test(e.target.id)) lastField = e.target.id; });
// Píldoras de universidad: se alternan con el ratón y con el teclado
$('#qForm').addEventListener('click', e => {
  const b = e.target.closest('[data-unichip]'); if (!b) return;
  b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
});
$('#formulaBar').addEventListener('click', e => {
  const b = e.target.closest('[data-ins]'); if (!b) return;
  const el = $('#' + lastField), s = b.dataset.ins, a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
  el.value = el.value.slice(0, a) + s + el.value.slice(z);
  el.focus(); el.setSelectionRange(a + s.length, a + s.length); renderQPreview();
});

// Cuerpo que espera el servidor para POST/PUT /admin/preguntas
function cuerpoPregunta(q) {
  return {
    area: q.area, dif: q.dif, q: q.q, o: q.o, c: q.c, why: q.why || '',
    curso: q.curso || '', tema: q.tema || '', gratis: !!q.free,
    activa: q.activa !== false, imagen: q.img || null, sustento_imagen: q.whyImg || null,
    universidad: (q.unis || []).join('|'),
  };
}

$('#qForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#fText').value.trim(), why = $('#fWhy').value.trim();
  const o = [0, 1, 2, 3].map(i => $('#fO' + i).value.trim());
  const correct = document.querySelector('input[name="fCorrect"]:checked');
  let msg = '';
  if (!text) msg = 'Escribe el enunciado de la pregunta.';
  else if (o.some(x => !x)) msg = 'Completa las cuatro alternativas.';
  else if (new Set(o.map(x => x.toLowerCase())).size < 4) msg = 'Las alternativas no pueden repetirse.';
  else if (!correct) msg = 'Marca cuál es la alternativa correcta.';
  else if (!why) msg = 'Escribe el sustento de la respuesta.';
  if (msg) { $('#qErr').textContent = msg; $('#qErr').hidden = false; return; }
  const data = {area:$('#fArea').value, dif:document.querySelector('input[name="fDif"]:checked').value, curso:$('#fCurso').value.trim(), tema:$('#fTema').value.trim(), free:$('#fFree').checked,
                unis:[...document.querySelectorAll('#fUnis [data-unichip][aria-pressed="true"]')].map(b => b.dataset.unichip),
                q:text, o, c:+correct.value, why, img:IMG.fImg ? {...IMG.fImg} : null, whyImg:IMG.fWhyImg ? {...IMG.fWhyImg} : null};
  const isNew = !editingQ;
  const cuerpo = cuerpoPregunta({...editingQ, ...data});

  if (enServidor()) {
    const r = await guardarEnServidor(isNew ? '/preguntas' : '/preguntas/' + editingQ.dbId, isNew ? 'POST' : 'PUT', cuerpo, true);
    if (r === 'error') return;
    if (r === true) {
      audit(isNew ? 'Creó una pregunta' : 'Editó una pregunta', text.slice(0, 80));
      $('#qDlg').close(); toast(isNew ? 'Pregunta agregada al banco.' : 'Pregunta actualizada.'); renderAdmin();
      return;
    }
    // sin conexión: continúa en local (abajo)
  }
  if (editingQ) Object.assign(editingQ, data); else DB.questions.push({id:uid(), ...data});
  audit(isNew ? 'Creó una pregunta' : 'Editó una pregunta', text.slice(0, 80));
  $('#qDlg').close(); toast(isNew ? 'Pregunta agregada al banco.' : 'Pregunta actualizada.'); renderAdmin();
});

/* ---------- Importar preguntas desde Excel (CSV) ---------- */
const IMPORT_HEAD = ['area', 'universidad', 'dificultad', 'curso', 'tema', 'enunciado', 'A', 'B', 'C', 'D', 'correcta', 'sustento', 'gratis'];
let importRows = [];
$('#iTemplate').onclick = () => downloadTemplate();
function downloadTemplate() {
  downloadFile('plantilla-preguntas.csv', toCSV([IMPORT_HEAD,
    ['Matemáticas', 'UNI', 'facil', 'Álgebra', 'Ecuaciones lineales', 'Si $3x + 5 = 20$, ¿cuál es el valor de $x$?', '3', '5', '7', '15', 'B', 'Restando 5 queda $3x = 15$, entonces $x = 5$.', 'no'],
    ['Ciencias', 'UNMSM|UNALM', 'intermedio', 'Física', 'Cinemática: MRU', 'Un móvil recorre 120 km en 2 h. ¿Cuál es su rapidez media?', '40 km/h', '60 km/h', '80 km/h', '240 km/h', 'B', '$v = d / t = 120 / 2 = 60$ km/h.', 'no']]));
}
const areaKey = s => normKey(s).replace(/s$/, '');
function parseImport(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return {error:'El archivo está vacío o solo tiene los encabezados.'};
  const head = rows[0].map(normKey), idx = k => head.indexOf(normKey(k));
  const missing = ['area', 'dificultad', 'enunciado', 'A', 'B', 'C', 'D', 'correcta', 'sustento'].filter(k => idx(k) < 0);
  if (missing.length) return {error:'Faltan estas columnas: ' + missing.join(', ') + '. Descarga la plantilla para ver el formato.'};
  const known = new Set(DB.questions.map(q => normKey(q.q))), seen = new Set();
  const difMap = {facil:'facil', intermedio:'intermedio', media:'intermedio', dificil:'dificil'};
  // Catálogo de universidades: código canónico y nombre (si el panel no trae
  // universidades —modo demo— la columna se acepta tal cual y no se valida).
  const catUnis = new Map();
  for (const u of (DB.unis || [])) {
    const cod = ((u.codigo || u.nombre || '') + '').trim().toUpperCase();
    if (!cod) continue;
    catUnis.set(cod, cod);
    if (u.nombre) catUnis.set(String(u.nombre).trim().toUpperCase(), cod);
  }
  const codigosUni = [...new Set(catUnis.values())];
  return {rows: rows.slice(1).map((r, n) => {
    const g = k => ((r[idx(k)] || '') + '').trim();
    const area = AREAS.find(a => areaKey(a) === areaKey(g('area')) || areaKey(a).startsWith(areaKey(g('area'))) && areaKey(g('area')).length >= 4);
    const dif = difMap[normKey(g('dificultad'))];
    const unisRaw = splitUnis(g('universidad')), unis = unisRaw.map(u => catUnis.get(u) || u);
    const malUni = unisRaw.some(u => !catUnis.has(u)) && catUnis.size > 0;
    const o = ['A', 'B', 'C', 'D'].map(g);
    const cRaw = normKey(g('correcta')), c = 'abcd'.indexOf(cRaw) >= 0 && cRaw.length === 1 ? 'abcd'.indexOf(cRaw) : (/^[1-4]$/.test(cRaw) ? +cRaw - 1 : -1);
    let err = '';
    if (!g('enunciado')) err = 'Falta el enunciado.';
    else if (!area) err = 'Área no reconocida.';
    else if (!dif) err = 'Dificultad no reconocida (usa fácil, intermedio o difícil).';
    else if (malUni) err = 'Universidad no reconocida. Usa: ' + codigosUni.join(', ') + '.';
    else if (o.some(x => !x)) err = 'Falta alguna alternativa.';
    else if (new Set(o.map(x => x.toLowerCase())).size < 4) err = 'Hay alternativas repetidas.';
    else if (c < 0) err = 'La columna correcta debe ser A, B, C o D.';
    else if (!g('sustento')) err = 'Falta el sustento.';
    const key = normKey(g('enunciado')), dup = !err && (known.has(key) || seen.has(key));
    if (!err) seen.add(key);
    const free = ['si', 'sí', '1', 'true', 'x'].includes(normKey(g('gratis')));
    return {n:n + 2, err, dup, q:{area, dif, curso:g('curso'), tema:g('tema'), q:g('enunciado'), o, c, why:g('sustento'), free, unis, img:null}};
  })};
}
function openImport() {
  importRows = []; $('#iFile').value = ''; $('#iPreview').innerHTML = ''; $('#iOk').disabled = true; $('#iOk').textContent = 'Importar preguntas';
  $('#iDlg').showModal();
}
$('#iFile').addEventListener('change', async () => {
  const f = $('#iFile').files[0]; if (!f) return;
  const r = parseImport(await f.text());
  if (r.error) { importRows = []; $('#iPreview').innerHTML = `<p class="form-err">${esc(r.error)}</p>`; $('#iOk').disabled = true; return; }
  importRows = r.rows;
  const ok = importRows.filter(x => !x.err && !x.dup), bad = importRows.filter(x => x.err), dup = importRows.filter(x => x.dup);
  $('#iPreview').innerHTML = `<p class="hint"><b>${ok.length}</b> listas, <b>${bad.length}</b> con errores, <b>${dup.length}</b> repetidas (se omiten).</p>
    <div class="table-wrap"><table style="min-width:520px"><thead><tr><th scope="col">Fila</th><th scope="col">Enunciado</th><th scope="col">Estado</th></tr></thead><tbody>${importRows.slice(0, 200).map(x => `<tr><td class="num">${x.n}</td><td><div class="clamp">${esc(x.q.q)}</div></td><td>${x.err ? `<span class="st expired">${esc(x.err)}</span>` : x.dup ? '<span class="st none">Repetida</span>' : '<span class="st active">Lista</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  $('#iOk').disabled = !ok.length; $('#iOk').textContent = `Importar ${ok.length} ${ok.length === 1 ? 'pregunta' : 'preguntas'}`;
});
$('#iOk').onclick = async () => {
  const ok = importRows.filter(x => !x.err && !x.dup);
  if (enServidor()) {
    let guardadas = 0, rechazadas = 0, cortado = false;
    for (const x of ok) {
      try { await apiAdmin('/preguntas', 'POST', cuerpoPregunta(x.q)); guardadas++; }
      catch (err) { if (err.red) { cortado = true; break; } rechazadas++; }
    }
    try { await hidratarAdmin(); } catch { /* seguimos con lo guardado */ }
    audit('Importó preguntas', `${guardadas} preguntas desde un archivo`);
    $('#iDlg').close();
    toast(cortado ? `Se guardaron ${guardadas} y luego se cortó la conexión.` : rechazadas ? `${guardadas} guardadas; ${rechazadas} rechazadas por el servidor.` : `${guardadas} preguntas importadas.`);
    renderAdmin();
    return;
  }
  ok.forEach(x => DB.questions.push({id:uid(), ...x.q}));
  audit('Importó preguntas', `${ok.length} preguntas desde un archivo`);
  $('#iDlg').close(); toast(`${ok.length} preguntas importadas.`); renderAdmin();
};

/* ---------- Exámenes ---------- */
function renderExamsAdmin() {
  const s = DB.settings;
  $('#adminBody').innerHTML = pageHead('Exámenes y tiempos', `<span class="st none">${DB.exams.length} exámenes</span>`)
    + '<h2 class="sr">Configuración de exámenes</h2>'
    + '<div class="toolbar"><button class="btn push" type="button" data-act="newe">Nuevo examen</button></div>'
    + `<div class="table-wrap wide"><table><thead><tr><th scope="col">Examen</th><th scope="col">Estado</th><th scope="col">Preguntas</th><th scope="col">Tiempo total</th><th scope="col">Puntaje</th><th scope="col">Acciones</th></tr></thead><tbody>${
      DB.exams.map(e => `<tr>
        <td class="cell-user"><strong>${esc(e.title)}</strong><small>${esc(e.uni)}, ${esc(e.full)}</small></td>
        <td><select class="select sm" data-pubsel="${e.id}" aria-label="Estado de ${esc(e.title)}"><option value="1"${e.published !== false ? ' selected' : ''}>Publicado</option><option value="0"${e.published === false ? ' selected' : ''}>Borrador</option></select></td>
        <td class="num">${e.count} <small class="muted">de ${e.poolIds.filter(id => Q(id)).length}</small></td>
        <td><div class="row-actions"><input class="input sm mins" type="number" min="1" max="600" value="${e.mins}" data-mins="${e.id}" aria-label="Tiempo total en minutos de ${esc(e.title)}"><span class="muted">min</span></div></td>
        <td><small class="muted">${e.pc ?? 1} por correcta, ${e.pw ?? 0} por incorrecta${(e.scale ?? 20) > 0 ? ', sobre ' + (e.scale ?? 20) : ''}</small></td>
        <td><div class="row-actions"><button class="btn sm line" type="button" data-act="edite" data-id="${e.id}">Editar</button><button class="link-btn" type="button" data-act="dupe" data-id="${e.id}">Duplicar</button><button class="link-btn danger" type="button" data-act="dele" data-id="${e.id}">Eliminar</button></div></td>
      </tr>`).join('') || emptyRow(6, 'Aún no hay exámenes. Crea el primero.')
    }</tbody></table></div>`
    + `<section class="settings" aria-label="Ajustes generales">
        <h3>Ajustes generales</h3>
        <p class="muted">Controlan el examen personalizado, los límites diarios, los referidos y el mensaje de revisión de pagos.</p>
        <div class="settings-grid">
          <div class="field"><label for="sMin">Minutos por pregunta (examen personalizado)</label><input class="input" id="sMin" type="number" min="0.5" max="10" step="0.5" value="${s.minPerQ}" data-setting="minPerQ"></div>
          <div class="field"><label for="sMax">Máximo de preguntas por examen</label><input class="input" id="sMax" type="number" min="1" max="200" value="${s.maxQ}" data-setting="maxQ"></div>
          <div class="field"><label for="sDay">Simulacros por día y por estudiante</label><input class="input" id="sDay" type="number" min="1" max="100" value="${s.maxPerDay}" data-setting="maxPerDay"></div>
          <div class="field"><label for="sRef">Días de bono por referido</label><input class="input" id="sRef" type="number" min="0" max="30" value="${s.referralDays}" data-setting="referralDays"></div>
          <div class="field" style="grid-column:1/-1"><label for="sEta">Mensaje sobre el tiempo de revisión de pagos</label><input class="input" id="sEta" type="text" maxlength="140" value="${esc(s.eta)}" placeholder="Ej. Revisamos los pagos todos los días de 8 a. m. a 10 p. m." data-setting="eta"><p class="hint">Se muestra al estudiante después de enviar su pago. Déjalo vacío si prefieres no prometer un tiempo.</p></div>
        </div>
      </section>
      <section class="settings" aria-label="Cobros con Yape">
        <h3>Cobros con Yape</h3>
        <p class="muted">Estos datos ve el estudiante en la página de pago: el número al que yapea, el nombre y el QR que escanea con su app.</p>
        <div class="settings-grid">
          <div class="field"><label for="sYapeNum">Número de Yape</label><input class="input" id="sYapeNum" type="text" inputmode="numeric" maxlength="20" value="${esc(YAPE.number)}" data-yape="number" placeholder="Ej. 999 999 999" autocomplete="off"></div>
          <div class="field"><label for="sYapeName">Nombre que aparece</label><input class="input" id="sYapeName" type="text" maxlength="40" value="${esc(YAPE.name)}" data-yape="name" placeholder="Ej. Simulacros PE" autocomplete="off"></div>
        </div>
        <div class="yape-qr-row">
          <div class="qr" id="sYapeQrPrev">${YAPE.qr ? `<img src="${esc(YAPE.qr)}" alt="Vista previa del QR de Yape">` : 'Sin QR todavía'}</div>
          <div class="yape-qr-side">
            <label class="btn line sm" for="sYapeQrFile">${ICON.image}<span>Subir QR</span></label>
            <input class="sr" type="file" id="sYapeQrFile" accept="image/png,image/jpeg,image/webp">
            <button class="link-btn danger" type="button" data-act="yapeqrdel"${YAPE.qr ? '' : ' hidden'}>Quitar QR</button>
            <p class="err-msg" id="sYapeQrErr" role="alert"></p>
            <p class="hint">PNG, JPG o WEBP, máximo 2 MB. Sube la imagen original de tu QR para que se escanee sin problemas.</p>
          </div>
        </div>
      </section>
      <section class="settings" aria-label="Simulacro personalizado: qué ve el estudiante">
        <h3>Simulacro personalizado: qué ve el estudiante</h3>
        <p class="muted">Tú decides si el estudiante elige cuántas preguntas quiere, y si ve la cantidad disponible junto a cada opción.</p>
        <label class="check"><input type="checkbox" id="sSlider"${s.showQuestionSlider ? ' checked' : ''} data-toggle="showQuestionSlider"><span>Mostrar el control de "Número de preguntas" (si lo apagas, siempre se usa el máximo disponible)</span></label>
        <label class="check"><input type="checkbox" id="sCntArea"${s.showCountArea ? ' checked' : ''} data-toggle="showCountArea"><span>Mostrar la cantidad de preguntas por área</span></label>
        <label class="check"><input type="checkbox" id="sCntCurso"${s.showCountCurso ? ' checked' : ''} data-toggle="showCountCurso"><span>Mostrar la cantidad de preguntas por curso</span></label>
        <label class="check"><input type="checkbox" id="sCntTema"${s.showCountTema ? ' checked' : ''} data-toggle="showCountTema"><span>Mostrar la cantidad de preguntas por tema</span></label>
        <label class="check"><input type="checkbox" id="sCntDif"${s.showCountDif ? ' checked' : ''} data-toggle="showCountDif"><span>Mostrar la cantidad de preguntas por dificultad</span></label>
      </section>
      <section class="settings" aria-label="Planes">
        <h3>Planes</h3>
        <p class="muted">La matriz tiene 4 periodos (una columna por periodo) y 3 niveles de acceso (Básico, Intermedio y Completo), 12 planes en total. Cambias la duración de cada periodo y el precio de cada celda: el cambio se refleja en la web, en el pago y al conceder accesos. El "Ahorras %" se calcula solo, comparando con el plan del mismo nivel de un día.</p>
        <div class="settings-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));align-items:start;gap:16px">
          ${PERIODOS.map(per => {
            const ps = planesDePeriodo(per.id);
            if (!ps.length) return '';
            return `
          <div class="plan-edit">
            <h4>${esc(per.name)} <small>${textoDe(per.dias)}</small></h4>
            <div class="field"><label for="planDays-${per.id}">Duración (días)</label><input class="input" id="planDays-${per.id}" type="number" min="1" max="365" step="1" value="${Math.round(ps[0].ms / 864e5)}" data-plandays="${per.id}"></div>
            ${NIVELES.map(n => {
              const p = ps.find(x => x.nivel === n.id);
              if (!p) return '';
              return `<div class="field"><label for="planPrice-${p.id}">${esc(n.name)} (S/)</label><input class="input" id="planPrice-${p.id}" type="number" min="0.5" max="999" step="0.5" value="${p.price}" data-planprice="${p.id}"><p class="hint" data-planlabel="${p.id}">S/ ${p.price}${p.unit}</p><p class="hint" data-savelabel="${p.id}">${esc(p.save) || 'Referencia de comparación'}</p></div>`;
            }).join('')}
          </div>`;
          }).join('')}
        </div>
      </section>`;
}

let editingE = null, pickIds = [], pickArea = 'all';
function openExam(id) {
  editingE = id ? DB.exams.find(e => e.id === id) : null;
  const e = editingE;
  $('#eDlgTitle').textContent = e ? 'Editar examen' : 'Nuevo examen';
  $('#eTitle').value = e ? e.title : ''; $('#eTag').value = e ? e.uni : ''; $('#eFull').value = e ? e.full : ''; $('#eMins').value = e ? e.mins : '';
  $('#ePub').checked = e ? e.published !== false : false;
  $('#ePc').value = e ? e.pc ?? 1 : 1; $('#ePwrong').value = e ? e.pw ?? 0 : 0; $('#eScale').value = e ? e.scale ?? 20 : 20;
  $('#eDailyCount').value = e ? e.count : '';
  pickIds = e ? e.poolIds.filter(id => Q(id)) : []; pickArea = 'all';
  $('#eArea').innerHTML = '<option value="all">Todas las áreas</option>' + AREAS.map(a => `<option>${a}</option>`).join('');
  $('#eErr').hidden = true;
  renderPick();
  $('#eDlg').showModal();
}
function renderPick() {
  const list = DB.questions.filter(q => pickArea === 'all' || q.area === pickArea);
  $('#ePick').innerHTML = list.map(q => `<label class="pick"><input type="checkbox" value="${q.id}"${pickIds.includes(q.id) ? ' checked' : ''}><div class="clamp">${rich(q.q)}</div><div class="pick-tags"><span class="tag">${esc(q.area)}</span>${difBadge(q.dif)}</div></label>`).join('') || '<p style="padding:16px">No hay preguntas en esta área.</p>';
  $('#eCount').textContent = `(${pickIds.length} en el banco)`;
  $('#eDailyCount').max = pickIds.length || 1;
}
$('#ePick').addEventListener('change', e => {
  const id = e.target.value;
  if (e.target.checked) { if (!pickIds.includes(id)) pickIds.push(id); } else pickIds = pickIds.filter(x => x !== id);
  $('#eCount').textContent = `(${pickIds.length} en el banco)`;
  $('#eDailyCount').max = pickIds.length || 1;
});
$('#eArea').addEventListener('change', e => { pickArea = e.target.value; renderPick(); });
$('#eClear').onclick = () => { pickIds = []; renderPick(); };
// Resuelve la universidad por código o nombre; si no cambió, la del examen actual
function resolveUni(tag, exam) {
  const t = (tag || '').trim().toUpperCase(), lista = DB.unis || [];
  const u = lista.find(x => (x.codigo || '').toUpperCase() === t)
         || lista.find(x => (x.nombre || '').toUpperCase() === t);
  if (u) return u.id;
  if (exam && exam.dbUniId && (exam.uni || '').toUpperCase() === t) return exam.dbUniId;
  return null;
}

// Cuerpo que espera el servidor para POST/PUT /admin/examenes
function cuerpoExamen(ex) {
  return {
    universidad_id: ex.dbUniId, nombre: ex.title, minutos: ex.mins,
    cantidad_preguntas: ex.count, publicado: ex.published !== false,
    escala: ex.scale ?? 20, pc: ex.pc ?? 1, pw: ex.pw ?? 0,
  };
}

$('#eForm').addEventListener('submit', async e => {
  e.preventDefault();
  const title = $('#eTitle').value.trim(), tag = $('#eTag').value.trim().toUpperCase(), full = $('#eFull').value.trim(), mins = Math.round(+$('#eMins').value);
  const pc = +$('#ePc').value, pw = +$('#ePwrong').value, scale = +$('#eScale').value, dailyCount = Math.round(+$('#eDailyCount').value);
  let msg = '';
  if (!title) msg = 'Escribe el título del examen.';
  else if (!tag) msg = 'Escribe la etiqueta de la universidad, por ejemplo UNI.';
  else if (!(mins >= 1 && mins <= 600)) msg = 'El tiempo total debe estar entre 1 y 600 minutos.';
  else if (!(pc > 0)) msg = 'Los puntos por respuesta correcta deben ser mayores que 0.';
  else if (!Number.isFinite(pw) || pw > 0) msg = 'Los puntos por respuesta incorrecta deben ser 0 o negativos (por ejemplo -0.25).';
  else if (!(scale >= 0)) msg = 'La escala final debe ser 0 (puntos directos) o un número positivo.';
  else if (!pickIds.length) msg = 'Elige al menos una pregunta para el banco.';
  else if (!(dailyCount >= 1 && dailyCount <= pickIds.length)) msg = `Las preguntas por intento deben ser entre 1 y ${pickIds.length} (el tamaño del banco).`;
  if (msg) { $('#eErr').textContent = msg; $('#eErr').hidden = false; return; }
  const data = {uni:tag, title, full, mins, poolIds:[...pickIds], count:dailyCount, published:$('#ePub').checked, pc, pw, scale};
  const isNew = !editingE;

  if (enServidor()) {
    const uniId = resolveUni(tag, editingE);
    if (!uniId) {
      $('#eErr').textContent = `No encontramos la universidad "${tag}". Usa el código de: ${(DB.unis || []).map(u => u.codigo || u.nombre).join(', ') || 'una universidad existente'}.`;
      $('#eErr').hidden = false;
      return;
    }
    try {
      const cuerpo = {universidad_id: uniId, nombre: title, minutos: mins, cantidad_preguntas: dailyCount, publicado: data.published, escala: scale, pc, pw};
      const resp = await apiAdmin(editingE ? '/examenes/' + editingE.dbId : '/examenes', editingE ? 'PUT' : 'POST', cuerpo);
      const examId = editingE ? editingE.dbId : resp.id;
      const poolDb = pickIds.map(id => (Q(id) || {}).dbId).filter(id => id != null);
      await apiAdmin('/examenes/' + examId + '/pool', 'PUT', {pregunta_ids: poolDb, cantidad: dailyCount});
      try { await hidratarAdmin(); } catch { /* espejo local */ }
      audit(isNew ? 'Creó un examen' : 'Editó un examen', title);
      $('#eDlg').close(); toast(isNew ? 'Examen creado.' : 'Examen actualizado.'); renderAdmin();
      return;
    } catch (err) {
      if (!err.red) { $('#eErr').textContent = err.message; $('#eErr').hidden = false; return; }
      // sin conexión: continúa en local (abajo)
    }
  }
  if (editingE) Object.assign(editingE, data); else DB.exams.push({id:uid(), ...data});
  audit(isNew ? 'Creó un examen' : 'Editó un examen', title);
  $('#eDlg').close(); toast(isNew ? 'Examen creado.' : 'Examen actualizado.'); renderAdmin();
});

/* ---------- Reportes de errores ---------- */
function renderReports() {
  const open = DB.reports.filter(r => r.status === 'open'), done = DB.reports.filter(r => r.status !== 'open');
  const list = repView === 'open' ? open : done;
  const cards = list.map(r => {
    const q = Q(r.qid), u = DB.users.find(x => x.id === r.userId);
    return `<article class="report-card">
      <header class="report-head">
        <div><strong>${esc(u ? u.name : 'Estudiante')}</strong><small>${fmtDT(r.ts)} · ${esc(r.reason)}</small></div>
        ${r.status === 'open'
          ? `<button class="btn sm" type="button" data-act="resolve" data-id="${r.id}">Marcar resuelto</button>`
          : `<span class="st active">Resuelto${r.repliedAt ? ' · ' + fmtDT(r.repliedAt) : ''}</span>`}
      </header>
      <p class="report-q">${q ? rich(q.q) : '<span class="muted">Pregunta eliminada</span>'}</p>
      ${q ? `<button class="link-btn" type="button" data-act="editq" data-id="${q.id}">Ver o editar la pregunta</button>` : ''}
      ${r.note ? `<p class="report-note"><strong>Comentario del estudiante:</strong> ${esc(r.note)}</p>` : ''}
      <div class="field report-reply">
        <label for="reply-${r.id}">Tu respuesta</label>
        <textarea class="textarea" id="reply-${r.id}" rows="2" placeholder="Escribe aquí tu respuesta al estudiante...">${esc(r.reply || '')}</textarea>
        <button class="btn line sm" type="button" data-act="reply" data-id="${r.id}">Guardar respuesta</button>
      </div>
    </article>`;
  }).join('');
  $('#adminBody').innerHTML = pageHead('Reportes de errores', `<span class="st ${open.length ? 'expired' : 'none'}">${open.length} ${open.length === 1 ? 'abierto' : 'abiertos'}</span>`)
    + `<div class="toolbar"><div class="seg" role="group" aria-label="Estado de los reportes"><button type="button" data-repview="open" aria-pressed="${repView === 'open'}">Abiertos (${open.length})</button><button type="button" data-repview="done" aria-pressed="${repView === 'done'}">Resueltos (${done.length})</button></div></div>`
    + (list.length ? `<div class="reports-list">${cards}</div>`
      : `<div class="empty">${repView === 'open' ? 'No hay reportes abiertos. Cuando un estudiante reporte un error en el solucionario, aparecerá aquí.' : 'Aún no hay reportes resueltos.'}</div>`);
}

/* ---------- Cupones de descuento ---------- */
function renderCoupons() {
  $('#adminBody').innerHTML = pageHead('Cupones de descuento', `<span class="st none">${DB.coupons.length} cupones</span>`)
    + '<h2 class="sr">Gestión de cupones</h2>'
    + `<form class="settings" id="cpForm" novalidate>
        <h3>Nuevo cupón</h3>
        <div class="settings-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div class="field"><label for="cnCode">Código</label><input class="input" id="cnCode" maxlength="20" placeholder="BIENVENIDA"></div>
          <div class="field"><label for="cnPct">Descuento (%)</label><input class="input" id="cnPct" type="number" min="1" max="90" placeholder="20"></div>
          <div class="field"><label for="cnMax">Usos máximos (opcional)</label><input class="input" id="cnMax" type="number" min="1" placeholder="100"></div>
          <div class="field"><label for="cnExp">Vence (opcional)</label><input class="input" id="cnExp" type="date"></div>
        </div>
        <p class="form-err" id="cnErr" role="alert" hidden></p>
        <button class="btn" type="submit">Crear cupón</button>
      </form>
      <div class="table-wrap wide" style="margin-top:24px"><table><thead><tr><th scope="col">Código</th><th scope="col">Descuento</th><th scope="col">Usos</th><th scope="col">Vence</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${
        DB.coupons.map(c => `<tr><td class="num">${esc(c.code)}</td><td class="num">${c.percent} %</td><td class="num">${c.used}${c.max != null ? ' / ' + c.max : ''}</td><td>${c.expires ? esc(c.expires) : '<span class="muted">Sin vencimiento</span>'}</td>
          <td><span class="st ${c.active ? 'active' : 'none'}">${c.active ? 'Activo' : 'Desactivado'}</span></td>
          <td><div class="row-actions"><button class="btn sm line" type="button" data-act="cptoggle" data-id="${esc(c.code)}">${c.active ? 'Desactivar' : 'Activar'}</button><button class="link-btn danger" type="button" data-act="cpdel" data-id="${esc(c.code)}">Eliminar</button></div></td></tr>`).join('') || emptyRow(6, 'Aún no hay cupones.')
      }</tbody></table></div>`;
}

/* ---------- Actividad (quién hizo qué) ---------- */
function renderActivity() {
  $('#adminBody').innerHTML = pageHead('Actividad del panel', `<span class="st none">${DB.audit.length} registros</span>`)
    + `<div class="table-wrap wide"><table><thead><tr><th scope="col">Fecha</th><th scope="col">Quién</th><th scope="col">Acción</th><th scope="col">Detalle</th></tr></thead><tbody>${
      DB.audit.slice(0, 200).map(a => `<tr><td>${fmtDT(a.at)}</td><td>${esc(a.who)}</td><td><strong>${esc(a.action)}</strong></td><td>${esc(a.detail)}</td></tr>`).join('') || emptyRow(4, 'Aún no hay actividad.')
    }</tbody></table></div>`;
}

/* ---------- Exportar a Excel (CSV) ---------- */
function exportPayments() {
  downloadFile('pagos.csv', toCSV([['Fecha', 'Estudiante', 'Correo', 'Plan', 'Monto', 'Cupón', 'N° de operación', 'Estado'],
    ...DB.payments.map(p => { const u = DB.users.find(x => x.id === p.userId) || {}; return [fmtDT(p.ts), u.name, u.email, plan(p.plan).name, p.amount.toFixed(2), p.coupon || '', p.op, {pending:'Pendiente', approved:'Aprobado', rejected:'Rechazado'}[p.status]]; })]));
  audit('Exportó pagos', 'Archivo CSV');
}
function exportUsers() {
  downloadFile('usuarios.csv', toCSV([['Nombre', 'Correo', 'Plan', 'Estado', 'Vence', 'Simulacros rendidos', 'Universidad meta', 'Facultad', 'Escuela', 'Fecha del examen'],
    ...DB.users.map(u => [u.name, u.email, u.plan ? plan(u.plan).name : '', STATE_CHIP[accessState(u)][1], u.until ? todayKey(u.until) : '', u.simulacros != null ? u.simulacros : u.results.filter(r => !r.practice).length, u.goal ? u.goal.uni || '' : '', u.goal ? u.goal.facultad || '' : '', u.goal ? u.goal.escuela || '' : '', u.goal ? u.goal.date : ''])]));
  audit('Exportó usuarios', 'Archivo CSV');
}

/* ---------- Eventos del panel admin ---------- */
function refreshPlanLabel(p) {
  const el = document.querySelector(`[data-planlabel="${p.id}"]`);
  if (el) el.textContent = `S/ ${p.price}${p.unit}`;
}
// El ahorro depende del precio de Día, así que se refresca de una vez.
function refreshSaveLabels() {
  document.querySelectorAll('[data-savelabel]').forEach(el => {
    const p = PLANS.find(x => x.id === el.dataset.savelabel);
    if (p) el.textContent = p.save || 'Referencia de comparación';
  });
}

// Al abrir el bloque del catálogo se carga (y se da de alta lo que falte)
$('#adminBody').addEventListener('toggle', async e => {
  if (e.target.id !== 'catBloque' || !e.target.open || catCargado) return;
  const r = await catCargar();
  pintarCatalogo();
  if (r) toast('Catálogo cargado.');
}, true);

$('#adminBody').addEventListener('click', async e => {
  const pv = e.target.closest('[data-payview]'); if (pv) { payView = pv.dataset.payview; return renderPayments(); }
  const rv = e.target.closest('[data-repview]'); if (rv) { repView = rv.dataset.repview; return renderReports(); }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const id = a.dataset.id, act = a.dataset.act;
  // Catálogo: universidades, cursos y temas
  if (act === 'catsec') { catSeccion = id; catEdit = null; return pintarCatalogo(); }
  if (act === 'catcan') { catEdit = null; return pintarCatalogo(); }
  if (act === 'catedit') { catEdit = {tipo: a.dataset.tipo, id}; return pintarCatalogo(); }
  if (act === 'catsav') return catGuardar();
  if (act === 'catdel') return catEliminar(a.dataset.tipo, id);
  if (act === 'catreload') { catEdit = null; const r = await catCargar(); pintarCatalogo(); if (r) toast('Catálogo actualizado.'); return; }
  if (act === 'retry') return renderPayments();
  if (act === 'approve' || act === 'reject') return reviewPayment(id, act);
  if (act === 'proof') { const p = DB.payments.find(x => x.id === id); $('#zImg').src = p.proof; $('#zImg').alt = 'Captura del comprobante de pago'; return $('#zDlg').showModal(); }
  if (act === 'exportPay') return exportPayments();
  if (act === 'exportUsers') return exportUsers();
  if (act === 'grant') return openGrant(id);
  if (act === 'revoke') {
    const u = DB.users.find(x => x.id === id);
    const yes = await ask({title:'¿Revocar el acceso?', text:`${u.name} perderá el acceso a los simulacros de inmediato.`, yes:'Revocar acceso', no:'Cancelar'});
    if (yes) {
      if (enServidor()) {
        const r = await guardarEnServidor('/usuarios/' + id, 'PATCH', {plan: null});
        if (r === 'error') return;
      }
      u.plan = null; u.until = null; audit('Revocó un acceso', u.name); toast('Acceso revocado.'); ensureTheme(); renderAdmin();
    }
    return;
  }
  if (act === 'delu') {
    const u = DB.users.find(x => x.id === id);
    if (!u) return;
    const extra = u.simulacros ? ` Incluye ${u.simulacros} simulacro(s) y todo su historial.` : '';
    const yes = await ask({
      title: '¿Eliminar esta cuenta?',
      text: `Se borrará la cuenta de ${u.email} y todo lo que tiene guardado.${extra} Esta acción no se puede deshacer.`,
      yes: 'Eliminar cuenta',
      no: 'Cancelar',
    });
    if (!yes) return;
    const ok = await guardarEnServidor('/usuarios/' + id, 'DELETE', undefined, true);
    if (ok === false) { if (!enServidor()) toast('Sin conexión con el servidor: no se puede eliminar ahora.'); return; }
    if (ok === 'error') return;
    DB.users = DB.users.filter(x => x.id !== id);
    audit('Eliminó una cuenta', u.email);
    renderAdmin();
    toast('Cuenta eliminada.');
    return;
  }
  if (act === 'newq') return openQ();
  if (act === 'editq') return openQ(id);
  if (act === 'importq') return openImport();
  if (act === 'delq') {
    const yes = await ask({title:'¿Eliminar esta pregunta?', text:'También se quitará de los exámenes que la incluyan.', yes:'Eliminar pregunta', no:'Cancelar'});
    if (yes) {
      const q = Q(id);
      if (enServidor()) {
        const r = await guardarEnServidor('/preguntas/' + (q ? q.dbId : id), 'DELETE');
        if (r === 'error') return;
      }
      DB.questions = DB.questions.filter(x => x.id !== id); DB.exams.forEach(x => { x.poolIds = x.poolIds.filter(i => i !== id); x.count = Math.min(x.count, x.poolIds.length || 1); }); audit('Eliminó una pregunta', (q ? q.q : id).slice(0, 80)); toast('Pregunta eliminada.'); renderAdmin();
    }
    return;
  }
  if (act === 'resolve') {
    const r = DB.reports.find(x => x.id === id);
    if (enServidor()) {
      const s = await guardarEnServidor('/reportes/' + r.id, 'PATCH', {estado:'resolved'});
      if (s === 'error') return;
    }
    r.status = 'resolved'; audit('Resolvió un reporte', (Q(r.qid) || {q:''}).q.slice(0, 80)); toast('Reporte resuelto.'); return renderAdmin();
  }
  if (act === 'reply') {
    const r = DB.reports.find(x => x.id === id), text = $('#reply-' + id).value.trim();
    if (enServidor()) {
      const s = await guardarEnServidor('/reportes/' + r.id, 'PATCH', {respuesta: text});
      if (s === 'error') return;
    }
    r.reply = text; r.repliedAt = text ? new Date() : null;
    audit('Respondió un reporte', (Q(r.qid) || {q:''}).q.slice(0, 80));
    toast(text ? 'Respuesta guardada.' : 'Respuesta borrada.');
    return;
  }
  if (act === 'newe') return openExam();
  if (act === 'edite') return openExam(id);
  if (act === 'dupe') {
    const ex = DB.exams.find(x => x.id === id);
    if (enServidor()) {
      try {
        const resp = await apiAdmin('/examenes', 'POST', {...cuerpoExamen(ex), nombre: ex.title + ' (copia)', publicado: false});
        const poolDb = ex.poolIds.map(qid => (Q(qid) || {}).dbId).filter(x => x != null);
        await apiAdmin('/examenes/' + resp.id + '/pool', 'PUT', {pregunta_ids: poolDb, cantidad: ex.count});
        try { await hidratarAdmin(); } catch { /* espejo local */ }
        audit('Duplicó un examen', ex.title); toast('Examen duplicado como borrador.'); return renderAdmin();
      } catch (err) { if (!err.red) { toast(err.message); return; } }
    }
    DB.exams.push({...ex, id:uid(), title:ex.title + ' (copia)', poolIds:[...ex.poolIds], count:ex.count, published:false});
    audit('Duplicó un examen', ex.title); toast('Examen duplicado como borrador.'); return renderAdmin();
  }
  if (act === 'dele') {
    const ex = DB.exams.find(x => x.id === id);
    const yes = await ask({title:'¿Eliminar este examen?', text:`Se eliminará "${ex.title}". Las preguntas seguirán en el banco.`, yes:'Eliminar examen', no:'Cancelar'});
    if (yes) {
      if (enServidor()) {
        const r = await guardarEnServidor('/examenes/' + ex.dbId, 'DELETE');
        if (r === 'error') return;
      }
      DB.exams = DB.exams.filter(x => x.id !== id); audit('Eliminó un examen', ex.title); toast('Examen eliminado.'); renderAdmin();
    }
    return;
  }
  if (act === 'yapeqrdel') {
    YAPE.qr = '';
    syncAjustes('yape');
    audit('Quitó el QR de Yape', 'El pago muestra el texto de relleno');
    toast('QR quitado.');
    return renderAdmin();
  }
  if (act === 'cptoggle') {
    const c = DB.coupons.find(x => x.code === id);
    if (enServidor()) {
      const r = await guardarEnServidor('/cupones/' + encodeURIComponent(c.code), 'PUT', {activo: !c.active});
      if (r === 'error') return;
    }
    c.active = !c.active; audit(c.active ? 'Activó un cupón' : 'Desactivó un cupón', c.code); return renderAdmin();
  }
  if (act === 'cpdel') {
    const yes = await ask({title:'¿Eliminar este cupón?', text:`El código ${id} dejará de funcionar. Los pagos que ya lo usaron no cambian.`, yes:'Eliminar cupón', no:'Cancelar'});
    if (yes) {
      if (enServidor()) {
        const r = await guardarEnServidor('/cupones/' + encodeURIComponent(id), 'DELETE');
        if (r === 'error') return;
      }
      DB.coupons = DB.coupons.filter(x => x.code !== id); audit('Eliminó un cupón', id); renderAdmin();
    }
  }
});
// Guarda en el servidor la sección de ajustes modificada:
// 'limites' (límites y visibilidad), 'planes' (precios) o 'yape' (datos de cobro)
function syncAjustes(seccion) {
  if (!enServidor()) return;
  const cuerpo = {limites: DB.settings, planes: PLANS, yape: YAPE}[seccion];
  apiAdmin('/ajustes', 'PUT', {[seccion]: cuerpo}).catch(err => {
    if (!err.red) toast('No se pudo guardar en el servidor: ' + err.message);
  });
}

$('#adminBody').addEventListener('submit', async e => {
  if (e.target.id === 'catUniForm' || e.target.id === 'catCursoForm' || e.target.id === 'catTemaForm') {
    e.preventDefault();
    return catNuevo(e.target.id === 'catUniForm' ? 'uni' : e.target.id === 'catCursoForm' ? 'curso' : 'tema');
  }
  if (e.target.id !== 'cpForm') return;
  e.preventDefault();
  const code = $('#cnCode').value.trim().toUpperCase(), pct = Math.round(+$('#cnPct').value), max = $('#cnMax').value ? Math.round(+$('#cnMax').value) : null, exp = $('#cnExp').value || null;
  let msg = '';
  if (!/^[A-Z0-9]{3,20}$/.test(code)) msg = 'El código debe tener de 3 a 20 letras o números, sin espacios.';
  else if (DB.coupons.some(c => c.code === code)) msg = 'Ya existe un cupón con ese código.';
  else if (!(pct >= 1 && pct <= 90)) msg = 'El descuento debe estar entre 1 % y 90 %.';
  else if (max !== null && !(max >= 1)) msg = 'Los usos máximos deben ser al menos 1.';
  if (msg) { $('#cnErr').textContent = msg; $('#cnErr').hidden = false; return; }
  if (enServidor()) {
    const r = await guardarEnServidor('/cupones', 'POST', {codigo: code, porcentaje: pct, activo: true, vence: exp, max_usos: max}, true);
    if (r === 'error') return;
    if (r === true) { audit('Creó un cupón', `${code}, ${pct} %`); toast('Cupón creado.'); renderAdmin(); return; }
    // sin conexión: sigue en local (abajo)
  }
  DB.coupons.unshift({code, percent:pct, active:true, expires:exp, max, used:0});
  audit('Creó un cupón', `${code}, ${pct} %`); toast('Cupón creado.'); renderAdmin();
});
$('#adminBody').addEventListener('input', e => {
  if (e.target.id === 'uSearch') { uQuery = e.target.value; fillUsers(); }
  if (e.target.id === 'qSearch') { qFilter.text = e.target.value; fillQuestions(); }
  if (e.target.id === 'qArea') { qFilter.area = e.target.value; fillQuestions(); }
  if (e.target.id === 'qDif') { qFilter.dif = e.target.value; fillQuestions(); }
  if (e.target.id === 'qCurso') { qFilter.curso = e.target.value; fillQuestions(); }
  if (e.target.id === 'qTema') { qFilter.tema = e.target.value; fillQuestions(); }
  if (e.target.id === 'qUni') { qFilter.uni = e.target.value; fillQuestions(); }
});
$('#adminBody').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.difsel) {
    const q = Q(t.dataset.difsel), prev = q.dif;
    q.dif = t.value;
    if (enServidor()) guardarEnServidor('/preguntas/' + q.dbId, 'PUT', cuerpoPregunta(q)).then(r => {
      if (r === 'error') { q.dif = prev; t.value = prev; }
    });
    audit('Cambió la dificultad', `${DIF_LABEL[t.value]}: ${q.q.slice(0, 60)}`); toast('Dificultad actualizada.');
  }
  if (t.dataset.pubsel) {
    const ex = DB.exams.find(x => x.id === t.dataset.pubsel);
    ex.published = t.value === '1';
    if (enServidor()) guardarEnServidor('/examenes/' + ex.dbId, 'PUT', cuerpoExamen(ex)).then(r => {
      if (r === 'error') { ex.published = !ex.published; t.value = ex.published ? '1' : '0'; }
    });
    audit(ex.published ? 'Publicó un examen' : 'Pasó un examen a borrador', ex.title); toast(ex.published ? 'Examen publicado.' : 'Examen guardado como borrador.');
  }
  if (t.dataset.mins) {
    const v = Math.round(+t.value), ex = DB.exams.find(x => x.id === t.dataset.mins);
    if (v >= 1 && v <= 600) {
      const prev = ex.mins;
      ex.mins = v;
      if (enServidor()) guardarEnServidor('/examenes/' + ex.dbId, 'PUT', cuerpoExamen(ex)).then(r => {
        if (r === 'error') { ex.mins = prev; t.value = prev; }
      });
      audit('Cambió el tiempo de un examen', `${ex.title}: ${v} min`); toast('Tiempo del examen actualizado.');
    } else { t.value = ex.mins; toast('Escribe un tiempo entre 1 y 600 minutos.'); }
  }
  if (t.dataset.toggle) {
    const key = t.dataset.toggle; DB.settings[key] = t.checked;
    syncAjustes('limites');
    audit('Cambió un ajuste de visibilidad', `${key}: ${t.checked ? 'activado' : 'desactivado'}`);
    toast('Ajuste guardado.');
  }
  if (t.dataset.planprice) {
    const p = PLANS.find(x => x.id === t.dataset.planprice);
    if (!p) return;
    const v = Math.round(+t.value * 100) / 100;
    if (!(v >= 0.5 && v <= 999)) { t.value = p.price; return toast('Escribe un precio entre S/ 0.50 y S/ 999.'); }
    p.price = v; recalcPlan(p); refreshPlanLabel(p);
    // Si cambió un plan de Día, cambia el ahorro de los otros 9.
    recalcAhorros(); refreshSaveLabels();
    syncAjustes('planes');
    audit('Cambió el precio de un plan', `${p.name}: S/ ${v.toFixed(2)}${p.unit}`);
    toast('Precio del plan actualizado.');
  }
  if (t.dataset.plandays) {
    // La duración es del periodo: cambia sus 3 niveles a la vez.
    const grupo = planesDePeriodo(t.dataset.plandays);
    if (!grupo.length) return;
    const d = Math.round(+t.value);
    if (!(d >= 1 && d <= 365)) { t.value = Math.round(grupo[0].ms / 864e5); return toast('Escribe una duración entre 1 y 365 días.'); }
    grupo.forEach(p => { p.ms = d * 864e5; recalcPlan(p); refreshPlanLabel(p); });
    recalcAhorros(); refreshSaveLabels();
    if (t.value !== String(d)) t.value = d;
    syncAjustes('planes');
    audit('Cambió la duración de un periodo', `${grupo[0].name}: ${d} ${d === 1 ? 'día' : 'días'}`);
    toast('Duración actualizada: los 3 niveles del periodo cambian juntos.');
  }
  if (t.dataset.yape) {
    const key = t.dataset.yape, val = t.value.trim().replace(/\s+/g, ' ');
    if (key === 'number') {
      if (val.replace(/\D/g, '').length < 6) { t.value = YAPE.number; return toast('Escribe un número de Yape válido (mínimo 6 dígitos).'); }
      YAPE.number = val;
      audit('Actualizó el número de Yape', val);
    } else {
      if (val.length < 2) { t.value = YAPE.name; return toast('Escribe el nombre que se mostrará.'); }
      YAPE.name = val;
      audit('Actualizó el nombre de Yape', val);
    }
    syncAjustes('yape');
    toast('Dato de Yape guardado.');
  }
  if (t.id === 'sYapeQrFile') {
    const f = t.files[0]; t.value = '';
    const errEl = document.getElementById('sYapeQrErr'); if (!errEl) return;
    errEl.textContent = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return void (errEl.textContent = 'Usa una imagen PNG, JPG o WEBP.');
    if (f.size > IMG_MAX) return void (errEl.textContent = 'La imagen pesa más de 2 MB.');
    uploadImage(f).then(url => {
      YAPE.qr = url;
      syncAjustes('yape');
      const prev = document.getElementById('sYapeQrPrev');
      if (prev) prev.innerHTML = `<img src="${url}" alt="Vista previa del QR de Yape">`;
      const del = document.querySelector('[data-act="yapeqrdel"]'); if (del) del.hidden = false;
      audit('Actualizó el QR de Yape', 'Imagen nueva');
      toast('QR guardado. Ya se ve en la página de pago.');
    }).catch(() => { errEl.textContent = 'No pudimos leer esa imagen.'; });
  }
  if (t.dataset.setting) {
    const key = t.dataset.setting;
    if (key === 'eta') { DB.settings.eta = t.value.trim(); syncAjustes('limites'); toast('Mensaje guardado.'); return; }
    const v = +t.value, lim = {minPerQ:[0.5, 10], maxQ:[1, 200], maxPerDay:[1, 100], referralDays:[0, 30]}[key];
    if (v >= lim[0] && v <= lim[1]) { DB.settings[key] = key === 'minPerQ' ? v : Math.round(v); syncAjustes('limites'); toast('Ajuste guardado.'); } else { t.value = DB.settings[key]; toast(`Escribe un valor entre ${lim[0]} y ${lim[1]}.`); }
  }
});
$('#adminbar').addEventListener('click', e => {
  const n = e.target.closest('[data-admin]'); if (n) return showAdmin(n.dataset.admin);
  if (e.target.closest('[data-toapp]')) { e.preventDefault(); showDash(); }
});
