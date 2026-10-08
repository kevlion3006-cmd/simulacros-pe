/* =====================================================================
   MODO COMPETITIVO — pantalla de resultados del grupo

   - GET  /api/competitivo/{codigo}/resultados  (solo participantes: 403)
   - POST /api/competitivo/{codigo}/revancha    (grupo nuevo, mismas reglas)

   El servidor nunca devuelve las respuestas de otras personas: solo sus
   cifras agregadas (correctas/incorrectas/en blanco/tiempo) y, del que
   consulta, su resumen. Mientras el estado sea "en_curso" la pantalla se
   refresca sola cada 10 segundos y deja de hacerlo al pasar a finalizado
   o al salir de la pantalla.
   ===================================================================== */

const CG = {codigo: '', datos: null, timer: null, cargando: false, fallos: 0};

const CG_CORONA =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"' +
  ' fill="currentColor"><path d="M3 7.5l4.2 4L12 4.6l4.8 6.9L21 7.5l-1.7 11H4.7L3 7.5z"/></svg>';

const cgInicial = n => (String(n || '?').trim().charAt(0) || '?').toUpperCase();

function cgDetener() {
  if (CG.timer) { clearInterval(CG.timer); CG.timer = null; }
}

/* Programa la consulta periódica (solo si sigue "en_curso"). */
function cgProgramar(activar) {
  cgDetener();
  if (activar) CG.timer = setInterval(() => cgPedir(true), 10000);
}

/* Abre la pantalla con el código escrito en el diálogo de grupo. */
function cgAbrir(codigo) {
  const cod = normGroupCode(codigo);
  if (!cod) { toast('Escribe o genera primero el código del grupo.'); return; }
  CG.codigo = cod; CG.datos = null; CG.fallos = 0;
  $('#cgrCarga').hidden = false;
  $('#cgrErr').hidden = true;
  $('#cgrData').hidden = true;
  $('#cgrRev').hidden = true;
  $('#cgrEstado').hidden = true;
  $('#cgrSub').textContent = '';
  const dlg = $('#rGrupoDlg');
  if (dlg && !dlg.open) dlg.showModal();
  cgPedir();
}

async function cgPedir(silencioso) {
  if (CG.cargando || !CG.codigo) return;
  CG.cargando = true;
  try {
    const d = await net('/api/competitivo/' + encodeURIComponent(CG.codigo) + '/resultados',
                        {auth: true, timeout: 12000});
    CG.datos = d; CG.fallos = 0;
    $('#cgrCarga').hidden = true;
    $('#cgrErr').hidden = true;
    $('#cgrData').hidden = false;
    cgPintar(d);
    cgProgramar(d.estado === 'en_curso');
  } catch (err) {
    const fatal = !!err && (err.status === 401 || err.status === 403);
    if (silencioso && CG.datos && !fatal) {
      // Falló una actualización: se reintenta en la siguiente vuelta.
      CG.fallos++;
      if (CG.fallos === 1) toast('No pudimos actualizar los resultados. Reintentamos en unos segundos.');
      cgProgramar(CG.fallos < 4);
      return;
    }
    cgDetener();
    cgFallo(err);
  } finally {
    CG.cargando = false;
  }
}

function cgFallo(err) {
  $('#cgrCarga').hidden = true;
  $('#cgrData').hidden = true;
  $('#cgrEstado').hidden = true;
  const caja = $('#cgrErr');
  caja.hidden = false;
  const s = err && err.status;
  let txt = (err && err.message) || 'No pudimos cargar los resultados del grupo.';
  if (s === 403) txt = 'No participaste en este grupo.';
  else if (s === 401) txt = 'Inicia sesión para ver los resultados de tu grupo.';
  $('#cgrErrTxt').textContent = txt;
  $('#cgrRetry').hidden = (s === 403);
}

/* ---------------------------------------------------------- pintado ----- */

