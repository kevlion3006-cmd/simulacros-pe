/* =====================================================================
   REGISTRO / INICIO DE SESIÓN
   ===================================================================== */
let authMode = 'register';

function renderAuth() {
  const reg = authMode === 'register';
  $('#authHead').textContent = reg ? 'Crea tu cuenta y empieza a practicar hoy.' : 'Sigue practicando donde lo dejaste.';
  $('#authLead').textContent = reg ? 'Regístrate en un minuto y elige el plan que más te convenga: día, semana o mes.' : 'Tus resultados y tu historial te están esperando.';
  $('#authTitle').textContent = reg ? 'Crea tu cuenta' : 'Inicia sesión';
  $('#authSub').textContent = reg ? 'Regístrate para elegir tu plan y empezar a practicar.' : 'Entra para continuar con tus simulacros.';
  $('#fgName').hidden = !reg; $('#fgConfirm').hidden = !reg; $('#fgTerms').hidden = !reg; $('#fgGoal').hidden = !reg;
  $('#forgotRow').hidden = reg;
  $('#authSubmit').textContent = reg ? 'Crear cuenta' : 'Iniciar sesión';
  $('#authDivider').textContent = reg ? 'o regístrate con' : 'o inicia sesión con';
  $('#authSwitch').innerHTML = reg
    ? '¿Ya tienes cuenta? <button class="link-inline" type="button" data-auth="login">Inicia sesión</button>'
    : '¿Aún no tienes cuenta? <button class="link-inline" type="button" data-auth="register">Regístrate</button>';
  $('#aPw').autocomplete = reg ? 'new-password' : 'current-password';
  ['eName', 'eEmail', 'ePw', 'ePw2', 'eTerms', 'eRef', 'eDate'].forEach(id => { $('#' + id).textContent = ''; });
  $$('#authForm .input').forEach(i => i.removeAttribute('aria-invalid'));
}
function showAuth(mode) {
  authMode = mode; renderAuth(); setView('auth');
  pushPath(mode === 'register' ? '/registro' : '/entrar');
}

