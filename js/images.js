/* ---------- Imágenes de las preguntas ---------- */
const IMG_MAX = 2 * 1024 * 1024; // 2 MB
const IMG = {};                  // imagen actual de cada campo del formulario: {url, alt} o null

function figHTML(im, fallbackAlt){
  if(!im || !im.url) return '';
  return `<figure class="q-fig"><button class="fig-btn" type="button" aria-label="Ampliar imagen"><img src="${esc(im.url)}" alt="${esc(im.alt || fallbackAlt)}"></button></figure>`;
}

function fileToImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen no válida')); };
    img.src = url;
  });
}

// PROTOTIPO: reduce la imagen y la guarda como texto (data URL) dentro de la página.
// EN PRODUCCIÓN envía el archivo a tu API y guarda solo la URL que devuelve:
//   const fd = new FormData(); fd.append('file', file);
//   const r = await fetch('/api/admin/uploads', {method:'POST', body:fd, credentials:'include'});
//   return (await r.json()).url;
async function uploadImage(file){
  const img = await fileToImage(file);
  const scale = Math.min(1, 1200 / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d'), png = file.type === 'image/png';
  if(!png){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
}

function imgFieldHTML(p, label, hint){
  return `<div class="lbl">${label} <span class="muted">(opcional${hint ? ': ' + hint : ''})</span></div>
    <div class="imgup">
      <div class="imgup-row">
        <label class="btn line sm imgup-pick" for="${p}File">${ICON.image}<span>Subir imagen</span></label>
        <input class="sr" type="file" id="${p}File" accept="image/png,image/jpeg,image/webp">
        <span class="hint">PNG, JPG o WEBP. Máximo 2 MB.</span>
      </div>
      <div class="imgup-prev" id="${p}Prev" hidden>
        <img id="${p}Img" alt="Vista previa de la imagen">
        <div class="imgup-side">
          <input class="input" id="${p}Alt" maxlength="250" placeholder="Describe la imagen para lectores de pantalla" aria-label="Descripción de la imagen">
          <button class="link-btn danger" type="button" id="${p}Remove">Quitar imagen</button>
        </div>
      </div>
      <p class="err-msg" id="${p}Err"></p>
    </div>`;
}

function setImage(p, value){
  IMG[p] = value;
  $('#' + p + 'Prev').hidden = !value;
  if(value){ $('#' + p + 'Img').src = value.url; $('#' + p + 'Alt').value = value.alt || ''; }
  $('#' + p + 'Err').textContent = '';
  if(typeof afterImageChange === 'function') afterImageChange(p);
}

function bindImageField(p, label, hint){
  $('#' + p + 'Field').innerHTML = imgFieldHTML(p, label, hint);
  const input = $('#' + p + 'File'), fail = m => { $('#' + p + 'Err').textContent = m; };
  input.addEventListener('change', async () => {
    const file = input.files[0]; if(!file) return;
    input.value = '';
    if(!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return fail('Usa una imagen PNG, JPG o WEBP.');
    if(file.size > IMG_MAX) return fail('La imagen pesa más de 2 MB. Reduce su tamaño e inténtalo de nuevo.');
    try { setImage(p, {url: await uploadImage(file), alt: ''}); }
    catch { fail('No pudimos leer esa imagen. Prueba con otro archivo.'); }
  });
  $('#' + p + 'Remove').onclick = () => setImage(p, null);
  $('#' + p + 'Alt').addEventListener('input', e => { if(IMG[p]) IMG[p].alt = e.target.value; });
  IMG[p] = null;
}

