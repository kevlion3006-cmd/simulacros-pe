/* =====================================================================
   MASCOTAS
   Cada animal lleva birrete y se apoya sobre una pila de exámenes.
   Son SVG dibujados a mano (unos 2 KB cada uno) para que se vean nítidos
   en cualquier pantalla y no pesen nada.

   La mascota se sortea sola: el grupo depende de cómo va el estudiante o
   de la fecha, y dentro del grupo se elige al azar cada vez que se cambia
   de pantalla. Así nunca sale siempre la misma, pero sin perder el sentido.

   - Cóndor   → cumplió la meta semanal (premio)
   - Perro    → sin empezar, atrasado, o con el plan por vencer (ánimo)
   - Gallito  → Fiestas Patrias
   - Llama    → inicio de semestre
   - Búho     → mascota de la casa; sale casi siempre
   - Zorro    → alternativa del día a día
   ===================================================================== */

/* Pila de exámenes: la base donde se apoyan todos */
const _papeles = `
<g stroke="#241C15" stroke-width="2.4" stroke-linejoin="round">
  <path d="M24 116h72l-7 9H17z" fill="#FFFFFF"/>
  <path d="M29 107h72l-7 9H22z" fill="#EDE3D2"/>
  <path d="M34 98h60l-7 9H27z" fill="#FFFFFF"/>
  <path d="M37 102h34" stroke="#CBBEA9" stroke-width="2" stroke-linecap="round" fill="none"/>
</g>`;

/* Birrete (tope + alas + borla). Se coloca sobre la cabeza de cada animal:
   x = centro, y = parte de arriba del birrete. Todo cabe dentro de la caja
   0 0 120 130, así que el SVG nunca recorta nada. */
const _birrete = (x, y, s = 0.9) => `
<g transform="translate(${x} ${y}) scale(${s})" stroke="#241C15" stroke-width="2.6" stroke-linejoin="round">
  <path d="M0 0-24 9l24 10 24-10z" fill="#1E3A6B"/>
  <path d="M-15 14v10c0 4 6.5 7 15 7s15-3 15-7V14L0 20z" fill="#2A4C86"/>
  <path d="M24 8v15" fill="none" stroke-linecap="round"/>
  <circle cx="24" cy="25" r="4" fill="#E9C760"/>
</g>`;

