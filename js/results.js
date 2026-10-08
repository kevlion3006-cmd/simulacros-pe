/* =====================================================================
   RESULTADOS
   ===================================================================== */
let LAST = null, solFilter = 'all', solDif = 'all';

function showResultsView() { setView('results'); markTab('res'); pushPath('/resultado'); }

function statRow(label, a) {
  const eff = Math.round(a.ok / a.total * 100), rec = recFor(eff);
  return `<tr>
    <th scope="row">${label}</th>
    <td class="num">${a.ok}</td><td class="num">${a.bad}</td><td class="num">${a.blank}</td>
    <td><div class="eff"><span class="num">${eff}%</span><span class="meter" aria-hidden="true"><i style="width:${eff}%"></i></span></div></td>
    <td><span class="rec ${rec[0]}">${rec[1]}</span></td>
  </tr>`;
}

function renderResults() {
  const L = LAST;
  $('#resExam').textContent = L.exam.title;
  $('#resPracticeTag').hidden = !L.practice;
  $('#resScore').textContent = L.score.toFixed(2);
  $('#resMax').textContent = 'sobre ' + Number(L.max.toFixed(2));
  $('#resOk').textContent = L.ok; $('#resBad').textContent = L.bad; $('#resBlank').textContent = L.blank;
  $('#icOk').innerHTML = ICON.ok; $('#icBad').innerHTML = ICON.bad; $('#icBlank').innerHTML = ICON.blank;
  $('#resPct').textContent = L.pct + '%';
  $('#resTime').textContent = fmtDur(L.used);
  $('#resPerQ').textContent = L.total ? fmtDur(Math.round(L.used / L.total)) : '-';

  $('#trialCta').hidden = !L.trial;
  $('#backCatalog').hidden = L.trial; $('#retry').hidden = L.trial; $('#shareBtn').hidden = false;
  $('#retryWrong').hidden = L.trial || (L.bad + L.blank === 0);

  $('#areaRows').innerHTML = Object.entries(L.areas).map(([name, a]) => statRow(esc(name), a)).join('');
  $('#difRows').innerHTML = DIFS.filter(([k]) => L.difs[k]).map(([k]) => statRow(difBadge(k), L.difs[k])).join('');
  const cursos = Object.entries(L.cursos || {});
  $('#cursoSection').hidden = !cursos.length;
  $('#cursoRows').innerHTML = cursos.map(([name, a]) => statRow(esc(name), a)).join('');
  const temas = Object.entries(L.temas || {});
  $('#temaSection').hidden = !temas.length;
  $('#temaRows').innerHTML = temas.map(([name, a]) => statRow(esc(name), a)).join('');

  const cs = k => L.items.filter(it => it.st === k).length, cd = k => L.items.filter(it => it.q.dif === k).length;
  $('#solFilters').innerHTML = [['all', 'Todas', L.total], ['bad', 'Incorrectas', cs('bad')], ['blank', 'En blanco', cs('blank')], ['ok', 'Correctas', cs('ok')]]
    .map(([k, label, n]) => `<button class="chip-btn sf" type="button" data-sf="${k}" aria-pressed="${k === solFilter}">${label}<span class="cnt">${n}</span></button>`).join('');
  $('#solDifs').innerHTML = [['all', 'Toda dificultad', L.total], ...DIFS.filter(([k]) => cd(k)).map(([k, l]) => [k, l, cd(k)])]
    .map(([k, label, n]) => `<button class="chip-btn sd" type="button" data-sd="${k}" aria-pressed="${k === solDif}">${label}<span class="cnt">${n}</span></button>`).join('');
  renderSolutions();
}

function renderSolutions() {
  const items = LAST.items.filter(it => (solFilter === 'all' || it.st === solFilter) && (solDif === 'all' || it.q.dif === solDif));
  $('#solutions').innerHTML = items.length ? items.map(it => {
    const yours = it.ans == null ? 'Ninguna' : `${'ABCD'[it.ans]}) ${rich(it.q.o[it.ans])}`;
    const right = `${'ABCD'[it.q.c]}) ${rich(it.q.o[it.q.c])}`;
    return `<article class="sol ${it.st}">
      <header class="sol-head">
        <div class="sol-id"><strong>Pregunta ${it.n}</strong><span class="tag">${esc(it.q.area)}</span>${it.q.curso ? `<span class="tag">${esc(it.q.curso)}</span>` : ''}${it.q.tema ? `<span class="tag tag-tema">${esc(it.q.tema)}</span>` : ''}${difBadge(it.q.dif)}</div>
        <span class="badge ${it.st}">${ICON[it.st]}${LABEL[it.st]}</span>
      </header>
      <p class="sol-q">${rich(it.q.q)}</p>
      ${figHTML(it.q.img, 'Imagen del problema')}
      <p class="sol-ans"><span>Tu respuesta:<b>${yours}</b></span><span>Correcta:<b>${right}</b></span></p>
      <p class="sol-why"><strong>Sustento:</strong> ${rich(it.q.why)}</p>
      ${figHTML(it.q.whyImg, 'Imagen del sustento')}
    </article>`;
  }).join('') : '<div class="empty">No hay preguntas con esos filtros.</div>';
}

