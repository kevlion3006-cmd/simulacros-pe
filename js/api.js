/* =====================================================================
   CAPA DE RED — API de Simulacros PE (FastAPI)

   - Guarda la sesión (token JWT en localStorage) y expone helpers
     para llamar a la API con fetch.
   - Si el servidor no responde, API.online queda en false y la app
     sigue funcionando con los datos demo de data.js (modo demo).
   ===================================================================== */

const TOKEN_KEY = 'spe.token';
const API = { base: null, online: false, bootDone: false, datosCargados: false };

function apiBase() {
  if (API.base !== null) return API.base;
  // FastAPI/Render sirven el frontend en el mismo origen;
  // serve.py (:8080) deja el backend en localhost:8000.
  API.base = location.port === '8080' ? 'http://localhost:8000' : '';
  return API.base;
}

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

/* Llamada genérica. Lanza Error:
   - err.red = true  → sin conexión (el llamador puede usar el modo demo)
   - err.status     → el servidor respondió con un error (mensaje listo) */
async function net(ruta, { method = 'GET', body = null, auth = false, timeout = 8000 } = {}) {
  // Sin token no tiene sentido pedir un endpoint con sesión: el servidor
  // respondería 401 y el usuario vería un mensaje confuso con "sesión iniciada".
  if (auth && !getToken()) {
    const e = new Error('Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.');
    e.status = 401;
    throw e;
  }
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), timeout);
  let resp;
  try {
    const encabezados = { 'Content-Type': 'application/json' };
    if (auth && getToken()) encabezados.Authorization = 'Bearer ' + getToken();
    resp = await fetch(apiBase() + ruta, {
      method,
      headers: encabezados,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    API.online = false;
    // AbortError = se agotó el tiempo de espera (servidor arrancando o lento):
    // no es "sin conexión" y no debe caer en el modo demo.
    const tardio = !!(err && err.name === 'AbortError');
    const e = new Error(tardio
      ? 'El servidor está tardando demasiado (puede estar arrancando). Espera unos segundos y vuelve a intentar.'
      : 'No hay conexión con el servidor');
    e.red = true;
    e.tardio = tardio;
    throw e;
  } finally {
    clearTimeout(reloj);
  }

  API.online = true;
  let datos = null;
  try { datos = await resp.json(); } catch { /* sin cuerpo JSON */ }
  // El backend responde errores como {"error": "..."} (a veces con status 200):
  // en ese caso también se lanza, para que todos los llamados usen try/catch.
  const fallo = !resp.ok || (datos && typeof datos === 'object' && !Array.isArray(datos) && !!datos.error);
  if (fallo) {
    const msg = (datos && (datos.error || datos.detail)) || ('Error ' + resp.status);
    const e = new Error(typeof msg === 'string' ? msg : 'Error ' + resp.status);
    e.status = resp.ok ? 400 : resp.status;
    e.datos = datos;
    // El servidor avisa que el plan venció: la app lleva al usuario a elegir
    // plan sin esperar a que recargue la página.
    if (datos && datos.sin_acceso) e.sinAcceso = true;
    throw e;
  }
  return datos;
}

/* ===================== conversores servidor → frontend ===================== */

// Las fechas que llegan del servidor pueden venir sin 'Z' (UTC). Convertirlas
// para que todos los relojes muestren el mismo tiempo restante.
function fechaUTC(valor) {
  if (!valor) return null;
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(valor)) return new Date(valor);
  return new Date(valor + 'Z');
}

const mapUser = u => ({
  id: String(u.id),
  name: u.nombre || '',
  email: u.email || '',
  pw: undefined,
  plan: u.plan || null,
  nivel: u.nivel || null,
  until: fechaUTC(u.plan_hasta),
  results: [],
  refCode: u.ref_code || null,
  referredBy: u.referido_por != null ? String(u.referido_por) : null,
  goal: (u.meta_uni || u.meta_fecha || u.facultad || u.escuela)
    ? { uni: u.meta_uni || '', date: u.meta_fecha || '', facultad: u.facultad || '', escuela: u.escuela || '' }
    : null,
  rol: u.rol || 'estudiante',
  estado: u.estado || 'active',
  photo: fotoGuardada(String(u.id)),
  simulacros: u.simulacros,   // solo /admin/usuarios: total rendidos
  hoy: u.hoy,                 // solo /admin/usuarios: rendidos hoy
  servidor: true,
});

