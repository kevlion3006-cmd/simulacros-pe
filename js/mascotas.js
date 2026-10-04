/* =====================================================================
   MASCOTAS
   Las ilustraciones originales están en la carpeta /mascotas (PNG con fondo
   transparente). Cada animal lleva birrete y se apoya sobre su pila de
   exámenes; el dibujo completo viene listo, así que aquí solo se elige cuál
   mostrar y en qué tamaño.

   La mascota se sortea sola: el grupo depende de cómo va el estudiante o de
   la fecha, y dentro del grupo se elige al azar cada vez que se cambia de
   pantalla. Así nunca sale siempre la misma, pero sin perder el sentido.

   - Cóndor   → cumplió la meta semanal (premio)
   - Perro    → sin empezar, atrasado, o con el plan por vencer (ánimo)
   - Gallito  → Fiestas Patrias
   - Llama    → inicio de semestre
   - Búho     → mascota de la casa; sale casi siempre
   - Zorro    → alternativa del día a día
   ===================================================================== */

const MASCOTAS = {
  buho: { nombre: 'Búho', archivo: 'buho.png', proporcion: 368 / 478 },
  zorro: { nombre: 'Zorro', archivo: 'zorro.png', proporcion: 347 / 466 },
  llama: { nombre: 'Llama', archivo: 'llama.png', proporcion: 328 / 443 },
  perro: { nombre: 'Perro Peruano', archivo: 'perro.png', proporcion: 297 / 401 },
  gallito: { nombre: 'Gallito de las Rocas', archivo: 'gallito.png', proporcion: 374 / 405 },
  condor: { nombre: 'Cóndor', archivo: 'condor.png', proporcion: 809 / 1139 }
};

/* ---------- Qué mascota ----------

   Hay dos reglas que se combinan:

   1) LA OCASIÓN. Según cómo va el estudiante o qué fecha es, hay un grupo de
      animales "contenido". Si cumplió la meta le toca el cóndor, si va atrasado
      el perro, en Fiestas Patrias el gallito... esos no se sortean: significan
      algo y deben verse siempre.

   2) EL SORTEO. Dentro del grupo que corresponde se elige al azar cada vez que
      el estudiante cambia de pantalla, sin repetir el que ya estaba puesto.
      Así la pantalla no es siempre la misma, pero sin perder el sentido. */
const GRUPOS = {
  metaCumplida: ['condor'],
  atrasado: ['perro', 'buho'],
  fiestas: ['gallito', 'condor'],
  semestre: ['llama', 'buho'],
  siempre: ['buho', 'zorro', 'llama']
};

let _mascotaActual = '';

function grupoMascota(u, st, w) {
  const hoy = new Date(), mes = hoy.getMonth() + 1, dia = hoy.getDate();
  const meta = (typeof WEEKLY_GOAL === 'number' && WEEKLY_GOAL > 0) ? WEEKLY_GOAL : 5;
  const quedan = (u && u.until) ? u.until - new Date() : NaN;
  const porVencer = st === 'active' && !isNaN(quedan) && quedan <= 24 * 36e5;

  if (st === 'active') {
    if (w >= meta) return GRUPOS.metaCumplida;   // cumplió la meta
    if (porVencer || w === 0) return GRUPOS.atrasado;
  }
  if (mes === 7 && dia >= 20 && dia <= 30) return GRUPOS.fiestas;
  if (mes === 8 || mes === 2 || mes === 3) return GRUPOS.semestre;
  return GRUPOS.siempre;
}

// Sortea uno del grupo sin repetir el que ya está puesto (si hay con qué).
function occasionMascota(u, st, w) {
  let opciones = grupoMascota(u, st, w);
  if (opciones.length > 1) {
    const otras = opciones.filter(x => x !== _mascotaActual);
    if (otras.length) opciones = otras;
  }
  return opciones[Math.floor(Math.random() * opciones.length)];
}

/* Pinta la mascota en el héroe del panel. Se llama en cada cambio de pantalla.

   El ancho lo decide el CSS y el alto sale de la proporción real de cada dibujo,
   así el texto no da un salto mientras carga la imagen. */
function pintarMascota(u, st, w) {
  const caja = $('#mascot');
  if (!caja) return;
  const id = occasionMascota(u, st, w);
  const m = MASCOTAS[id];
  if (!m) return;
  _mascotaActual = id;

  const ruta = 'mascotas/' + m.archivo;
  // El ancho lo decide el CSS; el alto se calcula con la proporción del dibujo.
  caja.style.setProperty('--mascot-alto', Math.round(100 / m.proporcion) + '%');
  caja.innerHTML =
    '<img src="' + esc(ruta) + '" alt="Mascota de Simulacros PE: ' + esc(m.nombre) +
    '" decoding="async">';

  // Animación de entrada: sin esto el cambio se ve como un parpadeo seco.
  caja.classList.remove('mascot-in');
  void caja.offsetWidth;
  caja.classList.add('mascot-in');
}
