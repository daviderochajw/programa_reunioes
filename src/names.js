// Funções puras para nomes e telefones (sem DOM, testáveis em Node)
export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "Ana Silva & Rui Costa" -> ["Ana Silva", "Rui Costa"]
export const tokens = t => String(t ?? '').split(/\s*(?:\/|&|,|;|\n)\s*/).map(x => x.trim()).filter(x => x && x !== '0');

// Procura uma pessoa conhecida ({k: nome normalizado, ...}) a partir de um nome escrito no programa.
// Aceita o nome completo, o início do nome, ou primeiro + último nome.
export function matchName(tok, known) {
  const t = norm(tok);
  if (!t || t === '0' || t === 'orador') return null;
  const pick = c => (c.length === 1 ? c[0] : null);
  let c = known.filter(x => x.k === t || x.k.startsWith(t + ' '));
  if (c.length) return pick(c);
  const w = t.split(' '), f = w[0], l = w[w.length - 1];
  c = known.filter(x => {
    const xw = x.k.split(' '), xf = xw[0], xl = xw[xw.length - 1];
    if (w.length === 1) return xf === f;
    return (xf === f || (f.length === 1 && xf[0] === f)) && (xl === l || xl.startsWith(l));
  });
  return pick(c);
}

// Número para o WhatsApp (formato internacional sem +). Números portugueses de 9 dígitos ganham 351.
export function waPhone(raw) {
  const t = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!t) return '';
  if (t.startsWith('+')) return t.slice(1);
  if (t.startsWith('00')) return t.slice(2);
  return /^[23579]\d{8}$/.test(t) ? '351' + t : t;
}