function cgPintar(d) {
  const ex = d.examen || {}, rs = d.resumen || {};

  const chip = $('#cgrEstado');
  chip.hidden = false;
  chip.dataset.estado = d.estado === 'finalizado' ? 'finalizado' : 'en_curso';
  chip.textContent = d.estado === 'finalizado' ? 'Finalizado' : 'En curso';

  $('#cgrSub').textContent = [
    'Examen competitivo',
    (ex.preguntas || 0) + ' preguntas',
    (ex.minutos || 0) + ' min',
    'Código ' + (d.codigo || CG.codigo),
    (ex.participantes || 0) + ' participantes',
  ].join(' · ');

  $('#cgrKpis').innerHTML = cgKpis(rs);
  $('#cgrPodium').innerHTML = cgPodio(d.participantes || []);
  $('#cgrAreas').innerHTML = cgAreas(d.areas || []);
  const frase = cgFrase(d);
  $('#cgrFrase').textContent = frase;
  $('#cgrFrase').hidden = !frase;
  $('#cgrRows').innerHTML = (d.participantes || []).map(cgFila).join('');
  cgAcciones();
}

function cgKpis(rs) {
  const n = rs.total_participantes || 0;
  const conPuesto = rs.posicion != null;
  const puesto = conPuesto ? rs.posicion + '° de ' + n : 'En curso';
  const notaPuesto = conPuesto ? 'Tu lugar en el grupo' : 'Sin posición hasta que termines';

  const dif = rs.diferencia_correctas;
  let difTxt = '—', difCls = '';
  if (dif != null) {
    difTxt = (dif > 0 ? '+' : '') + dif;
    difCls = dif < 0 ? ' cgr-kpi-suave' : (dif === 0 ? ' cgr-kpi-suave' : '');
  }
  const media = rs.promedio_correctas;
  const mediaTxt = media != null
    ? 'correctas sobre ' + media + ' de media'
    : 'Aún no hay promedio del grupo';

  const enCurso = rs.estado === 'en_curso';
  const promTiempo = rs.promedio_tiempo
    ? 'Promedio del grupo: ' + rs.promedio_tiempo
    : 'Sin promedio del grupo todavía';

  return '' +
    '<div class="cgr-kpi cgr-kpi-hi">' +
      '<span class="cgr-kpi-l">Tu puesto</span>' +
      '<span class="cgr-kpi-v">' + esc(puesto) + '</span>' +
      '<span class="cgr-kpi-s">' + esc(notaPuesto) + '</span>' +
    '</div>' +
    '<div class="cgr-kpi">' +
      '<span class="cgr-kpi-l">Correctas</span>' +
      '<span class="cgr-kpi-v">' + esc(rs.correctas + '/' + rs.total) + '</span>' +
      '<span class="cgr-kpi-s">' + esc(rs.porcentaje + ' % de aciertos') + '</span>' +
    '</div>' +
    '<div class="cgr-kpi">' +
      '<span class="cgr-kpi-l">Tu tiempo</span>' +
      '<span class="cgr-kpi-v">' + esc(enCurso ? '—' : rs.tiempo) + '</span>' +
      '<span class="cgr-kpi-s">' + esc(promTiempo) + '</span>' +
    '</div>' +
    '<div class="cgr-kpi' + difCls + '">' +
      '<span class="cgr-kpi-l">Vs. promedio</span>' +
      '<span class="cgr-kpi-v">' + esc(difTxt) + '</span>' +
      '<span class="cgr-kpi-s">' + esc(mediaTxt) + '</span>' +
    '</div>';
}

/* Podio: 2°, 1° y 3°; con menos de tres participantes solo se pinta lo que hay. */
function cgPodio(ps) {
  const top = ps.filter(p => p.estado === 'finalizado').slice(0, 3);
  if (!top.length) {
    return '<p class="cgr-hint">Nadie ha terminado todavía: el podio aparece cuando cierren el examen.</p>';
  }
  const orden = [1, 0, 2].filter(i => i < top.length);
  return '<div class="cgr-podium cgr-pod-' + top.length + '">' +
    orden.map(i => cgPodio1(top[i], i + 1)).join('') + '</div>';
}

function cgPodio1(p, lugar) {
  return '<div class="cgr-p cgr-p' + lugar + (p.es_yo ? ' cgr-tuyo' : '') + '">' +
    '<span class="cgr-crown" aria-hidden="true">' + (lugar === 1 ? CG_CORONA : '') + '</span>' +
    '<span class="cgr-medalwrap">' +
      '<span class="cgr-avatar cgr-avatar-lg" role="img" aria-label="Avatar de ' + esc(p.nombre) + '">' +
        esc(cgInicial(p.nombre)) + '</span>' +
      '<span class="cgr-medal" aria-hidden="true">' + lugar + '</span>' +
    '</span>' +
    '<span class="cgr-pname">' + esc(p.nombre) +
      (p.es_yo ? ' <span class="cgr-tu">Tú</span>' : '') + '</span>' +
    '<span class="cgr-pstat">' + esc(p.correctas + '/' + p.total + ' · ' + p.tiempo) + '</span>' +
    '<span class="cgr-pillar" aria-hidden="true"></span>' +
  '</div>';
}

