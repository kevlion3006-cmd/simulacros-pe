/* =====================================================================
   PÁGINA DE INICIO PÚBLICA Y PRUEBA GRATIS
   ===================================================================== */

/* Ejercicio de muestra de la portada: está escrito aquí (y no se lee del
   banco) para que la portada no cambie cuando cambien las preguntas. Lleva
   cuatro alternativas y, si hay figura, es un SVG con los colores del tema,
   así se ve igual en claro y en oscuro. */
const MUESTRAS = [
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
  if (MUESTRAS.length < 2) return; // una sola muestra: no hay nada que alternar
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
