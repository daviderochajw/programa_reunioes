import { supabase } from './supabase.js';
import { FIELDS } from './config.js';
import { esc, toast, openDialog, iso, addDays, mondayOf, fmtWeek, fmtDay, fmtDatePT, parseISO, downloadBlob } from './ui.js';
import { mondayISO, addDaysISO, parseDate } from './importer.js';
import { waPhone } from './names.js';
import { buildICS } from './ics.js';
import { progInfo, progExtras, progHtml } from './prog.js';

const fmtVal = (f, v) => {
  const s = String(v ?? '');
  if (f.type === 'tel') { const w = waPhone(s); return `<a href="tel:${esc(s.replace(/[^\d+]/g, ''))}">${esc(s)}</a>${w ? ` · <a href="https://wa.me/${w}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`; }
  if (f.type === 'email') return `<a href="mailto:${esc(s)}">${esc(s)}</a>`;
  if (f.type === 'date') return esc(fmtDatePT(s));
  return esc(s);
};

export async function renderMenu(root, menu, ctx, opts = {}) {
  const cfg = FIELDS[menu.key], admin = ctx.admin;
  if (!cfg) { root.innerHTML = '<p class="msg">Menu sem formulário definido (src/config.js).</p>'; return; }
  const weekly = menu.kind === 'weekly', sheet = menu.kind === 'sheet';
  let week = opts.week ? parseISO(opts.week) : mondayOf(new Date()), q = opts.q || '', items = [], showPast = false;

  root.innerHTML = `<div class="bar" id="bar"></div>${menu.key === 'prog' ? '<div class="bar" id="bar2"></div>' : ''}<div id="info"></div><div id="list"></div>`;
  const bar = root.querySelector('#bar'), list = root.querySelector('#list'), info = root.querySelector('#info');
  bar.innerHTML = `
    ${weekly
      ? `<button class="btn" data-a="prev" aria-label="Semana anterior">‹</button><strong id="wl"></strong>
         <button class="btn" data-a="next" aria-label="Semana seguinte">›</button><button class="btn" data-a="today">Hoje</button>`
      : `<input class="search" id="q" type="search" placeholder="Pesquisar" aria-label="Pesquisar" value="${esc(q)}">`}
    ${cfg.upcoming ? '<button class="btn" data-a="past">Mostrar passados</button><button class="btn" data-a="ics">Calendário (.ics)</button>' : ''}
    ${admin ? `<span class="sp"></span>${weekly ? '<button class="btn" data-a="copy">Copiar da semana anterior</button><button class="btn danger" data-a="wipe">Apagar semana</button>' : ''}
      ${sheet ? '' : '<button class="btn primary" data-a="add">+ Adicionar</button>'}` : ''}`;

  bar.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'prev') { week = addDays(week, -7); load(); }
    else if (a === 'next') { week = addDays(week, 7); load(); }
    else if (a === 'today') { week = mondayOf(new Date()); load(); }
    else if (a === 'add') openForm(null);
    else if (a === 'copy') copyPrev();
    else if (a === 'wipe') wipeWeek();
    else if (a === 'past') { showPast = !showPast; e.target.textContent = showPast ? 'Ocultar passados' : 'Mostrar passados'; draw(); }
    else if (a === 'ics') eventsIcs();
  };
  const qi = bar.querySelector('#q');
  if (qi) qi.oninput = () => { q = qi.value; draw(); };
  if (menu.key === 'prog') progExtras(root.querySelector('#bar2'), { ctx, menu, getWeek: () => week, getItems: () => items, reload: () => load() });

  list.onclick = async e => {
    const ed = e.target.closest('[data-e]')?.dataset.e, dl = e.target.closest('[data-d]')?.dataset.d;
    if (ed) openForm(items.find(i => i.id === ed));
    if (dl && confirm('Apagar este registo?')) {
      const { error } = await supabase.from('items').delete().eq('id', dl);
      if (error) toast(error.message); else load();
    }
  };

  async function load() {
    if (weekly) bar.querySelector('#wl').textContent = fmtWeek(week);
    list.innerHTML = '<p class="muted">A carregar…</p>';
    let qy = supabase.from('items').select('*').eq('menu_key', menu.key).order('position').order('created_at').limit(5000);
    if (weekly) qy = qy.eq('week_start', iso(week));
    const { data, error } = await qy;
    if (error) { list.innerHTML = `<p class="msg">${esc(error.message)}</p>`; return; }
    items = data; draw();
  }

  const days = d => Math.round((parseISO(d) - parseISO(iso(new Date()))) / 864e5);
  const card = it => {
    const d = it.data || {};
    if (sheet) {
      const rows = d.linhas || [];
      return `<details class="item"><summary><b>${esc(d.titulo)}</b> <small class="muted">${rows.length} linhas</small></summary>
        ${admin ? `<div class="ia"><button class="btn sm danger" data-d="${it.id}">Apagar folha</button></div>` : ''}
        <div class="tw"><table>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div></details>`;
    }
    const rest = cfg.fields.filter(f => f.key !== cfg.title && f.key !== cfg.group && d[f.key]);
    const acts = admin ? `<span class="ia"><button class="btn sm" data-e="${it.id}">Editar</button><button class="btn sm danger" data-d="${it.id}">Apagar</button></span>` : '';
    const dl = rest.length ? `<dl>${rest.map(f => `<dt>${esc(f.label)}</dt><dd>${fmtVal(f, d[f.key])}</dd>`).join('')}</dl>` : '';
    if (cfg.compact) {
      const hint = rest[0] ? String(d[rest[0].key]).split('\n')[0] : '';
      return `<details class="item ct"><summary><b>${esc(d[cfg.title] || '(sem título)')}</b> <small class="muted">${esc(fmtDatePT(hint))}</small></summary>${acts ? `<div style="margin-top:8px">${acts}</div>` : ''}${dl}</details>`;
    }
    let chip = '';
    if (cfg.upcoming && d.data) { const n = days(d.fim && d.fim >= d.data && days(d.data) < 0 ? d.fim : d.data); chip = `<span class="badge">${n < 0 ? 'passado' : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'faltam ' + n + ' dias'}</span>`; }
    return `<article class="item"><div class="ih"><h3>${esc(d[cfg.title] || '(sem título)')} ${chip}</h3>${acts}</div>${dl}</article>`;
  };

  // Saídas e testemunho: blocos por dia
  const byDate = shown => {
    const days = [...new Set(shown.map(i => i.data?.data || ''))].sort(), color = menu.key === 'saidas' ? 'c1' : 'c3';
    return days.map(dt => { const its = shown.filter(i => (i.data?.data || '') === dt);
      return `<section class="mv" style="--h:var(--${color})"><h4><span>${dt ? esc(fmtDay(dt)) : 'Sem data'}</span><span class="lb">${its.length}</span></h4>${its.map(i => { const d = i.data;
        const sub = menu.key === 'saidas' ? [d.dirigente && 'Dirigente: ' + d.dirigente, d.grupos && 'Grupos: ' + d.grupos, d.fonte].filter(Boolean).join(' · ') : d.publicador || '';
        return `<div class="mr"><time>${esc(d.hora || '—')}</time><span class="nm">${esc(d.local)}${sub ? `<br><small class="muted">${esc(sub)}</small>` : ''}</span>${admin ? `<span class="ia"><button class="btn sm" data-e="${i.id}" aria-label="Editar" title="Editar">✎</button><button class="btn sm danger" data-d="${i.id}" aria-label="Apagar" title="Apagar">✕</button></span>` : ''}</div>`; }).join('')}</section>`; }).join('');
  };

  function draw() {
    info.innerHTML = menu.key === 'prog' ? progInfo(items) : '';
    let shown = items;
    if (!weekly) {
      const n = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      if (q.trim()) shown = shown.filter(i => n(Object.values(i.data || {}).flat(2).join(' ')).includes(n(q.trim())));
      if (cfg.upcoming && !showPast) { const t = iso(new Date()); shown = shown.filter(i => (i.data?.fim || i.data?.data || '') >= t); }
      if (cfg.sortBy) shown = [...shown].sort((a, b) => String(a.data?.[cfg.sortBy] || '').localeCompare(String(b.data?.[cfg.sortBy] || '')));
      else if (!cfg.group && !sheet) shown = [...shown].sort((a, b) => String(a.data?.[cfg.title] || '').localeCompare(String(b.data?.[cfg.title] || ''), 'pt'));
    }
    if (shown.length && menu.key === 'prog') { list.innerHTML = progHtml(shown, admin, week, ctx.settings.meetings); return; }
    if (shown.length && (menu.key === 'saidas' || menu.key === 'testemunho')) { list.innerHTML = byDate(shown); return; }
    if (!shown.length) {
      list.innerHTML = `<p class="muted">${weekly ? 'Ainda não há dados para esta semana.' : 'Sem registos.'}${admin && !sheet ? ' Use «+ Adicionar» ou o menu «⋯ > Importar Excel».' : ''}</p>`; return;
    }
    if (cfg.group) {
      const gf = cfg.fields.find(f => f.key === cfg.group), order = gf.options || [];
      const seen = [...new Set(shown.map(i => i.data?.[cfg.group] || ''))];
      const groups = gf.options ? [...order, ...seen.filter(g => g && !order.includes(g))] : seen;
      list.innerHTML = groups.map(g => {
        const its = shown.filter(i => (i.data?.[cfg.group] || (gf.options ? order[0] : '')) === g);
        return its.length ? `${g ? `<h2 class="grp">${esc(g)}</h2>` : ''}${its.map(card).join('')}` : '';
      }).join('');
    } else list.innerHTML = shown.map(card).join('');
  }

  function openForm(item) {
    const d = item?.data || {};
    const field = f => {
      let v = d[f.key] ?? '';
      if (!item && f.key === cfg.dateField) v = iso(week);
      const ctl = f.type === 'select'
        ? `<select name="${f.key}">${f.options.map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')}</select>`
        : f.type === 'textarea' ? `<textarea name="${f.key}" rows="3">${esc(v)}</textarea>`
        : `<input name="${f.key}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''}>`;
      return `<label>${esc(f.label)}${ctl}</label>`;
    };
    const dlg = openDialog(`<form method="dialog" id="df"><h2>${item ? 'Editar' : 'Adicionar'} · ${esc(menu.label)}</h2>
      ${cfg.fields.map(field).join('')}
      <label>Ordem<input name="_pos" type="number" value="${item ? item.position : (items.length + 1) * 10}"></label>
      <div class="actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" id="cx">Cancelar</button></div></form>`);
    dlg.querySelector('#cx').onclick = () => dlg.close();
    dlg.querySelector('#df').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target), data = {};
      cfg.fields.forEach(f => { data[f.key] = String(fd.get(f.key) ?? '').trim(); });
      const row = { menu_key: menu.key, data, position: Number(fd.get('_pos')) || 0 };
      if (weekly) {
        if (cfg.dateField) { const dd = parseDate(data[cfg.dateField]); if (!dd) return toast('Data inválida.'); row.week_start = mondayISO(dd); }
        else row.week_start = iso(week);
      }
      const { error } = item
        ? await supabase.from('items').update({ ...row, updated_at: new Date().toISOString() }).eq('id', item.id)
        : await supabase.from('items').insert(row);
      if (error) return toast(error.message);
      dlg.close(); toast('Guardado.'); load();
    };
  }

  async function copyPrev() {
    const { data, error } = await supabase.from('items').select('data,position')
      .eq('menu_key', menu.key).eq('week_start', iso(addDays(week, -7)));
    if (error) return toast(error.message);
    if (!data.length) return toast('A semana anterior está vazia.');
    if (items.length && !confirm('Esta semana já tem dados. Acrescentar também uma cópia da semana anterior?')) return;
    const rows = data.map(r => {
      const nd = { ...r.data };
      if (cfg.dateField && nd[cfg.dateField]) nd[cfg.dateField] = addDaysISO(nd[cfg.dateField], 7);
      return { menu_key: menu.key, week_start: iso(week), position: r.position, data: nd };
    });
    const { error: e2 } = await supabase.from('items').insert(rows);
    if (e2) toast(e2.message); else { toast('Copiado. Edite o que mudou.'); load(); }
  }

  async function wipeWeek() {
    if (!items.length) return toast('Esta semana já está vazia.');
    if (!confirm(`Apagar os ${items.length} registos de ${fmtWeek(week)}?`)) return;
    const { error } = await supabase.from('items').delete().eq('menu_key', menu.key).eq('week_start', iso(week));
    if (error) toast(error.message); else { toast('Semana apagada.'); load(); }
  }

  function eventsIcs() {
    const t = iso(new Date()), ev = items.filter(i => i.data?.data && (i.data.fim || i.data.data) >= t).map(i => ({
      uid: i.id, summary: `${i.data.tipo ? i.data.tipo + ': ' : ''}${i.data.nome}`, description: [i.data.local, i.data.notas].filter(Boolean).join(' · '),
      date: i.data.data, endDate: i.data.fim && i.data.fim >= i.data.data ? i.data.fim : i.data.data }));
    if (!ev.length) return toast('Sem eventos futuros.');
    downloadBlob(new Blob([buildICS('Eventos · Braga Central', ev)], { type: 'text/calendar' }), 'eventos-braga-central.ics');
  }

  load();
}
