import { supabase } from './supabase.js';
import { FIELDS } from './config.js';
import { esc, openDialog, fmtDay } from './ui.js';

export function openSearch(ctx) {
  const dlg = openDialog(`<div class="dh"><h2>Pesquisar em tudo</h2><button class="btn sm" id="x" type="button">Fechar</button></div>
    <input id="q" type="search" placeholder="Nome, local, parte… (mín. 2 letras)" autofocus><div id="r" class="muted">Só aparecem os menus a que tem acesso.</div>`);
  dlg.classList.add('wide'); dlg.querySelector('#x').onclick = () => dlg.close();
  const r = dlg.querySelector('#r'); let t, seq = 0, last = [];
  const labelOf = k => ctx.menus.find(m => m.key === k)?.label || k;
  dlg.querySelector('#q').oninput = e => {
    clearTimeout(t); const q = e.target.value.trim();
    if (q.length < 2) { r.innerHTML = ''; return; }
    t = setTimeout(async () => {
      const my = ++seq, { data, error } = await supabase.rpc('search_items', { q });
      if (my !== seq) return;
      if (error) { r.innerHTML = `<p class="msg">${esc(error.message)} (corra a migração 0002.)</p>`; return; }
      last = data; if (!data.length) { r.innerHTML = '<p class="muted">Nada encontrado.</p>'; return; }
      const by = {}; data.forEach((i, n) => (by[i.menu_key] ||= []).push([i, n]));
      r.innerHTML = Object.entries(by).map(([k, l]) => `<h3 class="grp">${esc(labelOf(k))} <small>(${l.length})</small></h3>` + l.map(([i, n]) => {
        const c = FIELDS[k], d = i.data || {}, title = k === 'outras' ? d.titulo : d[c?.title];
        const sub = i.week_start ? fmtDay(i.week_start) : Object.entries(d).filter(([f, v]) => f !== c?.title && v && typeof v === 'string').slice(0, 2).map(([, v]) => v).join(' · ');
        return `<button class="hit" data-n="${n}" type="button"><b>${esc(title || '(sem título)')}</b><br><small class="muted">${esc(sub)}</small></button>`; }).join('')).join('');
    }, 250);
  };
  r.onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; const i = last[+b.dataset.n]; dlg.close(); ctx.go(i.menu_key, { week: i.week_start || undefined }); };
}