const mapResult = r => ({
  id: r.id,
  name: r.examen || '',
  uni: r.universidad || '',
  ts: new Date(r.fecha),
  pct: r.pct || 0,
  total: r.total || 0,
  used: r.segundos || 0,
  areas: r.areas || {},
  difs: r.difs || {},
  cursos: r.cursos || {},
  temas: r.temas || {},
  practice: !!r.practice,
});

const mapExam = e => ({
  id: String(e.id),
  dbId: e.id,
  dbUniId: e.universidad_id,
  uni: e.codigo || e.universidad || '',
  title: e.nombre,
  full: e.nombre,
  mins: Math.max(1, Math.round((e.duracion_segundos || 3600) / 60)),
  poolIds: e.pool_claves || [],
  count: e.cantidad_preguntas || (e.pool_claves || []).length,
  published: !!e.publicado,
  activo: e.activo !== false,
  pc: e.pc != null ? Number(e.pc) : 1,
  pw: e.pw != null ? Number(e.pw) : 0,
  scale: e.escala != null ? Number(e.escala) : 20,
});

const mapQuestion = p => ({
  id: p.clave || String(p.id),
  dbId: p.id,
  area: p.area,
  dif: p.dificultad,
  q: p.texto,
  why: p.sustento || '',
  o: (p.alternativas || []).map(a => a.texto),
  c: p.c != null ? p.c : 0,
  curso: p.curso || '',
  tema: p.tema || '',
  free: !!p.gratis,
  img: p.imagen || null,
  whyImg: p.sustento_imagen || null,
  unis: splitUnis(p.universidad),
  altIds: (p.alternativas || []).map(a => a.id),
});

const mapPayment = p => ({
  id: String(p.id),
  userId: String(p.usuario_id),
  name: p.nombre || '',
  email: p.email || '',
  plan: p.plan,
  amount: Number(p.monto),
  op: p.operacion || '',
  ts: fechaUTC(p.fecha),
  status: p.estado,
  coupon: p.cupon || null,
  proof: p.comprobante || null,
  motivo: p.motivo || null,
  approvedAt: p.revisado_at ? new Date(p.revisado_at) : null,
});

const mapReport = r => ({
  id: String(r.id),
  qid: r.clave || String(r.pregunta_id),
  userId: r.usuario_id != null ? String(r.usuario_id) : null,
  user: r.usuario || '',
  email: r.email || '',
  reason: r.motivo,
  note: r.nota || '',
  ts: fechaUTC(r.fecha),
  status: r.estado,
  reply: r.respuesta || '',
  repliedAt: r.respondido_at ? new Date(r.respondido_at) : null,
  pregunta: r.pregunta || '',
});

const mapCoupon = c => ({
  code: c.codigo,
  percent: c.porcentaje,
  active: c.activo !== false,
  expires: c.vence || null,
  max: c.max_usos != null ? c.max_usos : null,
  used: c.usados || 0,
});

const mapAudit = a => ({
  at: fechaUTC(a.fecha),
  who: a.quien || 'Admin',
  action: a.accion,
  detail: a.detalle || '',
});

/* ===================== datos del sitio ===================== */

async function cargarAjustes() {
  const aj = await net('/ajustes');
  if (Array.isArray(aj.planes) && aj.planes.length) {
    // Solo se acepta si trae la matriz completa (4 periodos x 3 niveles):
    // una lista vieja de 3 planes rompería la pantalla en dos pasos.
    const lista = aj.planes.map(p => ({
      ...p,
      ms: Number(p.ms) || 7 * 864e5,
      periodo: PERIODOS.some(x => x.id === p.periodo) ? p.periodo : periodoDePlan(p.id),
      nivel: NIVELES.some(x => x.id === p.nivel) ? p.nivel : nivelDePlan(p.id)
    })).filter(p => p.periodo && p.nivel);
    const completa = PERIODOS.every(per => NIVELES.every(niv =>
      lista.some(p => p.id === `${per.id}-${niv.id}`)));
    if (completa) {
      PLANS.length = 0; lista.forEach(p => PLANS.push(p));
      // "Ahorras %" y "Más elegido" se derivan de los precios y del periodo, así
      // que se recalculan aquí: lo que esté guardado (listas antiguas) no manda.
      PLANS.forEach(p => { p.best = p.nivel === 'intermedio'; recalcPlan(p); });
    }
  }
  if (aj.yape) Object.assign(YAPE, aj.yape);
  if (aj.limites) Object.assign(DB.settings, aj.limites);
}