const MASCOTAS = {
  buho: {
    nombre: 'Búho', birrete: [60, 36],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M36 44l-5-18 17 9z" fill="#F6E7CE"/>
      <path d="M84 44l5-18-17 9z" fill="#F6E7CE"/>
      <path d="M60 44c18 0 31 15 31 33 0 14-13 22-31 22s-31-8-31-22c0-18 13-33 31-33z" fill="#F6E7CE"/>
      <ellipse cx="46" cy="67" rx="16" ry="17" fill="#FFF7E7"/>
      <ellipse cx="74" cy="67" rx="16" ry="17" fill="#FFF7E7"/>
      <circle cx="46" cy="67" r="8.5" fill="#E8452C"/>
      <circle cx="74" cy="67" r="8.5" fill="#E8452C"/>
      <circle cx="46" cy="67" r="3.6" fill="#241C15"/>
      <circle cx="74" cy="67" r="3.6" fill="#241C15"/>
      <circle cx="48.5" cy="63.5" r="1.7" fill="#fff"/>
      <circle cx="76.5" cy="63.5" r="1.7" fill="#fff"/>
      <path d="M60 74l6.5 7h-13z" fill="#E9C760"/>
      <path d="M33 78c-5 8-3 15 3 19M87 78c5 8 3 15-3 19" fill="none"/>
      <path d="M52 100v4M68 100v4" fill="none"/>
    </g>`
  },

  llama: {
    nombre: 'Llama', birrete: [45, 40],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M74 54c14 3 21 13 21 25 0 13-10 20-23 20-6 0-10-3-16-3-11 0-19-7-19-18 0-10 8-17 18-19 9-2 13-5 19-5z" fill="#F6E7CE"/>
      <path d="M52 58c-9 1-14 8-14 17 0 8 5 13 5 19 0 5-4 7-10 7 10 5 23 2 27-5 3-5 1-10-1-14-3-6 0-13 6-17z" fill="#FBF3E4"/>
      <ellipse cx="45" cy="64" rx="12" ry="13" fill="#FBF3E4"/>
      <path d="M36 51c-4-9-3-14 1-15 4-1 6 5 7 13z" fill="#FBF3E4"/>
      <path d="M56 51c4-9 3-14-1-15-4-1-6 5-7 13z" fill="#FBF3E4"/>
      <circle cx="41" cy="64" r="2.6" fill="#241C15"/>
      <circle cx="51" cy="64" r="2.6" fill="#241C15"/>
      <ellipse cx="46" cy="71" rx="4.5" ry="3" fill="#DFA98B"/>
      <path d="M63 66c6 5 6 15 2 21M78 72c4 4 5 11 2 16" fill="none"/>
    </g>`
  },

  condor: {
    nombre: 'Cóndor', birrete: [60, 26],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M60 40c-8 0-13 6-13 13s5 13 13 13 13-6 13-13-5-13-13-13z" fill="#E8A79A"/>
      <path d="M48 50c2-8 7-12 12-12s10 4 12 12c-4 3-8 4-12 4s-8-1-12-4z" fill="#F6E7CE"/>
      <circle cx="54" cy="52" r="2.6" fill="#241C15"/>
      <circle cx="66" cy="52" r="2.6" fill="#241C15"/>
      <path d="M60 58l-4 4h8z" fill="#E9C760"/>
      <path d="M60 66c-15 0-25 11-25 23 0 4 1 7 3 10-8 5-13 12-13 19 0 5 3 9 7 9 4 0 7-5 7-11 0-4 2-7 5-7s5 3 5 7c0 6 3 11 8 11s8-5 8-11c0-4 2-7 5-7s5 3 5 7c0 6 3 11 8 11 4 0 7-4 7-9 0-7-5-14-13-19 2-3 3-6 3-10 0-12-10-23-25-23z" fill="#F6E7CE"/>
      <path d="M41 74c-8 2-13 7-15 14 6 1 12 0 17-3M79 74c8 2 13 7 15 14-6 1-12 0-17-3" fill="#EFE0C4"/>
      <path d="M46 81l14 8 14-8" fill="none"/>
      <path d="M52 98l-3 2M68 98l3 2" fill="none"/>
    </g>`
  },

  zorro: {
    nombre: 'Zorro', birrete: [60, 38],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M34 46 29 24l19 12z" fill="#E8834A"/>
      <path d="M86 46l5-22-19 12z" fill="#E8834A"/>
      <path d="M60 46c16 0 26 13 26 28 0 13-11 22-26 22s-26-9-26-22c0-15 10-28 26-28z" fill="#E8834A"/>
      <path d="M60 62c11 0 19 8 19 16 0 7-8 12-19 12s-19-5-19-12c0-8 8-16 19-16z" fill="#FFF3E2"/>
      <circle cx="50" cy="60" r="2.8" fill="#241C15"/>
      <circle cx="70" cy="60" r="2.8" fill="#241C15"/>
      <path d="M60 68l-6 5h12z" fill="#241C15"/>
      <path d="M60 73v6M60 76c-3 3-7 3-9 0M60 76c3 3 7 3 9 0" fill="none"/>
      <path d="M37 88c-9 4-12 11-11 17 8 1 14-2 18-8M37 88c-9 4-12 11-11 17 5 1 9 0 13-3-4-5-4-10-2-14z" fill="#E8834A"/>
      <path d="M37 88c-9 4-12 11-11 17 5 1 9 0 13-3-4-5-4-10-2-14z" fill="#FFF3E2"/>
      <path d="M51 97l-3 4M69 97l3 4" fill="none"/>
    </g>`
  },

  gallito: {
    nombre: 'Gallito de las Rocas', birrete: [60, 30],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M49 46c-4-8-3-12 0-13 3-1 5 4 6 9 1-8 4-11 7-10 3 1 2 7 0 12 4-6 8-7 10-5 2 3-2 8-7 11z" fill="#E8452C"/>
      <ellipse cx="60" cy="60" rx="22" ry="21" fill="#2A2118"/>
      <path d="M47 56c3-6 8-8 13-8s10 2 13 8c-4 4-8 6-13 6s-9-2-13-6z" fill="#F6E7CE"/>
      <circle cx="53" cy="63" r="3" fill="#FFF7E7"/>
      <circle cx="67" cy="63" r="3" fill="#FFF7E7"/>
      <circle cx="53" cy="63" r="1.3" fill="#241C15"/>
      <circle cx="67" cy="63" r="1.3" fill="#241C15"/>
      <path d="M60 69l-7 5h14z" fill="#E9C760"/>
      <path d="M45 80c-9 3-14 9-15 16 9 2 16-1 20-6 3 7 7 10 10 10s7-3 10-10c4 5 11 8 20 6-1-7-6-13-15-16-5 4-10 5-15 5s-10-1-15-5z" fill="#E8452C"/>
      <path d="M60 81v15M53 83l-5 13M67 83l5 13" fill="none"/>
      <path d="M52 96l-4 4M68 96l4 4" fill="none"/>
    </g>`
  },

  perro: {
    nombre: 'Perro Peruano', birrete: [60, 35],
    svg: `<g stroke="#241C15" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M37 48c-6 1-10 8-10 17 0 9 3 14 8 15-1 3-1 6 0 8 3 4 9 4 12 0 3-5 2-15-2-25-2-6-5-9-8-8z" fill="#B07A4E"/>
      <path d="M83 48c6 1 10 8 10 17 0 9-3 14-8 15 1 3 1 6 0 8-3 4-9 4-12 0-3-5-2-15 2-25 2-6 5-9 8-8z" fill="#B07A4E"/>
      <path d="M60 44c14 0 23 12 23 25 0 15-10 25-23 25s-23-10-23-25c0-13 9-25 23-25z" fill="#F6E7CE"/>
      <path d="M47 67c4-5 8-7 13-7s9 2 13 7c-3 6-8 9-13 9s-10-3-13-9z" fill="#FFF7E7"/>
      <ellipse cx="60" cy="71" rx="7" ry="5.5" fill="#2A2118"/>
      <path d="M60 76v5M60 79c-3 3-7 3-9 0M60 79c3 3 7 3 9 0" fill="none"/>
      <circle cx="49" cy="58" r="2.8" fill="#241C15"/>
      <circle cx="71" cy="58" r="2.8" fill="#241C15"/>
      <path d="M50 93l-4 3M70 93l4 3" fill="none"/>
    </g>`
  }
};

/* ---------- Qué mascota toca ----------

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

/* Pinta la mascota en el héroe del panel. Se llama en cada cambio de pantalla. */
function pintarMascota(u, st, w) {
  const caja = $('#mascot');
  if (!caja) return;
  const id = occasionMascota(u, st, w);
  const m = MASCOTAS[id];
  if (!m) return;
  _mascotaActual = id;
  const bx = m.birrete[0], by = m.birrete[1];
  caja.innerHTML =
    '<svg viewBox="0 0 120 130" role="img" aria-label="Mascota de Simulacros PE: ' + esc(m.nombre) +
    '" focusable="false">' + _papeles + m.svg + _birrete(bx, by) + '</svg>';
  // Animación de entrada: sin esto el cambio se ve como un parpadeo seco.
  caja.classList.remove('mascot-in');
  void caja.offsetWidth;
  caja.classList.add('mascot-in');
}