function cgAreas(filas) {
  if (!filas.length) return '<p class="cgr-hint">Este grupo todavía no tiene datos por área.</p>';
  return filas.map(a => {
    const tot = a.total || 0, ok = a.correctas || 0;
    const ancho = tot ? Math.max(0, Math.min(100, ok * 100 / tot)) : 0;
    const prom = a.promedio_grupo;
    const marca = (prom != null && tot) ? Math.max(0, Math.min(100, prom * 100 / tot)) : null;
    const color = (typeof areaColor === 'function') ? areaColor(a.area) : 'var(--accent)';
    const der = ok + '/' + tot + (prom != null ? ' · grupo ' + prom : ' · grupo —');
    return '<div class="cgr-area">' +
      '<div class="cgr-area-h"><span class="cgr-area-n">' + esc(a.area) + '</span>' +
      '<span class="cgr-area-v">' + esc(der) + '</span></div>' +
      '<span class="cgr-track" aria-hidden="true">' +
        '<span class="cgr-fill" style="width:' + ancho + '%;--k:' + color + '"></span>' +
        (marca != null ? '<span class="cgr-mark" style="left:' + marca + '%"></span>' : '') +
      '</span>' +
    '</div>';
  }).join('');
}

function cgFrase(d) {
  const mejor = d.mejor_area;
  if (!mejor) return '';
  const deb = (d.areas_debiles || []).filter(x => x && x !== mejor);
  const fila = (d.areas || []).find(a => a.area === mejor);
  let s = 'Tu mejor área fue ' + mejor + (fila ? ' (' + fila.correctas + '/' + fila.total + ')' : '') + '.';
  if (deb.length === 1) s += ' Te conviene reforzar ' + deb[0] + '.';
  else if (deb.length >= 2) s += ' Te conviene reforzar ' + deb[0] + ' y ' + deb[1] + '.';
  return s;
}

function cgFila(p) {
  const curso = p.estado !== 'finalizado';
  const puesto = p.posicion != null ? p.posicion : '—';
  const medalla = (!curso && p.posicion <= 3) ? ' cgr-pos-m' + p.posicion : '';
  const total = p.total || 0;
  const ancho = total ? Math.max(0, Math.min(100, p.correctas * 100 / total)) : 0;
  const okCell = curso
    ? '<span class="cgr-dash" aria-hidden="true">—</span>'
    : '<span class="cgr-barra" aria-hidden="true"><span class="cgr-barra-f" style="width:' +
      ancho + '%;--k:var(--st-ok)"></span></span>' +
      '<span class="cgr-cifra">' + esc(p.correctas + '/' + total) + '</span>';

  return '<tr class="cgr-tr' + (p.es_yo ? ' cgr-tuyo' : '') + '">' +
    '<td class="cgr-td-pos"><span class="cgr-pos' + medalla + '">' + puesto + '</span></td>' +
    '<td class="cgr-td-who"><span class="cgr-who">' +
      '<span class="cgr-avatar cgr-avatar-sm" role="img" aria-label="Avatar de ' + esc(p.nombre) + '">' +
        esc(cgInicial(p.nombre)) + '</span>' +
      '<span class="cgr-nombre">' + esc(p.nombre) + '</span>' +
      (p.es_yo ? '<span class="cgr-tu">Tú</span>' : '') +
      (curso ? '<span class="cgr-curso">En curso</span>' : '') +
    '</span></td>' +
    '<td class="cgr-td-ok">' + okCell + '</td>' +
    '<td class="cgr-td-b">' + (curso ? '—' : esc(p.incorrectas)) + '</td>' +
    '<td class="cgr-td-b">' + (curso ? '—' : esc(p.en_blanco)) + '</td>' +
    '<td class="cgr-td-time">' + (curso ? '—' : esc(p.tiempo)) + '</td>' +
  '</tr>';
}