function validateAuth() {
  const reg = authMode === 'register', err = {};
  const name = $('#aName').value.trim(), email = $('#aEmail').value.trim(), pw = $('#aPw').value, pw2 = $('#aPw2').value;
  const ref = $('#aRef').value.trim().toUpperCase(), date = $('#aDate').value;
  if (reg && name.length < 3) err.name = 'Escribe tu nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err.email = 'Escribe un correo válido, por ejemplo tunombre@correo.com.';
  if (pw.length < 8) err.pw = 'Usa al menos 8 caracteres.';
  if (reg && pw2 !== pw) err.pw2 = 'Las contraseñas no coinciden.';
  if (reg && !$('#aTerms').checked) err.terms = 'Acepta los términos y la política de privacidad para continuar.';
  if (reg && ref && (typeof API === 'undefined' || !API.online) && !DB.users.some(u => u.refCode === ref)) err.ref = 'No encontramos ese código de amigo. Revísalo o déjalo en blanco.';
  if (reg && date && date < todayKey()) err.date = 'La fecha de tu examen ya pasó.';
  const map = {name:['eName', 'aName'], email:['eEmail', 'aEmail'], pw:['ePw', 'aPw'], pw2:['ePw2', 'aPw2'], terms:['eTerms', null], ref:['eRef', 'aRef'], date:['eDate', 'aDate']};
  Object.entries(map).forEach(([k, [eId, iId]]) => {
    $('#' + eId).textContent = err[k] || '';
    if (iId) { const i = $('#' + iId); err[k] ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid'); }
  });
  if (err.ref || err.date) $('#fgGoal').open = true;
  const clean = s => s.trim().replace(/\s+/g, ' ');
  return {ok: !Object.keys(err).length, name, email, pw, ref, date, uni: clean($('#aUni').value),
          facultad: clean($('#aFac').value), escuela: clean($('#aEsc').value)};
}

function newUser({name, email, uni = '', date = '', ref = '', facultad = '', escuela = '', pw = ''}) {
  const referrer = ref ? DB.users.find(u => u.refCode === ref) : null;
  const u = {id:uid(), name, email, pw: pw || undefined, plan:null, until:null, results:[], refCode:makeRef(name), referredBy:referrer ? referrer.id : null,
             goal: uni || date || facultad || escuela ? {uni:uni || '', date:date || '', facultad, escuela} : null};
  DB.users.push(u); meId = u.id; guestState.on = false;
  track('register', {referred: !!referrer});
  return u;
}

function afterLogin(u) { ensureTheme(); (accessState(u) === 'active' || hasPending(u)) ? showDash() : showPlans(); }

[['aName', 'eName'], ['aEmail', 'eEmail'], ['aPw', 'ePw'], ['aPw2', 'ePw2'], ['aTerms', 'eTerms'], ['aRef', 'eRef'], ['aDate', 'eDate']].forEach(([i, er]) => {
  $('#' + i).addEventListener('input', () => { $('#' + er).textContent = ''; $('#' + i).removeAttribute('aria-invalid'); });
});
$('#opInput').addEventListener('input', () => { $('#opErr').textContent = ''; $('#opInput').removeAttribute('aria-invalid'); });
$('#qForm').addEventListener('input', () => { $('#qErr').hidden = true; });
$('#eForm').addEventListener('input', () => { $('#eErr').hidden = true; });

// Muestra un error del servidor en el campo correcto del formulario
function mostrarErrorAuth(msg) {
  let campo = 'eEmail', input = 'aEmail';
  if (/contrase/i.test(msg)) { campo = 'ePw'; input = 'aPw'; }
  else if (/código de amigo/i.test(msg)) { campo = 'eRef'; input = 'aRef'; $('#fgGoal').open = true; }
  let texto = msg;
  if (/correo ya está registrado/i.test(msg)) texto = 'Ese correo ya tiene una cuenta. Inicia sesión.';
  $('#' + campo).textContent = texto;
  $('#' + input).setAttribute('aria-invalid', 'true');
}

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = validateAuth(); if (!v.ok) return;

  // ---- con servidor: registro / login reales ----
  if (typeof API !== 'undefined' && API.online) {
    try {
      if (authMode === 'register') {
        const u = await apiRegistro({
          nombre: v.name, email: v.email, password: v.pw,
          universidad: v.uni || null, meta_fecha: v.date || null,
          ref: v.ref || null, facultad: v.facultad || null, escuela: v.escuela || null,
        });
        guestState.on = false;
        track('register', {referred: !!u.referredBy});
        showPlans();
        return;
      }
      const u = await apiLogin(v.email, v.pw);
      guestState.on = false;
      track('login');
      afterLogin(u);
      return;
    } catch (err) {
      if (!err.red) { mostrarErrorAuth(err.message); return; }
      // sin conexión: continúa con los datos demo de abajo
    }
  }

  // ---- modo demo (datos locales de data.js) ----
  const existing = DB.users.find(u => u.email.toLowerCase() === v.email.toLowerCase());
  if (authMode === 'register') {
    if (existing) { $('#eEmail').textContent = 'Ese correo ya tiene una cuenta. Inicia sesión.'; $('#aEmail').setAttribute('aria-invalid', 'true'); return; }
    newUser(v); showPlans();
  } else {
    if (!existing) { $('#eEmail').textContent = 'No encontramos una cuenta con ese correo. Regístrate primero.'; $('#aEmail').setAttribute('aria-invalid', 'true'); return; }
    if (existing.pw && v.pw !== existing.pw) { $('#ePw').textContent = 'La contraseña no coincide.'; $('#aPw').setAttribute('aria-invalid', 'true'); return; }
    meId = existing.id; guestState.on = false; afterLogin(existing);
  }
});
$('#googleBtn').onclick = () => {
  if (authMode === 'register') { newUser({name:'Usuario de Google', email:'usuario' + uid().slice(0, 3) + '@gmail.com'}); showPlans(); }
  else { meId = 'me'; guestState.on = false; afterLogin(me()); }
};
$('#pwToggle').onclick = () => {
  const show = $('#aPw').type === 'password';
  $('#aPw').type = show ? 'text' : 'password'; $('#aPw2').type = show ? 'text' : 'password';
  $('#pwToggle').textContent = show ? 'Ocultar' : 'Mostrar'; $('#pwToggle').setAttribute('aria-pressed', String(show));
};

