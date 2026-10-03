/* =====================================================================
   EVENTOS GENERALES E INICIO
   ===================================================================== */
document.addEventListener('click', e => {
  const t = e.target;
  const tab = t.closest('.tab'); if (tab) return showTab(tab.dataset.tab);
  const go = t.closest('[data-goto]'); if (go) return showTab(go.dataset.goto);
  const st = t.closest('[data-start]'); if (st) return startById(st.dataset.start);
  const pe = t.closest('[data-practice-exam]'); if (pe) return startById(pe.dataset.practiceExam, {practice:true});
  const ge = t.closest('[data-group-exam]'); if (ge) return openGroupDialog(ge.dataset.groupExam);
  if (t.closest('[data-plans]')) return showPlans();
  if (t.closest('[data-trial]')) return startTrial();
  const sc = t.closest('[data-scroll]'); if (sc) return document.getElementById(sc.dataset.scroll).scrollIntoView({behavior:'smooth'});
  const pr = t.closest('[data-practice]'); if (pr) return presetBuilder(pr.dataset.practice);
  const pn = t.closest('[data-practice-now]'); if (pn) return practiceArea(pn.dataset.practiceNow);
  const pt = t.closest('[data-practice-curso]'); if (pt) return practiceCurso(pt.dataset.practiceCurso);
  const au = t.closest('[data-auth]'); if (au) return showAuth(au.dataset.auth);
  const cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('Código copiado.'), () => toast('No pudimos copiarlo. Selecciónalo y cópialo a mano.')); return; }
  const fig = t.closest('.fig-btn');
  if (fig) { const im = fig.querySelector('img'); $('#zImg').src = im.src; $('#zImg').alt = im.alt; return $('#zDlg').showModal(); }
  const cl = t.closest('[data-close]'); if (cl) return cl.closest('dialog').close();
  const rp = t.closest('[data-report]'); if (rp) return openReport(rp.dataset.report);
  if (t.closest('#builder')) {
    const ba = t.closest('[data-barea]'), bd = t.closest('[data-bdif]'), bc = t.closest('[data-bcurso]'), bt = t.closest('[data-btema]'), bn = t.closest('[data-bn]');
    if (ba) { const a = ba.dataset.barea; B.areas.has(a) ? B.areas.delete(a) : B.areas.add(a); renderBuilder(); return keepFocus(`[data-barea="${a}"]`); }
    if (bd) { const d = bd.dataset.bdif; B.difs.has(d) ? B.difs.delete(d) : B.difs.add(d); renderBuilder(); return keepFocus(`[data-bdif="${d}"]`); }
    if (bc) { const x = bc.dataset.bcurso; B.cursos.has(x) ? B.cursos.delete(x) : B.cursos.add(x); renderBuilder(); return keepFocus(`[data-bcurso="${CSS.escape(x)}"]`); }
    if (bt) { const x = bt.dataset.btema; B.temas.has(x) ? B.temas.delete(x) : B.temas.add(x); renderBuilder(); return keepFocus(`[data-btema="${CSS.escape(x)}"]`); }
    if (bn) { B.n = +bn.dataset.bn; renderBuilder(); return keepFocus(`[data-bn="${bn.dataset.bn}"]`); }
  }
  const sf = t.closest('.sf');
  if (sf) { solFilter = sf.dataset.sf; $$('.sf').forEach(b => b.setAttribute('aria-pressed', String(b === sf))); return renderSolutions(); }
  const sd = t.closest('.sd');
  if (sd) { solDif = sd.dataset.sd; $$('.sd').forEach(b => b.setAttribute('aria-pressed', String(b === sd))); return renderSolutions(); }
  const f = t.closest('[data-f]');
  if (f) { filter = f.dataset.f; renderExams(); return keepFocus(`[data-f="${filter}"]`); }
  const m = t.closest('#map button[data-i]'); if (m) return goTo(+m.dataset.i);
  const to = t.closest('[data-toast]'); if (to) return toast(to.dataset.toast);
});

