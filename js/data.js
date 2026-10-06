/* =====================================================================
   DATOS DE EJEMPLO
   Reemplaza DB por las respuestas de tu backend (fetch a tu API).
   ===================================================================== */
const AREAS = ['Aptitud Académica', 'Matemáticas', 'Ciencias', 'Humanidades'];
const DIFS = [['facil', 'Fácil'], ['intermedio', 'Intermedio'], ['dificil', 'Difícil']];
const DIF_LABEL = { facil: 'Fácil', intermedio: 'Intermedio', dificil: 'Difícil' };
const DIF_LVL = { facil: 1, intermedio: 2, dificil: 3 };
// El texto "save" (ahorro) lo escribe el administrador a mano en Admin > Exámenes > Planes.
// No se calcula solo: así el admin controla exactamente qué número mostrar.

/* =====================================================================
   MATRIZ DE PLANES: 4 PERIODOS x 3 NIVELES (12 planes)
   El id combina periodo y nivel, igual que en el backend (ej. 'mes-completo'),
   así una sola columna guarda las dos cosas y no hace falta migrar la BD.
   Nivel -> qué dificultades puede practicar:
     Básico     = fáciles
     Intermedio = fáciles + intermedias
     Completo   = las 3 dificultades
   Los 4 periodos incluyen las mismas 3 modalidades (estándar, personalizado
   y en grupo), así que solo cambian la duración y el precio.
   ===================================================================== */
const PERIODOS = [
  { id: 'dia', name: 'Día', dias: 1, frase: 'Ideal para probar o repasar el día antes.' },
  { id: 'semana', name: 'Semana', dias: 7, frase: 'Ideal para la última semana de repaso.' },
  { id: 'mes', name: 'Mes', dias: 30, frase: 'Para prepararte con constancia.' },
  { id: 'anio', name: 'Año', dias: 365, frase: 'Toda tu preparación al mejor precio.' }
];
const NIVELES = [
  { id: 'basico', name: 'Básico', difs: ['facil'], desc: 'Solo preguntas fáciles' },
  { id: 'intermedio', name: 'Intermedio', difs: ['facil', 'intermedio'], desc: 'Fáciles e intermedias' },
  { id: 'completo', name: 'Completo', difs: ['facil', 'intermedio', 'dificil'], desc: 'Los 3 niveles' }
];
const PRECIOS = {
  dia: { basico: 1, intermedio: 2, completo: 3 },
  semana: { basico: 5, intermedio: 8, completo: 10 },
  mes: { basico: 15, intermedio: 23, completo: 30 },
  anio: { basico: 100, intermedio: 120, completo: 150 }
};
// Planes anteriores a la matriz: equivalen al nivel Completo, que era lo único
// que existía entonces. Sin esto, los pagos y accesos viejos se perderían.
const PLAN_VIEJO = { dia: 'dia-completo', semana: 'semana-completo', mes: 'mes-completo' };

const unidadDe = d => d === 1 ? '/día' : d === 7 ? '/sem' : d === 30 ? '/mes' : d === 365 ? '/año' : `/${d} días`;
const textoDe = d => d === 1 ? 'Acceso por 24 horas' : `Acceso por ${d} días`;
const tiempoDe = d => d === 1 ? '24 horas' : `${d} días`;
// Frase de la portada: "24 horas de acceso. Ideal para probar el día antes."
const descPeriodo = per => `${tiempoDe(per.dias)} de acceso. ${per.frase}`;
// % de ahorro por día frente al mismo nivel del plan de un día (la referencia
// que usa la portada y el paso 2: "Ahorras 29 % frente al plan Día").
// Se toma el precio de Día que esté vigente, no el de los valores por defecto.
const precioDiaDe = nivel => {
  const p = PLANS.find(x => x.periodo === 'dia' && x.nivel === nivel);
  return p ? p.price : ((PRECIOS.dia || {})[nivel] || 0);
};
const ahorroDe = (precio, dias, nivel) => {
  const base = precioDiaDe(nivel);
  if (!base || !dias) return 0;
  return Math.max(0, Math.round((1 - (precio / dias) / base) * 100));
};
const textoAhorro = (precio, dias, nivel) => {
  const pct = ahorroDe(precio, dias, nivel);
  return pct > 0 ? `Ahorras ${pct} % frente al plan Día` : '';
};