async function cargarExamenes() {
  const exs = await net('/examenes');
  if (!Array.isArray(exs) || !exs.length) return;
  const publicados = exs.filter(e => e.publicado !== false && e.activo !== false);
  DB.exams = (publicados.length ? publicados : exs).map(mapExam);

  // Preguntas frescas de cada examen (contenido editado por el admin)
  const vistas = new Set();
  const lista = [];
  for (const e of DB.exams) {
    try {
      const ps = await net('/preguntas/' + e.dbId);
      ps.forEach(p => {
        if (p.clave && !vistas.has(p.clave)) { vistas.add(p.clave); lista.push(mapQuestion(p)); }
      });
    } catch { /* seguimos con las preguntas demo */ }
  }
  if (lista.length) {
    DB.questions.forEach(q => { if (!vistas.has(q.id)) lista.push(q); });
    DB.questions = lista;
  }
}

async function cargarMapa() {
  const mapa = await net('/mapa-preguntas');
  DB.qmap = {};
  DB.qmapInv = {};
  mapa.forEach(x => {
    if (x.clave) { DB.qmap[x.clave] = x.id; DB.qmapInv[x.id] = x.clave; }
  });
  DB.questions.forEach(q => { if (q.dbId == null) q.dbId = DB.qmap[q.id]; });
}

/* Historial + referidos + pagos del usuario */
async function hidratarUsuario(u) {
  // Si el arranque se saltó el paso de datos (servidor arrancando), al entrar
  // cargamos ahora ajustes, exámenes y mapa para no quedar con datos demo.
  if (!API.datosCargados) {
    try { await cargarAjustes(); } catch { /* demo */ }
    try { await cargarExamenes(); } catch { /* demo */ }
    try { await cargarMapa(); } catch { /* demo */ }
    API.datosCargados = true;
  }

  try {
    const res = await net('/usuarios/' + u.id + '/resultados', { auth: true });
    u.results = (res || []).map(mapResult);
  } catch { u.results = u.results || []; }

  let referidos = [];
  try {
    const refs = await net('/usuarios/yo/referidos', { auth: true });
    referidos = (refs || []).map((r, i) => ({
      id: 'ref' + i + '-' + u.id,
      name: r.nombre || '',
      email: '',
      plan: r.plan || null,
      until: fechaUTC(r.plan_hasta),
      results: [],
      referredBy: u.id,
      refCode: null,
      goal: null,
      pw: undefined,
      servidor: true,
    }));
  } catch { /* sin referidos */ }

  try {
    const mios = await net('/pagos/mios', { auth: true });
    DB.payments = (mios || []).map(mapPayment);
  } catch { /* se quedan los pagos demo */ }

  DB.users = [u, ...referidos];
}

/* ===================== sesión ===================== */

async function apiLogin(email, password) {
  // timeout largo: en el plan free el servidor puede estar arrancando (hasta ~50 s).
  const r = await net('/auth/login', { method: 'POST', body: { email, password }, timeout: 60000 });
  setToken(r.token);
  const u = mapUser(r.usuario);
  meId = u.id;
  await hidratarUsuario(u);
  return u;
}

async function apiRegistro(datos) {
  const r = await net('/auth/registro', { method: 'POST', body: datos, timeout: 60000 });
  setToken(r.token);
  const u = mapUser(r.usuario);
  meId = u.id;
  await hidratarUsuario(u);
  return u;
}

async function apiGoogleConfig() {
  return net('/auth/google/config', { timeout: 10000 });
}

// Inicia sesion (o crea la cuenta) con la credencial de Google ya validada
// por el servidor. Devuelve tambien si la cuenta se creo ahora.
async function apiGoogle(credential) {
  const r = await net('/auth/google', { method: 'POST', body: { credential }, timeout: 60000 });
  setToken(r.token);
  const u = mapUser(r.usuario);
  meId = u.id;
  await hidratarUsuario(u);
  return { usuario: u, nuevo: !!r.nuevo };
}

