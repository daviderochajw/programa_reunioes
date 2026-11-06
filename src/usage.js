import { supabase } from './supabase.js';
import { esc, iso, mondayOf, addDays, fmtDay } from './ui.js';
import { norm, tokens } from './names.js';

// Utilização: quantas designações cada pessoa teve nas últimas semanas (ajuda a repartir melhor)
export async function renderUsage(root) {
  root.innerHTML = '<p class="muted">A carregar…</p>';
  const from = iso(addDays(mondayOf(new Date()), -7 * 25));
  const { data, error } = await supabase.from('items').select('week_start,data').eq('menu_key', 'prog').gte('week_start', from).limit(10000);
  if (error) { root.innerHTML = `<p class="msg">${esc(error.message)}</p>`; return; }
  const by = new Map();
  data.forEach(i => [i.data.responsavel, i.data.ajudante].forEach((v, j) => tokens(v).forEach(t => {
    const k = norm(t), x = by.get(k) || { n: t, main: 0, help: 0, team: 0, last: '' };
    if (i.data.seccao === 'Equipa') x.team++; else if (j) x.help++; else x.main++;
    if (i.week_start > x.last) x.last = i.week_start; by.set(k, x);
  })));
  const rows = [...by.values()].sort((a, b) => b.main + b.help + b.team - (a.main + a.help + a.team) || a.n.localeCompare(b.n, 'pt'));
  root.innerHTML = `<p class="muted">Designações desde ${esc(fmtDay(from))} (≈ 6 meses), a partir do menu Programa.</p>
    <div class="tw"><table><thead><tr><th>Nome</th><th>Partes</th><th>Ajudante</th><th>Equipa</th><th>Total</th><th>Última semana</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(x.n)}</td><td>${x.main}</td><td>${x.help}</td><td>${x.team}</td><td><b>${x.main + x.help + x.team}</b></td><td>${esc(fmtDay(x.last))}</td></tr>`).join('')}</tbody></table></div>`;
}
