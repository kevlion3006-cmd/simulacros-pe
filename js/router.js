/* =====================================================================
   VISTAS Y RUTAS
   Cada pantalla tiene su dirección (#/planes, #/examen, #/admin/pagos...), así el botón Atrás del
   celular y del navegador funciona, y se pueden compartir enlaces.
   ===================================================================== */
const VIEWS = ['home', 'auth', 'plans', 'pay', 'dash', 'exam', 'results', 'admin', 'privacidad', 'terminos'];
const TITLES = {
  home:'Simulacros PE - Practica para tu examen de admisión', auth:'Simulacros PE - Cuenta', plans:'Elige tu plan - Simulacros PE',
  pay:'Pago - Simulacros PE', dash:'Simulacros PE - Dashboard', exam:'Examen en curso - Simulacros PE',
  results:'Resultados - Simulacros PE', admin:'Admin - Simulacros PE',
  privacidad:'Política de privacidad - Simulacros PE', terminos:'Términos de uso - Simulacros PE'
};

function setView(v) {
  document.body.dataset.view = v;
  VIEWS.forEach(x => { $('#view-' + x).hidden = x !== v; });
  $('#topbar').hidden = !['home', 'dash', 'exam', 'results', 'plans', 'pay', 'privacidad', 'terminos'].includes(v);
  $('#topbar').classList.toggle('slim', ['plans', 'pay'].includes(v));
  $('#topbar').classList.toggle('guest', v === 'home' || (guestState.on && ['exam', 'results'].includes(v)));
  $('#tabsbar').hidden = !['dash', 'results'].includes(v) || guestState.on;
  $('#adminbar').hidden = v !== 'admin';
  document.title = TITLES[v];
  window.scrollTo({top:0});
  focusView(v);
}

// Al cambiar de pantalla, el foco pasa al título: los lectores de pantalla anuncian dónde estás
function focusView(v) {
  const root = $('#view-' + v);
  const h = root && root.querySelector('h1, h2');
  if (!h) return;
  h.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => h.focus({preventScroll:true}));
}

function markTab(id) { $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === id))); }
function showTab(id) {
  guestState.on = false;
  setView('dash'); markTab(id);
  ['eval', 'res', 'bank'].forEach(p => { $('#panel-' + p).hidden = p !== id; });
  pushPath(id === 'eval' ? '/' : id === 'res' ? '/resultados' : '/bancos');
  renderDash();
}
const showDash = () => showTab('eval');

/* ---------- Rutas ---------- */
let routing = false, lastRouted = null;
const currentPath = () => {
  const h = location.hash.slice(1);
  if (h) return h;
  // Tambien funcionan las URLs limpias: /privacidad y /terminos
  const ruta = location.pathname.replace(/^\/+|\/+$/g, '');
  return ruta ? '/' + ruta : '/';
};

function pushPath(p) {
  if (!routing && currentPath() !== p) history.pushState(null, '', '#' + p);
  lastRouted = p;
}

function route() {
  const path = currentPath();
  lastRouted = path; routing = true;
  try { dispatch(path); }
  catch (e) { reportError(e, 'route ' + path); showTab('eval'); }
  finally { routing = false; }
}

function dispatch(path) {
  const [, a, b] = path.split('/');
  // Con un examen en curso, "Atrás" no lo abandona sin preguntar
  if (S && S.active && a !== 'examen' && a !== 'prueba') {
    history.pushState(null, '', S.trial ? '#/prueba' : '#/examen'); lastRouted = currentPath();
    leaveExam(); return;
  }
  // Tras cerrar sesión no hay usuario: las pantallas que necesitan una cuenta vuelven al inicio
  const needsSession = !['inicio', 'entrar', 'registro', 'prueba', 'privacidad', 'terminos'].includes(a);
  if (!meId && needsSession) return showHome();
  switch (a) {
    case undefined: case '': return showTab('eval');
    case 'resultados': return showTab('res');
    case 'bancos': return showTab('bank');
    case 'inicio': return showHome();
    case 'privacidad': return setView('privacidad');
    case 'terminos': return setView('terminos');
    case 'entrar': return showAuth('login');
    case 'registro': return showAuth('register');
    case 'planes': return showPlans();
    case 'pago': return showPay();
    case 'examen': return (S && S.active) ? setView('exam') : showTab('eval');
    case 'prueba': return (S && S.active) ? setView('exam') : showHome();
    case 'resultado': return LAST ? showResultsView() : showTab('res');
    case 'admin': return showAdmin(b);
    default: return showTab('eval');
  }
}

window.addEventListener('popstate', () => { if (currentPath() !== lastRouted) route(); });
window.addEventListener('hashchange', () => { if (currentPath() !== lastRouted) route(); });
