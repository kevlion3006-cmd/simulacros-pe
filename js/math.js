/* =====================================================================
   FÓRMULAS MATEMÁTICAS
   Escribe las fórmulas entre signos de dólar, con sintaxis tipo LaTeX:
     $x^2 + 3x - 5 = 0$    $\frac{a}{b}$    $\sqrt{x+1}$    $\sqrt[3]{8}$    $v_0 \cdot t$    $30\degree$
   No usa librerías externas: funciona sin internet y sin cargar fuentes ni hojas de estilo.
   Cubre lo que se usa en un examen de admisión (potencias, subíndices, fracciones, raíces, griegas, símbolos).
   Para matrices, integrales con límites o fórmulas muy complejas, cambia esta función por KaTeX.
   ===================================================================== */
const MATH_SYMBOLS = {
  alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', lambda:'λ', mu:'μ',
  nu:'ν', xi:'ξ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ', phi:'φ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω',
  Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Pi:'Π', Sigma:'Σ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
  times:'×', cdot:'·', div:'÷', pm:'±', mp:'∓', leq:'≤', le:'≤', geq:'≥', ge:'≥', neq:'≠', ne:'≠', approx:'≈', equiv:'≡',
  infty:'∞', degree:'°', circ:'°', rightarrow:'→', to:'→', leftarrow:'←', leftrightarrow:'↔', Rightarrow:'⇒', Leftrightarrow:'⇔',
  ldots:'…', dots:'…', cdots:'⋯', sum:'∑', prod:'∏', int:'∫', partial:'∂', nabla:'∇', in:'∈', notin:'∉',
  subset:'⊂', subseteq:'⊆', cup:'∪', cap:'∩', emptyset:'∅', forall:'∀', exists:'∃', angle:'∠', perp:'⊥',
  parallel:'∥', propto:'∝', triangle:'△', therefore:'∴', mid:'|', ell:'ℓ', hbar:'ħ', prime:'′'
};
const MATH_FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'max', 'min', 'exp', 'sen', 'arcsin', 'arccos', 'arctan', 'det', 'mod'];

function mathToHTML(src) {
  let i = 0;
  const peek = () => src[i];

  function skipSpaces() { while (src[i] === ' ') i++; }

  // Un argumento: {grupo} o un solo símbolo
  function arg() {
    skipSpaces();
    if (peek() === '{') { i++; const g = group(); if (peek() === '}') i++; return g; }
    if (i >= src.length) return '';
    return single();
  }
  function rawGroup() { // contenido de {...} sin interpretar (para \text)
    skipSpaces();
    if (peek() !== '{') return peek() ? src[i++] : '';
    i++; let depth = 1, out = '';
    while (i < src.length && depth) {
      const c = src[i++];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) break; }
      out += c;
    }
    return out;
  }
  function group() { let out = ''; while (i < src.length && peek() !== '}') out += atom(); return out; }

  function single() {
    if (peek() === '\\') return command();
    return char(src[i++]);
  }

  function char(c) {
    if (/[A-Za-z]/.test(c)) return `<i>${c}</i>`;
    if (c === '-') return '−';
    if (c === '*') return '·';
    if (c === "'") return '′';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '&') return '&amp;';
    if (c === '"') return '&quot;';
    return c;
  }

  function command() {
    i++; // salta la barra
    const c = src[i];
    if (c === undefined) return '\\';
    if (!/[A-Za-z]/.test(c)) { // comandos de un símbolo: \, \; \% \$ \{ \}
      i++;
      if (c === ',' || c === ';' || c === ':' || c === ' ') return '<span class="sp"></span>';
      if (c === '!') return '';
      if (c === '\\') return '<br>';
      return char(c);
    }
    let name = '';
    while (i < src.length && /[A-Za-z]/.test(src[i])) name += src[i++];
    switch (name) {
      case 'frac': case 'dfrac': { const n = arg(), d = arg(); return `<span class="frac"><span class="num">${n}</span><span class="den">${d}</span></span>`; }
      case 'sqrt': {
        let idx = '';
        skipSpaces();
        if (peek() === '[') { i++; while (i < src.length && peek() !== ']') idx += src[i++]; i++; }
        const body = arg();
        return `<span class="rad">${idx ? `<span class="idx">${escapeHTML(idx)}</span>` : ''}<span class="sq">√</span><span class="rb">${body}</span></span>`;
      }
      case 'text': case 'mathrm': case 'textbf': return `<span class="t">${escapeHTML(rawGroup())}</span>`;
      case 'vec': return `<span class="vec">${arg()}</span>`;
      case 'overline': case 'bar': return `<span class="ovl">${arg()}</span>`;
      case 'left': case 'right': { skipSpaces(); return peek() === '.' ? (i++, '') : (peek() ? single() : ''); }
      case 'quad': return '<span class="sp2"></span>';
      case 'qquad': return '<span class="sp2"></span><span class="sp2"></span>';
      default:
        if (MATH_FUNCS.includes(name)) return `<span class="fn">${name}</span>`;
        if (MATH_SYMBOLS[name]) return MATH_SYMBOLS[name];
        return escapeHTML('\\' + name);
    }
  }

  function atom() {
    let base;
    skipSpaces();
    if (i >= src.length) return '';
    if (peek() === '{') { i++; base = group(); if (peek() === '}') i++; }
    else if (peek() === '}') { i++; return ''; }   // llave sobrante: se ignora
    else base = single();
    // Superíndices y subíndices (pueden venir juntos: x_1^2)
    for (;;) {
      const save = i; skipSpaces();
      const c = peek();
      if (c === '^' || c === '_') { i++; const a = arg(); base += c === '^' ? `<sup>${a}</sup>` : `<sub>${a}</sub>`; }
      else { i = save; break; }
    }
    return base;
  }

  let out = '';
  while (i < src.length) {
    if (peek() === ' ') { i++; out += ' '; continue; }
    out += atom();
  }
  return out;
}

const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Texto con fórmulas → HTML seguro. Todo lo que no está entre $...$ se escapa.
function rich(text) {
  const s = String(text ?? '');
  const plain = t => escapeHTML(t).replace(/\n/g, '<br>');
  let out = '', buf = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue; }   // \$ = un signo de dólar normal
    if (c === '$') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '$' && s[j - 1] !== '\\')) j++;
      if (j < s.length && j > i + 1) {
        out += plain(buf) + `<span class="m">${mathToHTML(s.slice(i + 1, j))}</span>`;
        buf = ''; i = j + 1; continue;
      }
    }
    buf += c; i++;
  }
  return out + plain(buf);
}

// Para lugares donde solo cabe texto simple (títulos, lectores de pantalla): quita los $
const plainMath = t => String(t ?? '').replace(/\\\$/g, '\u0000').replace(/\$/g, '').replace(/\u0000/g, '$');