/* ---------- Constructor de simulacro ---------- */
$('#bRange').addEventListener('input', e => {
  B.n = +e.target.value; $('#bN').textContent = B.n;
  $$('#bPresets .chip-btn').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.bn === B.n)));
  renderBuilderSummary();
});
$('#bPractice').addEventListener('change', e => { B.practice = e.target.checked; renderBuilderSummary(); });
$('#bStart').onclick = () => startExam(makeRandomExam({title: B.practice ? 'Práctica personalizada' : 'Simulacro personalizado', uni: B.practice ? 'Práctica' : 'Personalizado', n:B.n, pool:builderPool()}), {practice:B.practice});

/* ---------- Examen ---------- */
$('#opts').addEventListener('change', e => { if (S) chooseOption(+e.target.value); });
$('#clearAns').onclick = () => { S.ans[S.cur] = null; syncAnswer(); queueSave(); };
$('#prev').onclick = () => goTo(S.cur - 1);
$('#next').onclick = nextQuestion;
$('#checkBtn').onclick = checkCurrent;
$('#flagBtn').onclick = toggleFlag;
$('#fontDown').onclick = () => changeScale(-0.1);
$('#fontUp').onclick = () => changeScale(0.1);
$('#fsBtn').onclick = toggleFullscreen;
$('#finish').onclick = askFinish;
$('#abandon').onclick = leaveExam;

/* ---------- Resultados ---------- */
$('#backCatalog').onclick = showDash;
$('#retry').onclick = () => startExam(LAST.exam, {practice:LAST.practice});
$('#retryWrong').onclick = retryWrong;
$('#shareBtn').onclick = openShare;
$('#sNative').onclick = shareNative;
$('#sDownload').onclick = downloadCard;

function goHome(e) {
  e.preventDefault();
  if (S && S.active) return leaveExam();
  if (guestState.on || document.body.dataset.view === 'home') return showHome();
  const u = me();
  (accessState(u) === 'active' || hasPending(u)) ? showDash() : showPlans();
}
$('#logo').onclick = goHome;
$('#crumbHome').onclick = goHome;
$('#crumbHome2').onclick = e => { e.preventDefault(); guestState.on ? showHome() : showDash(); };
$$('[data-toapp]').forEach(el => el.addEventListener('click', e => {
  if (el.closest('#adminbar')) return; // lo maneja el panel admin
  e.preventDefault();
  if (document.body.dataset.view === 'admin') return;
  const u = me(); (accessState(u) === 'active' || hasPending(u)) ? showDash() : showPlans();
}));

$('#q').addEventListener('input', e => { if (S && S.active) return; query = e.target.value; showTab('eval'); });

window.addEventListener('beforeunload', e => { if (S && S.active && !S.trial) { persistAttempt(); e.preventDefault(); e.returnValue = ''; } });

const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;

/* ---------- Selector de presentaciones (colores) ----------
   Para agregar un diseño: añade una entrada en THEMES y su bloque
   :root[data-theme="ID"] en styles.css.
   premium: true => solo visible para planes semana o mes. */