// Los 12 planes, ordenados periodo por periodo y, dentro, de menor a mayor nivel.
const PLANS = [];
function armarPlanes() {
  PLANS.length = 0;
  PERIODOS.forEach(per => NIVELES.forEach(niv => {
    const precio = PRECIOS[per.id][niv.id];
    PLANS.push({
      id: `${per.id}-${niv.id}`,
      periodo: per.id,
      nivel: niv.id,
      name: `${per.name} ${niv.name}`,
      price: precio,
      unit: unidadDe(per.dias),
      ms: per.dias * 864e5,
      text: textoDe(per.dias),
      per: `S/ ${(precio / per.dias).toFixed(2)} por día`,
      save: textoAhorro(precio, per.dias, niv.id),
      best: niv.id === 'intermedio'
    });
  }));
}
armarPlanes();

const periodoDePlan = id => {
  if (!id) return null;
  const crudo = PLAN_VIEJO[id] || String(id);
  const p = crudo.split('-')[0];
  return PERIODOS.some(x => x.id === p) ? p : null;
};
const nivelDePlan = id => {
  if (!id) return null;
  const crudo = PLAN_VIEJO[id] || String(id);
  const n = crudo.split('-').pop();
  return NIVELES.some(x => x.id === n) ? n : null;
};
// Dificultades que abre un plan. Sin plan (o id raro) no se recorta nada:
// el que no tiene plan no llega a practicar de todos modos.
const DIFS_PLAN = id => (NIVELES.find(n => n.id === nivelDePlan(id)) || NIVELES[2]).difs;
const planesDePeriodo = id => PLANS.filter(p => p.periodo === id);

// Recalcula las etiquetas derivadas del plan (unidad, descripción y precio por día)
// cuando el admin cambia su precio o su duración. Se usa desde Admin > Exámenes > Planes.
function recalcPlan(p) {
  const d = Math.round(p.ms / 864e5);
  p.unit = unidadDe(d);
  p.text = textoDe(d);
  p.per = `S/ ${(p.price / d).toFixed(2)} por día`;
  p.save = textoAhorro(p.price, d, p.nivel);
}
// El ahorro de cada plan se compara con el de un día del mismo nivel, así que
// si cambia un precio de Día hay que recalcular los otros 9 planes.
function recalcAhorros() {
  PLANS.forEach(p => { p.save = textoAhorro(p.price, Math.round(p.ms / 864e5), p.nivel); });
}
const YAPE = { number: '999 999 999', name: 'Simulacros PE', qr: '' }; // qr: URL de tu imagen del QR de Yape
const WEEKLY_GOAL = 5;
const SCORE_MAX = 20;

const ago = d => new Date(Date.now() - d * 864e5);
const ahead = d => new Date(Date.now() + d * 864e5);
const uid = () => Math.random().toString(36).slice(2, 9);
const fake = n => Array.from({ length: n }, (_, i) => ({ name: 'Simulacro UNI - Matemática', uni: 'UNI', ts: ago(i + 1.5), pct: 55 + (i * 7) % 35 }));

