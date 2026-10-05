/* =====================================================================
   PÁGINA DE INICIO PÚBLICA Y PRUEBA GRATIS
   ===================================================================== */

/* Muestra fija de la portada: se escribe aquí (y no se lee del banco) para que
   la portada no cambie cuando cambien las preguntas. La figura es un SVG con
   los colores del tema, así se ve igual en claro y en oscuro. */
const MUESTRA = {
  area: 'Matemáticas',
  q: 'En la figura mostrada, $AE = 3u$, $ED = xu$, $DC = 1u$ y $BC = 3u$. Calcule $x$.',
  o: ['1', '$\\frac{3}{2}$', '2', '$\\frac{5}{2}$', '3'],
  fig: `<figure class="q-fig"><svg viewBox="18 40 285 182" role="img" aria-label="Triángulo rectángulo ABC con los puntos E y D sobre la base AC y las rectas BE y BD trazadas desde B.">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M40 190H280"></path>
      <path d="M280 190V70"></path>
      <path d="M40 190L280 70"></path>
      <path d="M160 190L280 70"></path>
      <path d="M240 190L280 70"></path>
      <path d="M268 190V178H280"></path>
      <path d="M249.6 85.2A34 34 0 0 0 256 94"></path>
      <path d="M269.3 102.3A34 34 0 0 0 280 104"></path>
    </g>
    <g fill="currentColor" font-size="14" font-weight="600" text-anchor="middle">
      <text x="241" y="103">α</text>
      <text x="272" y="122">α</text>
      <text x="40" y="210">A</text>
      <text x="160" y="210">E</text>
      <text x="240" y="210">D</text>
      <text x="288" y="210">C</text>
      <text x="280" y="58">B</text>
    </g>
  </svg></figure>`,
};

function renderHome() {
  $('#homeAreas').innerHTML = AREAS.map(a => `
    <article class="card area-card"><span class="ico" aria-hidden="true">${ICON[AREA_ICON[a]]}</span>
      <h3>${a}</h3><p class="uni">${DB.questions.filter(q => q.area === a).length} preguntas de práctica</p></article>`).join('');

  // Una pregunta de ejemplo para que se vea cómo es practicar
  $('#homeSample').innerHTML = `
    <div class="sample" aria-label="Ejemplo de pregunta">
      <span class="tag">${esc(MUESTRA.area)}</span>
      <p class="q-text">${rich(MUESTRA.q)}</p>
      ${MUESTRA.fig}
      <div class="opts">${MUESTRA.o.map((t, i) => `<div class="opt"><span class="letter">${'ABCDE'[i]}</span><span class="opt-text">${rich(t)}</span></div>`).join('')}</div>
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
