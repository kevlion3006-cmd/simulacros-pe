/* =====================================================================
   MASCOTAS
   La ilustración original está en la carpeta /mascotas (PNG con fondo
   transparente). El animal lleva birrete y se apoya sobre su pila de
   exámenes; el dibujo completo viene listo, así que aquí solo se coloca.

   La mascota de la casa es el búho: es la única que se muestra, en
   computadora y en celular, siempre en el mismo lugar.
   ===================================================================== */

/* La imagen está en WebP (mismo dibujo, un 89 % más liviano que el PNG).
   La proporción es la del WebP ya escalado, y se usa para calcular el alto en
   CSS: así la casilla del héroe reserva el espacio correcto desde el principio
   y el texto no da un salto mientras carga.

   ancho: opcional, para los dibujos cuadrados que necesitan un ancho propio
   para quedar a la misma altura que los demás. El búho no lo necesita. */
const MASCOTAS = {
  buho: { nombre: 'Búho', archivo: 'buho.webp', proporcion: 368 / 478 }
};

/* ---------- Qué mascota ----------
   Solo hay un grupo y dentro está únicamente el búho, así que no hay sorteo:
   la mascota del panel es siempre la misma. Se deja el mecanismo de grupos por
   si más adelante se quiere volver a sumar algún dibujo. */
const GRUPOS = {
  siempre: ['buho']
};

let _mascotaActual = '';

function grupoMascota() {
  return GRUPOS.siempre;
}

// Devuelve la mascota que toca (con una sola, siempre esa).
function occasionMascota(u, st, w) {
  const opciones = grupoMascota(u, st, w);
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
  // salvo que la mascota pida uno propio.
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