// Repasar solo lo que falló o quedó en blanco, en modo práctica
function retryWrong() {
  const ids = LAST.items.filter(it => it.st !== 'ok').map(it => it.q.id);
  if (!ids.length) return;
  startExam({id:'custom', uni:'Repaso', title:'Repaso: ' + LAST.exam.title, full:'', mins:builderMins(ids.length), ids}, {practice:true});
}

/* ---------- Reportar un error ---------- */
let reportQid = null;
function openReport(qid) {
  reportQid = qid;
  $('#rReason').value = 'Respuesta incorrecta'; $('#rNote').value = '';
  $('#rDlg').showModal();
}
$('#rForm').addEventListener('submit', async e => {
  e.preventDefault();
  const motivo = $('#rReason').value, nota = $('#rNote').value.trim();
  const q = Q(reportQid);
  // Con servidor: guarda el reporte en la BD (aparece en el panel del admin)
  if (typeof API !== 'undefined' && API.online && q && q.dbId != null) {
    try {
      const resp = await apiReportar({pregunta_id: q.dbId, motivo, nota});
      const idNuevo = resp && resp.id != null ? String(resp.id) : uid();
      DB.reports.unshift({id:idNuevo, qid:reportQid, userId:meId, reason:motivo, note:nota, ts:new Date(), status:'open'});
    } catch (err) {
      if (!err.red) { toast(err.message); return; }   // el servidor lo rechazó
      DB.reports.unshift({id:uid(), qid:reportQid, userId:meId, reason:motivo, note:nota, ts:new Date(), status:'open'});  // sin conexión
    }
  } else {
    DB.reports.unshift({id:uid(), qid:reportQid, userId:meId, reason:motivo, note:nota, ts:new Date(), status:'open'});
  }
  track('question_reported');
  $('#rDlg').close();
  toast('Gracias. Revisaremos esa pregunta.');
});

/* ---------- Compartir el resultado ---------- */
function shareText() {
  const L = LAST;
  return `Saqué ${L.score.toFixed(2)} de ${Number(L.max.toFixed(2))} (${L.pct} % de aciertos) en ${L.exam.title} en Simulacros PE. ¡Practica tú también! ${location.origin}`;
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      n++; if (n === maxLines) { ctx.fillText(line + '...', x, y); return y + lineH; }
      ctx.fillText(line, x, y); y += lineH; line = w;
    } else line = test;
  }
  ctx.fillText(line, x, y); return y + lineH;
}

function drawShareCard() {
  const L = LAST, c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
  const x = c.getContext('2d'), sans = 'Sora, system-ui, -apple-system, "Segoe UI", sans-serif', mono = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  x.fillStyle = '#12305F'; x.fillRect(0, 0, 1080, 1080);
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(800, -60); x.lineTo(1300, 800); x.lineTo(300, 800); x.closePath(); x.fill();
  x.beginPath(); x.arc(120, 1120, 260, 0, Math.PI * 2); x.fill();
  x.textBaseline = 'alphabetic';
  x.font = `800 58px ${sans}`; x.fillStyle = '#FFFFFF'; const w1 = x.measureText('Simulacros ').width;
  x.fillText('Simulacros ', 80, 140); x.fillStyle = '#E8452C'; x.fillText('PE', 80 + w1, 140);
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = `600 44px ${sans}`;
  wrapText(x, L.exam.title, 80, 260, 920, 58, 2);
  x.fillStyle = '#FFFFFF'; x.font = `700 230px ${mono}`; x.fillText(L.score.toFixed(2), 70, 560);
  x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = `500 42px ${sans}`; x.fillText('sobre ' + Number(L.max.toFixed(2)) + '  ·  ' + L.pct + ' % de aciertos', 80, 630);
  const cols = [['Correctas', L.ok, '#FFFFFF'], ['Incorrectas', L.bad, '#FF8F7A'], ['En blanco', L.blank, 'rgba(255,255,255,0.7)']];
  cols.forEach(([label, val, color], i) => {
    const cx = 80 + i * 320;
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); (x.roundRect ? x.roundRect(cx, 700, 290, 190, 24) : x.rect(cx, 700, 290, 190)); x.fill();
    x.fillStyle = color; x.font = `700 92px ${mono}`; x.fillText(String(val), cx + 30, 810);
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = `500 32px ${sans}`; x.fillText(label, cx + 30, 862);
  });
  x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = `500 34px ${sans}`;
  x.fillText('Practica para tu examen de admisión', 80, 990);
  x.fillStyle = '#FFFFFF'; x.font = `700 34px ${sans}`; x.fillText(location.host || 'Simulacros PE', 80, 1035);
  return c;
}

let shareCanvas = null;
function openShare() {
  shareCanvas = drawShareCard();
  $('#sImg').src = shareCanvas.toDataURL('image/png');
  $('#sWa').href = 'https://wa.me/?text=' + encodeURIComponent(shareText());
  $('#sNative').hidden = !navigator.share;
  track('result_shared');
  $('#sDlg').showModal();
}
async function shareNative() {
  const blob = await new Promise(r => shareCanvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'mi-resultado.png', {type:'image/png'});
  try {
    if (navigator.canShare && navigator.canShare({files:[file]})) await navigator.share({files:[file], text:shareText()});
    else await navigator.share({text:shareText()});
  } catch { /* la persona canceló */ }
}
function downloadCard() {
  const a = document.createElement('a'); a.href = shareCanvas.toDataURL('image/png'); a.download = 'mi-resultado-simulacros-pe.png';
  document.body.appendChild(a); a.click(); a.remove();
}
