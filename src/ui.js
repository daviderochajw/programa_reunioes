export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Datas (sempre em hora local, para não "saltar" um dia)
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const fmtWeek = m => {
  const e = addDays(m, 6), same = m.getMonth() === e.getMonth();
  return `${m.getDate()}${same ? '' : ' de ' + MES[m.getMonth()]} – ${e.getDate()} de ${MES[e.getMonth()]} de ${e.getFullYear()}`;
};

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function openDialog(html) {
  const d = document.createElement('dialog');
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

export const pad2 = n => String(n).padStart(2, '0');
export const fmtDatePT = v => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? ''); };
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const fmtDay = iso => { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d); return `${WD[x.getDay()]} ${d} ${MES[m - 1].slice(0, 3)}`; };
export const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Impressão: mostra só o conteúdo de #print-root
export function printHtml(html) {
  document.getElementById('print-root')?.remove();
  const el = document.createElement('div'); el.id = 'print-root'; el.innerHTML = html; document.body.appendChild(el);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); el.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
}

// Tema e tamanho da letra (guardados neste aparelho)
export function applyPrefs() {
  const t = localStorage.getItem('painel-theme') || 'auto', f = Number(localStorage.getItem('painel-fs')) || 16;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.documentElement.style.fontSize = f + 'px';
}
export const cycleTheme = () => { const o = ['auto', 'light', 'dark'], c = localStorage.getItem('painel-theme') || 'auto'; localStorage.setItem('painel-theme', o[(o.indexOf(c) + 1) % 3]); applyPrefs(); return o[(o.indexOf(c) + 1) % 3]; };
export const cycleFont = () => { const o = [14, 16, 18, 20], c = Number(localStorage.getItem('painel-fs')) || 16; localStorage.setItem('painel-fs', o[(o.indexOf(c) + 1) % 4]); applyPrefs(); };
