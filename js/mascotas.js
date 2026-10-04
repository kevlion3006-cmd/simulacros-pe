/* =====================================================================
   MASCOTAS
   Las ilustraciones originales están en la carpeta /mascotas (PNG con fondo
   transparente). Cada animal lleva birrete y se apoya sobre su pila de
   exámenes; el dibujo completo viene listo, así que aquí solo se elige cuál
   mostrar y en qué tamaño.

   Las seis mascotas están en el mismo grupo: en cada cambio de pantalla sale
   una al azar, sin repetir la anterior. Así todas se ven por igual.
   ===================================================================== */

/* Las imágenes están en WebP (mismo dibujo, un 89 % más liviano que el PNG).
   La proporción es la del WebP ya escalado, y se usa para calcular el alto en
   CSS: así la casilla del héroe reserva el espacio correcto desde el principio
   y el texto no da un salto mientras carga.

   ancho: opcional. El gallito es un dibujo cuadrado (casi tan ancho como alto),
   así que con el ancho común se ve más bajito que los demás; con un ancho
   mayor queda a la misma altura que el resto. */
const MASCOTAS = {
  buho: { nombre: 'Búho', archivo: 'buho.webp', proporcion: 368 / 478 },
  zorro: { nombre: 'Zorro', archivo: 'zorro.webp', proporcion: 347 / 466 },
  llama: { nombre: 'Llama', archivo: 'llama.webp', proporcion: 328 / 443 },
  perro: { nombre: 'Perro Peruano', archivo: 'perro.webp', proporcion: 297 / 401 },
  gallito: { nombre: 'Gallito de las Rocas', archivo: 'gallito.webp', proporcion: 374 / 405, ancho: 215 },
  condor: { nombre: 'Cóndor', archivo: 'condor.webp', proporcion: 420 / 591 }
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
/* Todas las mascotas entran en el mismo grupo: cualquiera puede salir en
   cualquier momento, sin repetir la que ya está puesta. Así ninguna se queda
   sin verse nunca. */
const GRUPOS = {
  siempre: ['buho', 'zorro', 'llama', 'perro', 'gallito', 'condor']
};

let _mascotaActual = '';

function grupoMascota() {
  return GRUPOS.siempre;
}

// Sortea una mascota sin repetir la que ya está puesta (si hay con qué).
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
  // El alto se calcula con la proporción del dibujo; el ancho lo decide el CSS,
  // salvo que la mascota pida uno propio (el gallito, que es cuadrado).
  caja.style.setProperty('--mascot-alto', Math.round(100 / m.proporcion) + '%');
  caja.style.setProperty('--mascot-ancho', (m.ancho ? m.ancho + 'px' : ''));
  caja.innerHTML =
    '<img src="' + esc(ruta) + '" alt="Mascota de Simulacros PE: ' + esc(m.nombre) +
    '" decoding="async">';

  // Animación de entrada: sin esto el cambio se ve como un parpadeo seco.
  caja.classList.remove('mascot-in');
  void caja.offsetWidth;
  caja.classList.add('mascot-in');
}