/* --------------------------------------------------------- acciones ----- */

function cgAcciones() {
  const revisable = !!LAST && LAST.grupo === CG.codigo && LAST.total > 0;
  $('#cgrReview').title = revisable
    ? 'Ver tus respuestas y las claves correctas'
    : 'Se habilita cuando termines el examen de este grupo en este dispositivo';
}

async function cgRevisar() {
  const revisable = !!LAST && LAST.grupo === CG.codigo && LAST.total > 0;
  if (!revisable) {
    toast(LAST
      ? 'La revisión disponible es de otro examen. Rinde este grupo en este dispositivo para verlo.'
      : 'No hay revisión de este grupo en este dispositivo. Rinde el examen primero.');
    return;
  }
  cgDetener();
  $('#rGrupoDlg').close();
  renderResults();
  showResultsView();
}

async function cgRevancha() {
  const btn = $('#cgrRevancha');
  if (btn.disabled) return;
  const texto = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Creando revancha…';
  try {
    const r = await net('/api/competitivo/' + encodeURIComponent(CG.codigo) + '/revancha',
                        {method: 'POST', auth: true});
    cgPintarRevancha(r);
    toast('Revancha creada con el código ' + r.codigo + '. Compártelo con tu grupo.');
  } catch (err) {
    toast(err.status === 403 ? 'No participaste en este grupo.'
                              : (err.message || 'No pudimos crear la revancha.'));
  } finally {
    btn.disabled = false;
    btn.textContent = texto;
  }
}

function cgPintarRevancha(r) {
  const caja = $('#cgrRev');
  caja.hidden = false;
  caja.innerHTML =
    '<div class="cgr-rev-t">Revancha lista</div>' +
    '<p class="cgr-rev-p">Misma configuración y preguntas nuevas. Comparte el código con tu grupo:</p>' +
    '<p class="cgr-rev-codigo">' + esc(r.codigo) + '</p>' +
    '<p class="cgr-rev-link" id="cgrRevLink">' + esc(r.enlace || '') + '</p>' +
    '<div class="cgr-rev-acc">' +
      '<button class="btn line" type="button" id="cgrCopyCod">Copiar código</button>' +
      '<button class="btn line" type="button" id="cgrCopyLink">Copiar enlace</button>' +
    '</div>';
  $('#cgrCopyCod').onclick = () => cgCopiar(r.codigo, 'Código ' + r.codigo + ' copiado.');
  $('#cgrCopyLink').onclick = () => cgCopiar(r.enlace, 'Enlace copiado.');
  caja.scrollIntoView({block: 'nearest'});
}

async function cgCompartir() {
  const rs = CG.datos && CG.datos.resumen;
  if (!rs) { toast('Todavía no hay resultados para compartir.'); return; }
  const puesto = rs.posicion != null
    ? rs.posicion + '° de ' + rs.total_participantes
    : 'el grupo de Simulacros PE';
  const txt = 'Quedé ' + puesto + ' en Simulacros PE con ' + rs.correctas + '/' + rs.total;
  if (navigator.share) {
    try {
      await navigator.share({title: 'Resultados del grupo', text: txt});
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // el usuario canceló
    }
  }
  await cgCopiar(txt, 'Resultado copiado: "' + txt + '"');
}

async function cgCopiar(txt, ok) {
  try {
    await navigator.clipboard.writeText(txt);
    toast(ok);
  } catch {
    toast('No pudimos copiarlo. Selecciónalo y cópialo a mano.');
  }
}

/* ------------------------------------------------------------- enlaces -- */

const bRes = $('#groupRes');
if (bRes) bRes.onclick = () => cgAbrir($('#groupCode').value);

$('#cgrRetry').onclick = () => {
  $('#cgrErr').hidden = true;
  $('#cgrCarga').hidden = false;
  CG.fallos = 0;
  cgPedir();
};
$('#cgrReview').onclick = cgRevisar;
$('#cgrRevancha').onclick = cgRevancha;
$('#cgrShare').onclick = cgCompartir;
$('#cgrHome').onclick = () => {
  cgDetener();
  $('#rGrupoDlg').close();
  showHome();
};
/* Al salir de la pantalla (botón o Esc) se apaga la consulta periódica. */
$('#rGrupoDlg').addEventListener('close', cgDetener);