/* =====================================================================
   PLANES, CÓDIGOS DE DESCUENTO Y PAGO
   ===================================================================== */
/* ---------- Recuperación de contraseña ---------- */
let recUser = null, recCode = '', recAt = 0;
function openRecovery() {
  recUser = null; recCode = '';
  $('#recEmail').value = ''; $('#recCode').value = ''; $('#recPw').value = ''; $('#recPw2').value = '';
  ['recErr1', 'recErr2', 'recErr3', 'recErr4'].forEach(id => $('#' + id).textContent = '');
  $('#recStep1').hidden = false; $('#recStep2').hidden = true;
  $('#recNext').textContent = 'Continuar';
  $('#recDlg').showModal();
}
$('#forgotBtn').onclick = openRecovery;
$('#recForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!recUser) { // paso 1: pedir el correo y generar el código
    const email = $('#recEmail').value.trim().toLowerCase();
    $('#recErr1').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return void ($('#recErr1').textContent = 'Escribe un correo válido, por ejemplo tunombre@correo.com.');
    const u = DB.users.find(x => (x.email || '').toLowerCase() === email);
    if (!u || !u.pw) return void ($('#recErr1').textContent = 'No encontramos una cuenta con ese correo. Regístrate primero.');
    recUser = u;
    recCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    recAt = Date.now();
    $('#recCodeShow').textContent = recCode;
    $('#recStep1').hidden = true; $('#recStep2').hidden = false;
    $('#recNext').textContent = 'Restablecer contraseña';
    return;
  }
  // paso 2: validar código y contraseña nueva
  ['recErr2', 'recErr3', 'recErr4'].forEach(id => $('#' + id).textContent = '');
  const code = $('#recCode').value.trim().toUpperCase(), pw = $('#recPw').value, pw2 = $('#recPw2').value;
  if (Date.now() - recAt > 10 * 60 * 1000) return void ($('#recErr2').textContent = 'El código expiró. Cancela y vuelve a pedir uno.');
  if (code !== recCode) return void ($('#recErr2').textContent = 'El código no coincide.');
  if (pw.length < 8) return void ($('#recErr3').textContent = 'Usa al menos 8 caracteres.');
  if (pw !== pw2) return void ($('#recErr4').textContent = 'Las contraseñas no coinciden.');
  const u = recUser;
  u.pw = pw; recUser = null;
  $('#recDlg').close();
  toast('Contraseña actualizada. Ya puedes iniciar sesión.');
  if (authMode !== 'login') showAuth('login');
  $('#aEmail').value = u.email || '';
});
[['recEmail', 'recErr1'], ['recCode', 'recErr2'], ['recPw', 'recErr3'], ['recPw2', 'recErr4']].forEach(([i, er]) => {
  $('#' + i).addEventListener('input', () => { $('#' + er).textContent = ''; });
});

let planSel = 'semana', lastPayment = null, coupon = null; // coupon: {code, percent}

