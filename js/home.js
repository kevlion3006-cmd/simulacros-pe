/* =====================================================================
   PÁGINA DE INICIO PÚBLICA Y PRUEBA GRATIS
   ===================================================================== */

/* Dos ejercicios de muestra que se van alternando en la portada: están
   escritos aquí (y no se leen del banco) para que la portada no cambie
   cuando cambien las preguntas. Cada uno lleva cuatro alternativas, la que
   sería la respuesta incluida, y la figura es un SVG con los colores del
   tema, así se ve igual en claro y en oscuro. */
const MUESTRAS = [
  { // Geometría: dos ángulos iguales en un triángulo rectángulo (x = 2)
    area: 'Matemáticas',
    q: 'En la figura mostrada, $AE = 3u$, $ED = xu$, $DC = 1u$ y $BC = 3u$. Calcule $x$.',
    /* La figura se dibuja a 66 px de alto (mismo peso que el bloque de la
       otra muestra) y por eso los tipos y el trazo van en unidades grandes:
       el texto baja a 9,5 px legibles y el trazo lleva non-scaling-stroke
       para quedar en 1,6 px fijos en vez de 0,8 px. */
    fig: `<figure class="q-fig"><svg viewBox="18 40 285 182" role="img" aria-label="Triángulo rectángulo ABC con los puntos E y D sobre la base AC y las rectas BE y BD trazadas desde B.">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path vector-effect="non-scaling-stroke" d="M40 190H280"></path>
      <path vector-effect="non-scaling-stroke" d="M280 190V70"></path>
      <path vector-effect="non-scaling-stroke" d="M40 190L280 70"></path>
      <path vector-effect="non-scaling-stroke" d="M160 190L280 70"></path>
      <path vector-effect="non-scaling-stroke" d="M240 190L280 70"></path>
      <path vector-effect="non-scaling-stroke" d="M268 190V178H280"></path>
      <path vector-effect="non-scaling-stroke" d="M249.6 85.2A34 34 0 0 0 256 94"></path>
      <path vector-effect="non-scaling-stroke" d="M269.3 102.3A34 34 0 0 0 280 104"></path>
    </g>
    <g fill="currentColor" font-size="26" font-weight="600" text-anchor="middle">
      <text x="238" y="103">α</text>
      <text x="272" y="122">α</text>
      <text x="40" y="210">A</text>
      <text x="160" y="210">E</text>
      <text x="240" y="210">D</text>
      <text x="288" y="210">C</text>
      <text x="280" y="60">B</text>
    </g>
  </svg></figure>`,
    o: ['1', '$\\frac{3}{2}$', '2', '$\\frac{5}{2}$'],
  },
  { // Función por tramos: f(5) + f(f(3)) = 8 + 7 = 15
    area: 'Matemáticas',
    intro: pfnHTML,
    q: 'Hallar: $f(5) + f(f(3))$',
    fig: '',
    o: ['15', '25', '24', '48'],
  },
];

let iMuestra = 0;

/* La función por tramos: el motor de fórmulas no sabe maquetar la llave,
   así que la fila se dibuja con HTML y el { en grande al costado. */
function pfnHTML() {
  const fila = (e, c) => `<span class="pfn-l"><span class="pfn-e">${rich(e)}</span><span class="pfn-c">${rich(c)}</span></span>`;
  return `<div class="pfn">
      <span class="pfn-si">Si:</span>
      <span class="pfn-f">${rich('$f(x) =$')}</span>
      <span class="pfn-par">
      <span class="pfn-llave" aria-hidden="true"><svg viewBox="0 0 14 100" preserveAspectRatio="none" focusable="false"><path vector-effect="non-scaling-stroke" d="M13 3 H9.5 C9.5 16 9.5 26 7.5 34 C6 40 4.5 45 1.5 50 C4.5 55 6 60 7.5 66 C9.5 74 9.5 84 9.5 97 H13"></path></svg></span>
      <span class="pfn-cuerpo">
        ${fila('$x^2 - 5$;', 'si $x < 4$')}
        ${fila('$2x - 2$;', 'si $x > 4$')}
        ${fila('$7$;', 'si $x = 4$')}
      </span>
      </span>
    </div>`;
}

function pintarMuestra() {
  const m = MUESTRAS[iMuestra], cont = $('#homeSample');
  if (!cont) return;
  cont.innerHTML = `
    <div class="sample" aria-label="Ejemplo de pregunta">
      <span class="tag">${esc(m.area)}</span>
      ${m.intro ? m.intro() : ''}
      <p class="q-text">${rich(m.q)}</p>
      ${m.fig}
      <div class="opts">${m.o.map((t, i) => `<div class="opt"><span class="letter">${'ABCD'[i]}</span><span class="opt-text">${rich(t)}</span></div>`).join('')}</div>
    </div>`;
}

function alternarMuestra() {
  iMuestra = (iMuestra + 1) % MUESTRAS.length;
  pintarMuestra();
}

/* La portada rota sola cada 10 segundos y también cuando vuelves de otra
   pestaña o ventana; solo avanza si el inicio está a la vista. */
setInterval(() => {
  if (document.visibilityState === 'visible' && document.body.dataset.view === 'home') alternarMuestra();
}, 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.dataset.view === 'home') alternarMuestra();
});

/* Filas de periodos: las 4 opciones (día, semana, mes, año) con su "desde" y
   un chevron. Se usan en la portada (primer paso) y en el paso 1 de
   #/planes: cada fila es un botón que lleva al paso 2 (elegir el nivel). */
const solesCorto = n => 'S/ ' + (Math.round(n * 100) % 100 ? Number(n).toFixed(2) : String(n));

const CHEVRON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;

function filasPeriodos() {
  return PERIODOS.map(per => {
    const ps = planesDePeriodo(per.id);
    const desde = ps.length ? Math.min(...ps.map(p => p.price)) : PRECIOS[per.id][NIVELES[0].id];
    const mejor = per.id === 'semana';
    /* Sin aria-label: el nombre accesible se compone con el texto que se ve
       (título, descripción, "desde" y precio). Si se sobrescribiera, el texto
       visible quedaría fuera del nombre y Lighthouse lo marcaría. El badge
       va al final para que se lea primero lo que es la fila. */
    return `<button class="prow${mejor ? ' best' : ''}" type="button" data-plan-period="${per.id}">
      <span class="prow-txt"><b>${per.name}</b><span class="prow-desc">${descPeriodo(per)}</span></span>
      <span class="prow-precio"><span class="prow-desde">desde</span><b>${solesCorto(desde)}</b></span>
      ${CHEVRON}
      ${mejor ? '<span class="plan-badge">Más elegido</span>' : ''}
    </button>`;
  }).join('');
}

function renderHome() {
  $('#homeAreas').innerHTML = AREAS.map(a => `
    <article class="card area-card"><span class="ico" aria-hidden="true">${ICON[AREA_ICON[a]]}</span>
      <h3>${a}</h3><p class="uni">${DB.questions.filter(q => q.area === a).length} preguntas de práctica</p></article>`).join('');

  // Un ejercicio de ejemplo para que se vea cómo es practicar
  pintarMuestra();

  // Los 4 periodos: al pulsar una fila se pasa al paso 2 (elegir el nivel).
  $('#homePlans').innerHTML = filasPeriodos();
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