const THEMES = [
  {id: 'auto',  name: 'Automático', note: 'Los colores siguen a tu equipo', sw: ['#F7F8FA', '#12305F', '#E8452C'], auto: true},
  {id: 'light', name: 'Clásico',    sw: ['#FFFFFF', '#12305F', '#E8452C']},
  {id: 'dark',  name: 'Medianoche', sw: ['#0A1A38', '#0F2A55', '#FF8F7A']},
  {id: 'tech',  name: 'Tech & Focus', sw: ['#070D16', '#54E7C1', '#0B2731']},
  {id: 'oro',   name: 'Academia Moderna', sw: ['#0C1322', '#E9C760', '#16203B']},
  {id: 'creative', name: 'Digital Creative', sw: ['#131029', '#FF8A73', '#271B52']},
  {id: 'rosa',  name: 'Rosa Dulce', sw: ['#F9D2DC', '#C63F58', '#DCEBF7']},
  {id: 'naranja', name: 'Noche Naranja', sw: ['#0B0B0D', '#F5A11E', '#17171B'], premium: true},
  {id: 'arcoiris', name: 'Arcoíris Pastel', sw: ['#79C9EE', '#FBF5DC', '#F6B71C'], premium: true},
  {id: 'kawaii', name: 'Repostería Kawaii', sw: ['#F5B7CE', '#5E3A25', '#F7A8C4'], premium: true},
  {id: 'candy', name: 'Candy Comic', sw: ['#C9281E', '#F5891E', '#5C3720'], premium: true}
];
const THEME_KEY = 'spe.theme';
const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const themeUnlocked = t => {
  if (!t.premium) return true;
  const u = me();
  if (u && u.rol === 'admin') return true; // el administrador prueba todos los diseños
  return !!(u && (u.plan === 'semana' || u.plan === 'mes') && accessState(u) === 'active');
};
function setTheme(id, save = true) {
  const t = THEMES.find(x => x.id === id) || THEMES.find(x => x.id === 'light');
  if (t.auto) delete root.dataset.theme; else root.dataset.theme = t.id;
  if (save) { try { localStorage.setItem(THEME_KEY, t.id); } catch { /* modo privado */ } }
  if (S && S.active) setWatermark();
}
function ensureTheme() {
  const t = THEMES.find(x => x.id === (root.dataset.theme || 'auto'));
  if (t && !themeUnlocked(t)) {
    setTheme('light');
    toast('Ese diseño es de los planes Semanal y Mensual. Volvimos a Clásico.');
    return false;
  }
  return true;
}
let themePop = null, themeBtn = null;
function themePopHTML() {
  const cur = root.dataset.theme || 'auto';
  return '<div class="tp-title">Presentación</div>' + THEMES.map(t => {
    const unlocked = themeUnlocked(t), on = cur === (t.auto ? 'auto' : t.id);
    const sub = unlocked ? (t.note ? `<small>${t.note}</small>` : '') : '<small>Solo planes Semanal o Mensual</small>';
    return `<button class="theme-opt${unlocked ? '' : ' locked'}" type="button" data-th="${t.id}" aria-current="${on}">
      <span class="sw">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="th-name">${t.name}${sub}</span>
      <span class="th-ic" aria-hidden="true">${on ? ICON.check : unlocked ? '' : LOCK_SVG}</span>
    </button>`;
  }).join('');
}
function openThemePop(btn) {
  ensureTheme();
  if (!themePop) {
    themePop = document.createElement('div');
    themePop.className = 'theme-pop';
    themePop.id = 'themePop';
    themePop.hidden = true;
    document.body.appendChild(themePop);
    themePop.addEventListener('click', e => {
      const b = e.target.closest('[data-th]');
      if (!b) return;
      const t = THEMES.find(x => x.id === b.dataset.th);
      if (!t) return;
      if (!themeUnlocked(t)) return toast('Los diseños especiales son para los planes Semanal y Mensual.');
      const from = themeBtn;
      setTheme(t.id);
      closeThemePop();
      from && from.focus();
    });
  }
  themePop.innerHTML = themePopHTML();
  themePop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = themePop.offsetWidth, h = themePop.offsetHeight;
  themePop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  themePop.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
  if (themeBtn && themeBtn !== btn) themeBtn.setAttribute('aria-expanded', 'false');
  themeBtn = btn;
  btn.setAttribute('aria-expanded', 'true');
}
function closeThemePop() {
  if (!themePop) return;
  themePop.hidden = true;
  if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
  themeBtn = null;
}
$$('.js-theme').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  if (themePop && !themePop.hidden && themeBtn === b) { closeThemePop(); return; }
  openThemePop(b);
}));
document.addEventListener('click', e => {
  if (themePop && !themePop.hidden && !themePop.contains(e.target) && !e.target.closest('.js-theme')) closeThemePop();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && themePop && !themePop.hidden) { const b = themeBtn; closeThemePop(); b && b.focus(); }
});
(function restoreTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* nada */ }
  if (!saved) return;
  if (THEMES.some(x => x.id === saved)) { setTheme(saved, false); ensureTheme(); }
  else try { localStorage.removeItem(THEME_KEY); } catch { /* nada */ }
})();