async function findCoupon(code) {
  // Con servidor: valida contra POST /cupones/validar
  if (typeof API !== 'undefined' && API.online) {
    try {
      const r = await apiValidarCupon(code);
      return {c: {code: r.codigo || String(code).trim().toUpperCase(), percent: r.porcentaje}};
    } catch (e) {
      if (!e.red) return {err: e.message};
      // sin conexión: valida con los cupones demo
    }
  }
  const c = DB.coupons.find(x => x.code === String(code).trim().toUpperCase());
  if (!c || !c.active) return {err:'Ese código no existe o ya no está activo.'};
  if (c.expires && c.expires < todayKey()) return {err:'Ese código ya venció.'};
  if (c.max != null && c.used >= c.max) return {err:'Ese código ya alcanzó su límite de usos.'};
  return {c};
}
// El precio final SIEMPRE lo vuelve a calcular el servidor; esto es solo para mostrarlo
const priceOf = id => { const p = plan(id).price; return coupon ? Math.round(p * (100 - coupon.percent)) / 100 : p; };

function renderPlans() {
  $('#plansGrid').innerHTML = PLANS.map(p => `
    <label class="plan${p.id === planSel ? ' sel' : ''}">
      ${p.best ? '<span class="plan-badge">Más elegido</span>' : ''}
      <input type="radio" name="plan" value="${p.id}"${p.id === planSel ? ' checked' : ''}>
      <span class="plan-dot">${ICON.check}</span>
      <span class="plan-name">${p.name}</span>
      <span class="plan-price">${coupon ? `<s class="was">S/ ${p.price}</s> ` : ''}${coupon ? money(priceOf(p.id)) : 'S/ ' + p.price}<small>${p.unit}</small></span>
      <span class="plan-time">${p.text}</span>
      <span class="plan-per">${p.per}</span>
      <span class="plan-save">${p.save}</span>
    </label>`).join('');
  syncPlanCta();
}
function syncPlanCta() { $('#plansCta').textContent = `Continuar con el plan ${plan(planSel).name}`; }
function showPlans() { renderPlans(); setView('plans'); pushPath('/planes'); track('view_plans'); }

$('#plansGrid').addEventListener('change', e => {
  planSel = e.target.value;
  $$('#plansGrid .plan').forEach(l => l.classList.toggle('sel', l.querySelector('input').checked));
  syncPlanCta(); track('plan_selected', {plan: planSel});
});
$('#plansCta').onclick = () => showPay();

$('#cpApply').onclick = async () => {
  const code = $('#cpInput').value.trim();
  if (!code) { coupon = null; $('#cpMsg').textContent = ''; return renderPlans(); }
  const r = await findCoupon(code);
  if (r.err) { coupon = null; $('#cpMsg').className = 'err-msg'; $('#cpMsg').textContent = r.err; }
  else { coupon = {code:r.c.code, percent:r.c.percent}; $('#cpMsg').className = 'ok-msg'; $('#cpMsg').textContent = `Código aplicado: ${r.c.percent} % de descuento.`; }
  renderPlans();
};

/* ---- Captura del comprobante (opcional) ---- */
let proof = null; // data URL en el prototipo; en producción, el id devuelto por POST /api/uploads/proof
function renderProof() {
  $('#proofPrev').hidden = !proof;
  if (proof) $('#proofImg').src = proof;
}
$('#proofFile').addEventListener('change', async () => {
  const f = $('#proofFile').files[0]; $('#proofFile').value = ''; if (!f) return;
  const fail = m => { $('#proofErr').textContent = m; };
  $('#proofErr').textContent = '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return fail('Usa una imagen PNG, JPG o WEBP.');
  if (f.size > IMG_MAX) return fail('La imagen pesa más de 2 MB.');
  try { proof = await uploadImage(f); renderProof(); } catch { fail('No pudimos leer esa imagen.'); }
});
$('#proofRemove').onclick = () => { proof = null; renderProof(); };

