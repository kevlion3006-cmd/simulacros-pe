/* =====================================================================
   PÁGINA DE INICIO PÚBLICA Y PRUEBA GRATIS
   ===================================================================== */
function renderHome() {
  $('#homeAreas').innerHTML = AREAS.map(a => `
    <article class="card area-card"><span class="ico" aria-hidden="true">${ICON[AREA_ICON[a]]}</span>
      <h3>${a}</h3><p class="uni">${DB.questions.filter(q => q.area === a).length} preguntas de práctica</p></article>`).join('');

  // Una pregunta de ejemplo (con gráfica si hay alguna) para que se vea cómo es practicar
  const q = DB.questions.find(x => x.img) || DB.questions[0];
  $('#homeSample').innerHTML = `
    <div class="sample" aria-label="Ejemplo de pregunta">
      <span class="tag">${esc(q.area)}</span>
      <p class="q-text">${rich(q.q)}</p>
      ${figHTML(q.img, 'Imagen del problema')}
      <div class="opts">${q.o.map((t, i) => `<div class="opt"><span class="letter">${'ABCD'[i]}</span><span class="opt-text">${rich(t)}</span></div>`).join('')}</div>
    </div>`;

  $('#homePlans').innerHTML = PLANS.map(p => `
    <article class="plan static${p.best ? ' sel' : ''}">
      ${p.best ? '<span class="plan-badge">Más elegido</span>' : ''}
      <span class="plan-name">${p.name}</span>
      <span class="plan-price">S/ ${p.price}<small>${p.unit}</small></span>
      <span class="plan-time">${p.text}</span>
      <span class="plan-per">${p.per}</span>
      <span class="plan-save">${p.save}</span>
    </article>`).join('');
}

function showHome() {
  guestState.on = false;
  renderHome(); setView('home'); pushPath('/inicio'); track('view_home');
}

// 5 preguntas gratis sin crear cuenta. El resultado no se guarda.
function startTrial() {
  const ids = DB.questions.filter(q => q.free).map(q => q.id);
  if (!ids.length) { toast('La prueba gratis aún no está disponible.'); return; }
  track('trial_start');
  startExam({id:'trial', uni:'Prueba', title:'Prueba gratis', full:'', mins:Math.max(1, ids.length * 2), ids}, {trial:true});
}