/* ---------- Menú de usuario ---------- */
const userMenuBtn = $('#userMenuBtn');
const userDropdown = $('#userDropdown');

function closeUserMenu() {
  userDropdown.hidden = true;
  userMenuBtn.setAttribute('aria-expanded', 'false');
}

userMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = !userDropdown.hidden;
  closeUserMenu();
  if (!isOpen) {
    const u = me();
    if (u) {
      $('#userNameDropdown').textContent = u.name;
      $('#userEmailDropdown').textContent = u.email || '';
      setAvatar($('#userAvatarDropdown'), u);
      $('#adminBtn').hidden = u.rol !== 'admin';
    } else {
      $('#adminBtn').hidden = true;
    }
    userDropdown.hidden = false;
    userMenuBtn.setAttribute('aria-expanded', 'true');
  }
});

document.addEventListener('click', e => {
  if (!userDropdown.hidden && !e.target.closest('.user')) closeUserMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !userDropdown.hidden) closeUserMenu();
});

$('#adminBtn').addEventListener('click', () => {
  closeUserMenu();
  location.hash = '#/admin';
});

$('#logoutBtn').addEventListener('click', () => {
  closeUserMenu();
  apiLogout();
  meId = null;
  guestState.on = false;
  ensureTheme();
  showHome();
  toast('Sesión cerrada.');
});

function openProfile() {
  const u = me();
  closeUserMenu();
  if (!u) return toast('Inicia sesión para ver tu perfil.');
  setAvatar($('#pAvatar'), u);
  $('#pName').textContent = u.name;
  $('#pEmail').textContent = u.email || '';
  $('#pUni').value = (u.goal && u.goal.uni) || '';
  $('#pFac').value = (u.goal && u.goal.facultad) || '';
  $('#pEsc').value = (u.goal && u.goal.escuela) || '';
  $('#pDate').value = (u.goal && u.goal.date) || '';
  $('#pRef').value = u.refCode || '';
  $('#pCopy').dataset.copy = u.refCode || '';
  $('#pDateErr').textContent = '';
  $('#pPhotoErr').textContent = '';
  $('#pMailErr').textContent = '';
  $('#pPassErr').textContent = '';
  $('#pMail').value = u.email || '';
  $('#pPassNow').value = $('#pPassNew').value = $('#pPassNew2').value = '';
  $('#pPhotoDel').hidden = !u.photo;
  $('#pDlg').showModal();
}

$('#profileBtn').addEventListener('click', openProfile);

$('#pForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = me(); if (!u) return;
  const uni = $('#pUni').value.trim().replace(/\s+/g, ' '), date = $('#pDate').value;
  const facultad = $('#pFac').value.trim().replace(/\s+/g, ' '), escuela = $('#pEsc').value.trim().replace(/\s+/g, ' ');
  const mail = $('#pMail').value.trim().toLowerCase();
  const passNow = $('#pPassNow').value, passNew = $('#pPassNew').value, passNew2 = $('#pPassNew2').value;
  $('#pMailErr').textContent = ''; $('#pPassErr').textContent = '';
  if (date && date < todayKey()) { $('#pDateErr').textContent = 'La fecha de tu examen ya pasó.'; return; }
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { $('#pMailErr').textContent = 'Ese correo no es válido.'; return; }
  if (passNew || passNew2) {
    if (!passNow) { $('#pPassErr').textContent = 'Escribe tu contraseña actual para confirmar el cambio.'; return; }
    if (passNew.length < 6) { $('#pPassErr').textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
    if (passNew !== passNew2) { $('#pPassErr').textContent = 'Las contraseñas nuevas no coinciden.'; return; }
  }

  // Credenciales: se guardan en el servidor ANTES de cerrar (si algo falla, el diálogo queda abierto)
  const cred = {};
  if (mail && mail !== (u.email || '').toLowerCase()) cred.email = mail;
  if (passNew) { cred.password = passNew; cred.password_actual = passNow; }
  if (Object.keys(cred).length) {
    if (!API.online) { $('#pPassErr').textContent = 'Sin conexión: no puedo cambiar el correo o la contraseña ahora.'; return; }
    try {
      // apiGuardarPerfil devuelve el usuario ya mapeado (no un {usuario})
      const actualizado = await apiGuardarPerfil(cred);
      if (cred.email && actualizado && actualizado.email) {
        u.email = actualizado.email;
        $('#pEmail').textContent = u.email;
        $('#userEmailDropdown').textContent = u.email;
      }
    } catch (err) {
      if (err.red) { $('#pPassErr').textContent = 'Sin conexión con el servidor. Intenta de nuevo.'; return; }
      (/correo/i.test(err.message) ? $('#pMailErr') : $('#pPassErr')).textContent = err.message;
      return;
    }
  }

  u.goal = uni || date || facultad || escuela ? { uni, date, facultad, escuela } : null;
  $('#pDlg').close();
  renderHero();
  toast(cred.password ? 'Contraseña actualizada.' : cred.email ? 'Correo actualizado.' : 'Perfil actualizado.');
  // Sincroniza con el servidor si está conectado
  if (API.online) {
    apiGuardarPerfil({ meta_uni: uni, meta_fecha: date, facultad, escuela })
      .catch(err => { if (!err.red) toast('No se pudo guardar en el servidor: ' + err.message); });
  }
});