function apiLogout() { setToken(''); }

async function apiGuardarPerfil(datos) {
  const r = await net('/auth/me', { method: 'PATCH', body: datos, auth: true });
  return mapUser(r.usuario);
}

// Pregunta al servidor cómo sigue el acceso, sin recargar la página. Se llama al
// volver a la pestaña: así un pago recién aprobado se ve al instante, y un
// acceso que el administrador quitó también.
async function refrescarAcceso() {
  if (!getToken() || !API.bootDone) return null;
  const u = me();
  if (!u) return null;
  try {
    const r = await net('/auth/me', { auth: true, timeout: 20000 });
    if (String(r.usuario.id) !== String(u.id)) return null;
    // Solo los datos de acceso: pisar el objeto entero borraría los resultados
    // que ya están cargados en memoria.
    u.plan = r.usuario.plan || null;
    u.until = fechaUTC(r.usuario.plan_hasta);
    u.estado = r.usuario.estado || 'active';
    return u;
  } catch { return null; }
}

/* ===================== examen ===================== */

async function apiCrearIntento(payload) {
  try {
    return await net('/intentos', { method: 'POST', body: payload, auth: true });
  } catch (e) {
    // El plan venció y el servidor no da el intento. Se lleva a la pantalla de
    // planes sin esperar al refresco. Va aquí y no en quien llama, para que
    // ningún camino de la interfaz se quede sin avisar.
    if (e.sinAcceso) irAPlanesVencidos();
    throw e;
  }
}

async function apiPreguntasIntento(intentoId) {
  return net('/intentos/' + intentoId + '/preguntas', { auth: true });
}

async function apiGuardarRespuesta(intentoId, preguntaId, alternativaId) {
  return net('/intentos/' + intentoId + '/respuestas', {
    method: 'POST',
    body: { pregunta_id: preguntaId, alternativa_id: alternativaId },
    auth: true,
  });
}

async function apiFinalizarIntento(intentoId) {
  return net('/intentos/' + intentoId + '/finalizar', { method: 'POST', auth: true });
}

/* ===================== pagos, cupones, reportes ===================== */

const apiValidarCupon = codigo => net('/cupones/validar', { method: 'POST', body: { codigo } });

const apiPagar = datos => net('/pagos', { method: 'POST', body: datos, auth: true });

const apiPagosMios = () => net('/pagos/mios', { auth: true });

const apiReportar = datos => net('/reportes', { method: 'POST', body: datos, auth: true });

function apiEvento(accion, detalle) {
  return net('/eventos', { method: 'POST', body: { accion, detalle } });
}

/* ===================== admin ===================== */

async function apiAdmin(ruta, method = 'GET', body = undefined) {
  return net('/admin' + ruta, { method, body, auth: true });
}

/* ===================== arranque ===================== */

async function bootAPI() {
  // 1) ¿responde la API?
  try {
    await net('/api', { timeout: 5000 });
    API.online = true;
  } catch {
    API.online = false;
    API.bootDone = true;
    return; // modo demo con los datos de data.js
  }

  // 2) ajustes del sitio (planes, yape, límites)
  try { await cargarAjustes(); } catch { /* demo */ }

  // 3) exámenes + preguntas + mapa de claves
  try { await cargarExamenes(); } catch { /* demo */ }
  try { await cargarMapa(); } catch { /* demo */ }
  API.datosCargados = true;

  // 4) sesión guardada
  if (getToken()) {
    try {
      const r = await net('/auth/me', { auth: true, timeout: 30000 });
      const u = mapUser(r.usuario);
      meId = u.id;
      await hidratarUsuario(u);
    } catch (e) {
      // Token inválido/expirado → se borra; servidor lento (red/tardío) → se conserva
      // el token pero no hay sesión verificada: nunca queda el 'me' de la demo.
      if (!e.red) setToken('');
      meId = null;
    }
  } else {
    // Con servidor y sin sesión no hay auto-login de la demo:
    // el visitante es un invitado (el modo demo queda para cuando no hay red)
    meId = null;
  }

  API.bootDone = true;
}