function showPay() {
  const p = plan(planSel), amount = priceOf(planSel);
  $('#payPlan').textContent = p.name;
  $('#payDur').textContent = ' · ' + p.text.toLowerCase().replace('acceso por ', '') + ' de acceso';
  $('#payPrice').innerHTML = coupon ? `<s class="was">S/ ${p.price}</s> ${money(amount)}` : money(amount);
  $('#payCoupon').textContent = coupon ? `Código ${coupon.code}: ${coupon.percent} % de descuento` : '';
  $('#payExact').textContent = money(amount);
  $('#yapeNum').textContent = YAPE.number; $('#yapeName').textContent = YAPE.name;
  $('#yapeQr').innerHTML = YAPE.qr ? `<img src="${esc(YAPE.qr)}" alt="Código QR de Yape">` : 'Aquí va tu QR de Yape';
  $('#opInput').value = ''; $('#opErr').textContent = ''; $('#opInput').removeAttribute('aria-invalid');
  proof = null; renderProof(); $('#proofErr').textContent = '';
  $('#payForm').hidden = false; $('#payDone').hidden = true;
  setView('pay'); pushPath('/pago');
}
$('#otherPlan').onclick = showPlans;
$('#copyNum').onclick = async () => {
  try { await navigator.clipboard.writeText(YAPE.number.replace(/\s/g, '')); toast('Número copiado.'); }
  catch { toast('No pudimos copiarlo. Selecciónalo y cópialo a mano.'); }
};

$('#payConfirm').onclick = e => busy(e.currentTarget, async () => {
  const op = $('#opInput').value.trim();
  let msg = '';
  if (!/^\d{6,10}$/.test(op)) msg = 'Escribe solo los números de la operación (entre 6 y 10 dígitos).';
  else if (DB.payments.some(p => p.op === op)) msg = 'Ese número de operación ya fue registrado. Revisa tu comprobante.';
  else if (DB.payments.filter(p => p.userId === meId && p.status === 'pending').length >= 5) msg = 'Ya tienes varios pagos en revisión. Espera a que los revisemos.';
  $('#opErr').textContent = msg;
  msg ? $('#opInput').setAttribute('aria-invalid', 'true') : $('#opInput').removeAttribute('aria-invalid');
  if (msg) return;
  await sleep(350); // simula el envío al servidor
  const p = plan(planSel), amount = priceOf(planSel);
  const pagoLocal = {id:uid(), userId:meId, plan:planSel, amount, op, ts:new Date(), status:'pending', coupon:coupon ? coupon.code : null, proof};
  if (typeof API !== 'undefined' && API.online) {
    try {
      const r = await apiPagar({plan: planSel, operacion: op, cupon: coupon ? coupon.code : null});
      lastPayment = {...pagoLocal, id: String(r.pago.id)}; // id real del servidor
    } catch (e) {
      if (!e.red) { $('#opErr').textContent = e.message; $('#opInput').setAttribute('aria-invalid', 'true'); return; }
      lastPayment = pagoLocal; // sin conexión: se registra en local
    }
  } else {
    lastPayment = pagoLocal;
  }
  DB.payments.unshift(lastPayment);
  track('payment_submitted', {plan: planSel, coupon: !!coupon});
  $('#doneText').textContent = `Estamos verificando tu operación. Activaremos tu plan ${p.name} apenas la confirmemos.`;
  $('#doneList').innerHTML = `<div><span>Plan</span><b>${p.name}</b></div><div><span>Monto</span><b>${money(amount)}</b></div><div><span>N° de operación</span><b>${esc(op)}</b></div>${coupon ? `<div><span>Código</span><b>${esc(coupon.code)}</b></div>` : ''}`;
  const eta = (DB.settings.eta || '').trim();
  $('#timeline').innerHTML = `
    <li class="done"><span class="tl-dot">${ICON.check}</span><div><b>Pago enviado</b><small>${fmtDT(new Date())}</small></div></li>
    <li class="cur"><span class="tl-dot"></span><div><b>En revisión</b><small>${esc(eta || 'Verificamos tu operación manualmente.')}</small></div></li>
    <li><span class="tl-dot"></span><div><b>Acceso activado</b><small>Lo verás en tu panel apenas se apruebe.</small></div></li>`;
  $('#payForm').hidden = true; $('#payDone').hidden = false;
  window.scrollTo({top:0}); focusView('pay');
});