/* ---------- Foto de perfil ---------- */
function applyPhoto() {
  const u = me(); if (!u) return;
  setAvatar($('#pAvatar'), u);
  setAvatar($('#userAvatar'), u);
  setAvatar($('#userAvatarDropdown'), u);
  $('#pPhotoDel').hidden = !u.photo;
}

$('#pPhotoBtn').addEventListener('click', () => $('#pPhoto').click());

$('#pPhoto').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  const u = me(); if (!u || !file) return;
  const errEl = $('#pPhotoErr'); errEl.textContent = '';
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { errEl.textContent = 'Usa una imagen JPG, PNG o WebP.'; return; }
  if (file.size > 2 * 1024 * 1024) { errEl.textContent = 'La imagen pesa más de 2 MB. Elige una más ligera.'; return; }
  const fr = new FileReader();
  fr.onerror = () => { errEl.textContent = 'No pudimos leer el archivo. Intenta con otra imagen.'; };
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => { errEl.textContent = 'Ese archivo no parece una imagen válida.'; };
    img.onload = () => {
      const max = 320, w = img.naturalWidth || 1, h = img.naturalHeight || 1;
      const k = Math.min(1, max / Math.max(w, h));
      try {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        u.photo = cv.toDataURL('image/jpeg', 0.85);
      } catch { u.photo = fr.result; }
      applyPhoto();
      toast('Foto de perfil actualizada.');
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});

$('#pPhotoDel').addEventListener('click', () => {
  const u = me(); if (!u) return;
  u.photo = null;
  $('#pPhotoErr').textContent = '';
  applyPhoto();
  toast('Foto quitada.');
});

/* ---------- Inicio ---------- */
fillIcons();
bindImageField('fImg', 'Imagen del problema', 'gráfica, figura o diagrama');
bindImageField('fWhyImg', 'Imagen del sustento', 'esquema o resolución');
$('#authAreas').innerHTML = ['Matemáticas', 'Ciencias', 'Humanidades'].map(a => `<li>${ICON[AREA_ICON[a]]}${a}</li>`).join('');
renderAuth();
updateNet();
// Arranca la API (ajustes, exámenes, sesión) y luego la interfaz
bootAPI().finally(() => {
  renderAuth();
  if (restoreAttempt()) toast('Retomamos tu examen donde lo dejaste.');
  else route();
  // Datos listos (o arranque fallido): se retira el cargador y se muestra el nombre real
  $('#view-dash').classList.remove('loading');
  const uBoot = me();
  if (uBoot) {
    $('#userName').textContent = (uBoot.name || '').trim().split(' ')[0] || 'Tu cuenta';
    setAvatar($('#userAvatar'), uBoot);
  }
});

// App instalable: solo si existe el manifiesto (en el archivo único no se incluye)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel="manifest"]')) {
  navigator.serviceWorker.register('sw.js').catch(err => reportError(err, 'service worker'));
}