const DB = {
  settings: {
    minPerQ: 2, maxQ: 50,
    // El admin decide si se ven las cantidades junto a cada chip, y si el estudiante
    // elige cuántas preguntas quiere o el sistema usa siempre el máximo disponible.
    showCountArea: true, showCountCurso: true, showCountTema: true, showCountDif: true,
    showQuestionSlider: true
  },
  questions: [
    { id: 'a1', area: 'Aptitud Académica', dif: 'facil', q: "Determine el sinónimo contextual de 'EFÍMERO':", o: ['Permanente', 'Pasajero', 'Trascendental', 'Complejo'], c: 1, why: 'Efímero es de corta duración, por tanto, pasajero.' },
    { id: 'a2', area: 'Aptitud Académica', dif: 'dificil', q: 'Con 4 pelotas rojas, 5 azules y 6 verdes, ¿cuántas extraes al azar para tener certeza de una de cada color?', o: ['10', '11', '12', '13'], c: 2, why: 'Sacas todas las verdes y azules (11). La 12 asegura una de cada color.' },
    { id: 'a3', area: 'Aptitud Académica', dif: 'intermedio', q: 'En la serie 2, 6, 12, 20, 30, ... ¿qué número sigue?', o: ['36', '40', '42', '44'], c: 2, why: 'Las diferencias son 4, 6, 8 y 10; la siguiente es 12, así que 30 + 12 = 42.' },
    { id: 'a4', area: 'Aptitud Académica', dif: 'facil', q: 'Complete la analogía: LIBRO es a BIBLIOTECA como CUADRO es a...', o: ['Pintor', 'Museo', 'Marco', 'Color'], c: 1, why: 'Un libro se guarda en una biblioteca, como un cuadro se exhibe en un museo.' },
    { id: 'a5', area: 'Aptitud Académica', dif: 'dificil', q: 'El doble de un número, aumentado en 6, es igual al triple del mismo número disminuido en 4. ¿Cuál es el número?', o: ['8', '10', '12', '14'], c: 1, why: '2x + 6 = 3x − 4, entonces x = 10.' },
    { id: 'a6', area: 'Aptitud Académica', dif: 'facil', q: 'Elija la palabra que no pertenece al grupo: rojo, azul, verde, cuadrado.', o: ['Rojo', 'Azul', 'Verde', 'Cuadrado'], c: 3, why: 'Rojo, azul y verde son colores; cuadrado es una figura geométrica.' },
    { id: 'm1', area: 'Matemáticas', dif: 'facil', q: 'Si 3x + 5 = 20, ¿cuál es el valor de x?', o: ['3', '5', '7', '15'], c: 1, why: '3x = 15, entonces x = 5.' },
    { id: 'm2', area: 'Matemáticas', dif: 'facil', q: '¿Cuál es el área de un triángulo de base 10 cm y altura 6 cm?', o: ['60 cm²', '16 cm²', '30 cm²', '32 cm²'], c: 2, why: 'Área = (base × altura) / 2 = (10 × 6) / 2 = 30 cm².' },
    { id: 'm3', area: 'Matemáticas', dif: 'intermedio', q: 'La suma de las raíces de x² − 7x + 12 = 0 es:', o: ['7', '12', '−7', '4'], c: 0, why: 'Las raíces son 3 y 4; su suma es 7.' },
    { id: 'm4', area: 'Matemáticas', dif: 'facil', q: '¿Cuál es el 20 % de 250?', o: ['50', '40', '25', '60'], c: 0, why: '250 × 0,20 = 50.' },
    { id: 'm5', area: 'Matemáticas', dif: 'dificil', q: 'Si log₂(x) + log₂(x − 2) = 3, ¿cuál es el valor de x?', o: ['2', '3', '4', '6'], c: 2, why: 'x(x − 2) = 2³ = 8, luego x² − 2x − 8 = 0 y x = 4 (x = −2 no cumple el dominio).' },
    { id: 'm6', area: 'Matemáticas', dif: 'intermedio', q: '¿Cuál es la pendiente de la recta que pasa por (1, 2) y (3, 8)?', o: ['2', '3', '4', '6'], c: 1, why: 'm = (8 − 2) / (3 − 1) = 3.' },
    { id: 'c1', area: 'Ciencias', dif: 'facil', q: '¿Cuál es el símbolo químico del sodio?', o: ['S', 'So', 'Na', 'N'], c: 2, why: 'El símbolo Na proviene del latín natrium.' },
    { id: 'c2', area: 'Ciencias', dif: 'facil', q: '¿En qué unidad del Sistema Internacional se mide la fuerza?', o: ['Joule', 'Newton', 'Pascal', 'Watt'], c: 1, why: 'La fuerza se mide en newton (N). El joule mide energía, el pascal presión y el watt potencia.' },
    { id: 'c3', area: 'Ciencias', dif: 'intermedio', q: '¿En qué orgánulo de la célula se realiza la respiración celular?', o: ['Ribosoma', 'Núcleo', 'Mitocondria', 'Lisosoma'], c: 2, why: 'La mitocondria produce ATP mediante la respiración celular.' },
    { id: 'c4', area: 'Ciencias', dif: 'intermedio', q: 'Un móvil recorre 120 km en 2 horas. ¿Cuál es su rapidez media?', o: ['40 km/h', '60 km/h', '80 km/h', '240 km/h'], c: 1, why: 'v = d / t = 120 km / 2 h = 60 km/h.' },
    { id: 'c5', area: 'Ciencias', dif: 'facil', q: '¿Cuál es el pH de una solución neutra a 25 °C?', o: ['0', '14', '1', '7'], c: 3, why: 'A 25 °C, una solución neutra tiene pH 7.' },
    { id: 'c6', area: 'Ciencias', dif: 'dificil', q: '¿Cuántos gramos de agua se forman al reaccionar 4 g de hidrógeno con suficiente oxígeno? (H = 1, O = 16)', o: ['18 g', '32 g', '36 g', '72 g'], c: 2, why: '4 g de H₂ son 2 mol; en 2H₂ + O₂ → 2H₂O se forman 2 mol de agua, es decir, 36 g.' },
    { id: 'c7', area: 'Ciencias', dif: 'intermedio', q: 'Un gas ideal, a temperatura constante, reduce su volumen a la mitad. ¿Qué ocurre con su presión?', o: ['Se reduce a la mitad', 'Se mantiene', 'Se duplica', 'Se cuadruplica'], c: 2, why: 'Por la ley de Boyle, P · V es constante; si V se reduce a la mitad, P se duplica.' },
    { id: 'h1', area: 'Humanidades', dif: 'facil', q: '¿En qué año se proclamó la independencia del Perú?', o: ['1810', '1821', '1824', '1879'], c: 1, why: 'José de San Martín proclamó la independencia el 28 de julio de 1821.' },
    { id: 'h2', area: 'Humanidades', dif: 'intermedio', q: '¿Cuál es el sujeto en la oración "Los estudiantes practicaron toda la tarde"?', o: ['toda la tarde', 'practicaron', 'la tarde', 'Los estudiantes'], c: 3, why: 'El sujeto es quien realiza la acción: los estudiantes.' },
    { id: 'h3', area: 'Humanidades', dif: 'intermedio', q: '¿Quién escribió la novela "Los ríos profundos"?', o: ['Mario Vargas Llosa', 'José María Arguedas', 'Ciro Alegría', 'Ricardo Palma'], c: 1, why: 'Los ríos profundos (1958) es una novela de José María Arguedas.' },
    { id: 'h4', area: 'Humanidades', dif: 'intermedio', q: '¿Cómo se llama la civilización más antigua del Perú, cuyo centro urbano principal se ubica en el valle de Supe?', o: ['Chavín', 'Caral', 'Moche', 'Wari'], c: 1, why: 'Caral, en el valle de Supe, es considerada la civilización más antigua de América.' },
    { id: 'h5', area: 'Humanidades', dif: 'facil', q: '¿Qué figura literaria se usa en "Tus ojos son dos luceros"?', o: ['Símil', 'Hipérbole', 'Metáfora', 'Personificación'], c: 2, why: 'Se identifica los ojos con luceros sin usar un nexo comparativo: es una metáfora.' },
    { id: 'h6', area: 'Humanidades', dif: 'dificil', q: '¿Qué tratado puso fin a la Guerra del Pacífico entre el Perú y Chile en 1883?', o: ['Tratado de Lima', 'Tratado de Ancón', 'Tratado de Versalles', 'Tratado de Tordesillas'], c: 1, why: 'El Tratado de Ancón (1883) puso fin a la guerra entre el Perú y Chile.' }
  ],
  // poolIds = banco de preguntas elegibles para ese examen; count = cuántas se sortean cada día.
  // Con count == poolIds.length no se "reduce" nada: solo se fija el orden del día y las alternativas por intento.
  // El admin puede ampliar poolIds más adelante sin tocar count, para que de verdad sea un sorteo entre más preguntas.
  exams: [
    { id: 'unmsm', uni: 'UNMSM', title: 'Simulacro de admisión UNMSM', full: 'Universidad Nacional Mayor de San Marcos', mins: 60, poolIds: ['a1', 'a2', 'h1', 'm1', 'c1', 'c3', 'h4', 'm3'], count: 8 },
    { id: 'uni-hum', uni: 'UNI', title: 'Simulacro UNI - Humanidades', full: 'Universidad Nacional de Ingeniería', mins: 180, poolIds: ['a1', 'a4', 'h1', 'h2', 'h3', 'h5', 'h6'], count: 7 },
    { id: 'unalm', uni: 'UNALM', title: 'Simulacro de admisión UNALM', full: 'Universidad Nacional Agraria La Molina', mins: 60, poolIds: ['a2', 'a3', 'm1', 'c1', 'c2', 'c3', 'c7'], count: 7 },
    { id: 'uni-mat', uni: 'UNI', title: 'Simulacro UNI - Matemática', full: 'Universidad Nacional de Ingeniería', mins: 180, poolIds: ['a2', 'a3', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'], count: 8 },
    { id: 'uni-cie', uni: 'UNI', title: 'Simulacro UNI - Ciencias', full: 'Universidad Nacional de Ingeniería', mins: 180, poolIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'], count: 7 }
  ],
  users: [
    { id: 'me', name: 'María Torres', email: 'maria@correo.com', plan: 'semana-completo', until: ahead(5), results: [] },
    { id: 'u2', name: 'Carlos Quispe', email: 'carlos.quispe@correo.com', plan: 'dia-completo', until: ago(1), results: fake(3) },
    { id: 'u3', name: 'Lucía Ramos', email: 'lucia.ramos@correo.com', plan: 'mes-completo', until: ahead(21), results: fake(8) },
    { id: 'u4', name: 'Diego Flores', email: 'diego.flores@correo.com', plan: null, until: null, results: [] },
    { id: 'u5', name: 'Ana Paredes', email: 'ana.paredes@correo.com', plan: 'semana-basico', until: ago(2), results: fake(5) },
    { id: 'u6', name: 'Sofía Vega', email: 'sofia.vega@correo.com', plan: null, until: null, results: [] }
  ],
  payments: [
    { id: 'p1', userId: 'u4', plan: 'dia-basico', amount: 1, op: '00219473', ts: new Date(Date.now() - 36e5), status: 'pending' },
    { id: 'p2', userId: 'u6', plan: 'semana-basico', amount: 5, op: '00458812', ts: new Date(Date.now() - 3 * 36e5), status: 'pending' },
    { id: 'p3', userId: 'u3', plan: 'mes-basico', amount: 15, op: '00397120', ts: ago(9), status: 'approved' },
    { id: 'p4', userId: 'u2', plan: 'dia-basico', amount: 1, op: '00120034', ts: ago(2), status: 'approved' },
    { id: 'p5', userId: 'u4', plan: 'dia-basico', amount: 1, op: '00099881', ts: ago(3), status: 'rejected' }
  ]
};
let meId = 'me';
DB.plans = PLANS; // mismo array: editarlo en un lugar lo actualiza en toda la app

/* =====================================================================
   AMPLIACIONES DE LOS DATOS DE EJEMPLO
   (temas, prueba gratis, puntaje por examen, reportes, cupones, actividad y estadísticas)
   ===================================================================== */
// Jerarquía: Área > Curso > Tema. El curso agrupa varias preguntas (p. ej. "Álgebra");
// el tema es el contenido puntual dentro del curso (p. ej. "Ecuaciones cuadráticas").
const CURSOS = {
  a1: 'Razonamiento verbal', a2: 'Razonamiento lógico', a3: 'Razonamiento numérico', a4: 'Razonamiento verbal', a5: 'Razonamiento numérico', a6: 'Razonamiento verbal',
  m1: 'Álgebra', m2: 'Geometría', m3: 'Álgebra', m4: 'Aritmética', m5: 'Álgebra', m6: 'Geometría analítica',
  c1: 'Química', c2: 'Física', c3: 'Biología', c4: 'Física', c5: 'Química', c6: 'Química', c7: 'Física', c8: 'Física',
  h1: 'Historia del Perú', h2: 'Lenguaje', h3: 'Literatura', h4: 'Historia del Perú', h5: 'Literatura', h6: 'Historia del Perú'
};
const TEMAS = {
  a1: 'Sinónimos y antónimos', a2: 'Certeza y combinatoria', a3: 'Series numéricas', a4: 'Analogías', a5: 'Planteo de ecuaciones', a6: 'Término excluido',
  m1: 'Ecuaciones lineales', m2: 'Áreas de figuras planas', m3: 'Ecuaciones cuadráticas', m4: 'Porcentajes', m5: 'Logaritmos', m6: 'La recta: pendiente',
  c1: 'Tabla periódica', c2: 'Magnitudes y unidades', c3: 'La célula', c4: 'Cinemática: MRU', c5: 'Ácidos y bases', c6: 'Estequiometría', c7: 'Gases ideales', c8: 'Cinemática: gráficas',
  h1: 'Independencia del Perú', h2: 'Sintaxis: sujeto y predicado', h3: 'Narrativa peruana', h4: 'Culturas preincas', h5: 'Figuras literarias', h6: 'La Guerra del Pacífico'
};
const FREE_TRIAL_IDS = ['a1', 'm1', 'c2', 'c8', 'h1']; // preguntas de la prueba gratis
DB.questions.forEach(q => { q.curso = CURSOS[q.id] || ''; q.tema = TEMAS[q.id] || ''; q.free = FREE_TRIAL_IDS.includes(q.id); });
// Puntaje por examen: puntos por correcta, por incorrecta (puede ser negativo) y escala final (0 = puntos directos)
DB.exams.forEach(e => { e.published = true; e.pc = 1; e.pw = 0; e.scale = 20; });
Object.assign(DB.settings, { eta: '', maxPerDay: 10, referralDays: 1 });

DB.events = [];
DB.clientErrors = [];
DB.funnelBase = { home: 120, trial: 45, register: 30, plan: 22, payment: 15, approved: 12 }; // datos de ejemplo para el embudo

DB.coupons = [
  { code: 'BIENVENIDA', percent: 20, active: true, expires: null, max: 100, used: 12 },
  { code: 'UNI10', percent: 10, active: true, expires: todayKey(ahead(30)), max: null, used: 3 }
];
DB.reports = [
  { id: 'r1', qid: 'a2', userId: 'u3', reason: 'Respuesta incorrecta', note: 'Creo que la respuesta correcta es 11, no 12.', ts: ago(1), status: 'open', reply: '', repliedAt: null },
  { id: 'r2', qid: 'h5', userId: 'u5', reason: 'Enunciado confuso o con error', note: '', ts: ago(6), status: 'resolved', reply: 'Revisamos la pregunta y el sustento ya quedó más claro. ¡Gracias por avisarnos!', repliedAt: ago(5) }
];
DB.audit = [
  { at: ago(9), who: 'Admin', action: 'Aprobó un pago', detail: 'Lucía Ramos, plan Mes, S/ 15.00' },
  { at: ago(2), who: 'Admin', action: 'Aprobó un pago', detail: 'Carlos Quispe, plan Día, S/ 1.00' },
  { at: ago(3), who: 'Admin', action: 'Rechazó un pago', detail: 'Diego Flores, operación 00099881' }
];

// Estadísticas de aciertos por pregunta (cuántas veces se rindió y cuántas se acertó)
DB.qstats = {};
DB.questions.forEach((q, i) => {
  const base = { facil: .88, intermedio: .62, dificil: .33 }[q.dif];
  const n = 18 + (i * 7) % 40;
  const p = Math.min(.97, Math.max(.05, base + ((i * 37) % 21 - 10) / 100));
  DB.qstats[q.id] = { n, ok: Math.round(n * p) };
});
DB.qstats.a2 = { n: 34, ok: 26 }; // marcada como difícil, pero casi todos la aciertan: el panel sugerirá otra dificultad

// Resultados de ejemplo con desglose por área y dificultad
(() => {
  const sr = (name, uni, days, areas, difs, used) => {
    const sum = m => Object.values(m).reduce((a, [ok, t]) => [a[0] + ok, a[1] + t], [0, 0]);
    const [ok, total] = sum(areas);
    const obj = m => Object.fromEntries(Object.entries(m).map(([k, [o, t]]) => [k, { ok: o, bad: t - o, blank: 0, total: t }]));
    return { name, uni, ts: ago(days), pct: Math.round(ok / total * 100), total, used, areas: obj(areas), difs: obj(difs), cursos: {}, temas: {}, practice: false };
  };
  const A = 'Aptitud Académica', M = 'Matemáticas', C = 'Ciencias', H = 'Humanidades';
  DB.users[0].results = [
    sr('Simulacro UNI - Matemática', 'UNI', 2, { [M]: [4, 6], [A]: [3, 3] }, { facil: [5, 5], intermedio: [2, 3], dificil: [0, 1] }, 1250),
    sr('Simulacro de admisión UNMSM', 'UNMSM', 4, { [A]: [2, 3], [H]: [1, 2], [M]: [1, 2], [C]: [1, 2] }, { facil: [3, 4], intermedio: [2, 4], dificil: [0, 1] }, 2100),
    sr('Simulacro de admisión UNALM', 'UNALM', 6, { [A]: [2, 2], [M]: [1, 1], [C]: [2, 4] }, { facil: [3, 3], intermedio: [2, 3], dificil: [0, 1] }, 1500),
    sr('Simulacro UNI - Ciencias', 'UNI', 9, { [C]: [4, 7] }, { facil: [3, 3], intermedio: [1, 3], dificil: [0, 1] }, 2600),
    sr('Simulacro UNI - Humanidades', 'UNI', 11, { [H]: [4, 4], [A]: [2, 3] }, { facil: [4, 4], intermedio: [2, 2], dificil: [0, 1] }, 1900),
    sr('Simulacro de admisión UNMSM', 'UNMSM', 14, { [A]: [2, 3], [H]: [2, 3], [M]: [1, 2], [C]: [1, 2] }, { facil: [4, 4], intermedio: [2, 4], dificil: [0, 2] }, 2300)
  ];
  DB.users.forEach(u => u.results.forEach(r => {
    r.total ??= 9; r.used ??= 1500; r.areas ??= {}; r.difs ??= {}; r.cursos ??= {}; r.temas ??= {}; r.practice ??= false;
  }));
})();

// Meta, código de referido y quién invitó a quién
const makeRef = name => name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) + '-' + uid().slice(0, 4).toUpperCase();
DB.users.forEach(u => { u.refCode = makeRef(u.name); u.referredBy = null; u.goal = null; u.pw = 'demo12345'; });
DB.users[0].goal = { uni: 'UNI', date: todayKey(ahead(58)) };
DB.users.find(u => u.id === 'u3').referredBy = 'me';
DB.payments.forEach(p => { p.coupon = null; p.proof = null; });
