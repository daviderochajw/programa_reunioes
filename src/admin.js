import { supabase } from './supabase.js';
import { DEFAULT_MENUS, PROFILES } from './config.js';
import { esc, toast, openDialog } from './ui.js';
import { norm } from './names.js';

const ST = { pending: 'Pendente', approved: 'Aprovado', blocked: 'Bloqueado' };
const PAGE = 50;

// O Supabase devolve no máximo 1000 linhas por pedido: ler tudo por páginas
async function readAll(table, orderBy) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy).range(from, from + 999);
    if (error) throw error;
    out.push(...data); if (data.length < 1000) break;
  }
  return out;
}

export async function renderUsers(root, me, menus, onChange) {
  root.innerHTML = '<p class="muted">A carregar…</p>';
  let profs, um;
  try { [profs, um] = await Promise.all([readAll('profiles', 'id'), readAll('user_menus', 'user_id')]); }
  catch (e) { root.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }

  const menusOf = new Map();
  um.forEach(r => { if (!menusOf.has(r.user_id)) menusOf.set(r.user_id, new Set()); menusOf.get(r.user_id).add(r.menu_key); });
  const mset = p => (p.status === 'pending' && !menusOf.has(p.id) ? new Set(DEFAULT_MENUS) : menusOf.get(p.id) || new Set());
  const pendingCount = () => profs.filter(p => p.status === 'pending').length;
  let q = '', st = 'all', limit = PAGE;

  root.innerHTML = `<p class="muted">Clique numa pessoa para aprovar o registo e escolher o que pode ver. Só os administradores editam.</p>
    <div class="bar"><input class="search" id="uq" type="search" placeholder="Pesquisar por nome" aria-label="Pesquisar utilizadores">
      <select id="ust" aria-label="Filtrar por estado" style="width:auto"><option value="all">Todos</option><option value="pending">Pendentes</option><option value="approved">Aprovados</option><option value="blocked">Bloqueados</option></select>
      <span class="muted" id="ucount"></span></div>
    <div id="ulist"></div>`;
  const $ = s => root.querySelector(s);
  $('#uq').oninput = e => { q = e.target.value; limit = PAGE; draw(); };
  $('#ust').onchange = e => { st = e.target.value; limit = PAGE; draw(); };

  function draw() {
    const rank = { pending: 0, approved: 1, blocked: 2 }, nq = norm(q);
    const list = profs.filter(p => (st === 'all' || p.status === st) && (!nq || norm(p.full_name + ' ' + p.username).includes(nq)))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.full_name.localeCompare(b.full_name, 'pt'));
    const c = k => profs.filter(p => p.status === k).length;
    $('#ucount').textContent = `${list.length} de ${profs.length} · ${c('pending')} pendentes · ${c('approved')} aprovados · ${c('blocked')} bloqueados`;
    $('#ulist').innerHTML = list.length
      ? `<div class="ulist">${list.slice(0, limit).map(p => `<button class="urow" data-id="${p.id}" type="button">
          <span><b>${esc(p.full_name)}</b> <small class="muted">@${esc(p.username)}${p.id === me.id ? ' · é você' : ''}</small></span>
          <span class="badge st-${p.status}">${ST[p.status]}</span>
          <span class="meta">${p.role === 'admin' ? 'Administrador' : 'Visualização · ' + mset(p).size + ' menu(s)'}</span></button>`).join('')}</div>
        ${list.length > limit ? `<div class="actions"><button class="btn" id="more" type="button">Mostrar mais (${list.length - limit})</button></div>` : ''}`
      : '<p class="muted">Ninguém encontrado.</p>';
  }
  root.onclick = e => {
    if (e.target.closest('#more')) { limit += PAGE; draw(); return; }
    const id = e.target.closest('.urow')?.dataset.id;
    if (id) openUser(profs.find(p => p.id === id));
  };

  function openUser(p) {
    const self = p.id === me.id, has = new Set(mset(p));
    const dlg = openDialog(`<form method="dialog" id="uf">
      <div class="dh"><h2>${esc(p.full_name)} <small class="muted">@${esc(p.username)}</small></h2><button class="btn sm" id="x" type="button">Fechar</button></div>
      ${self ? '<p class="muted">Não pode alterar a sua própria conta.</p>' : ''}
      <div class="row">
        <label>Estado<select name="status" ${self ? 'disabled' : ''}>${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Perfil<select name="role" ${self ? 'disabled' : ''}>
          <option value="viewer" ${p.role === 'viewer' ? 'selected' : ''}>Visualização</option>
          <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Administrador (vê e edita tudo)</option></select></label>
      </div>
      ${self ? '' : `<fieldset id="fm"><legend>Menus que pode ver (só leitura)</legend>
        <div class="actions" style="margin:0 0 6px">${PROFILES.map(x => `<button class="btn sm" type="button" data-pf="${x.id}">Perfil: ${x.label}</button>`).join('')}</div>
        ${menus.map(m => `<label class="chk"><input type="checkbox" name="m" value="${m.key}" ${has.has(m.key) ? 'checked' : ''}> ${esc(m.label)}${m.sensitive ? ' <small class="muted">(dados pessoais)</small>' : ''}</label>`).join('')}</fieldset>
        <div class="actions"><button class="btn primary" type="submit">Guardar</button>
          <button class="btn" type="button" id="pw">Repor palavra-passe</button><button class="btn danger" type="button" id="del">Eliminar</button></div>`}
    </form>`);
    dlg.classList.add('wide');
    const $d = s => dlg.querySelector(s);
    $d('#x').onclick = () => dlg.close();
    if (self) return;
    const sync = () => { $d('#fm').disabled = $d('[name=role]').value === 'admin'; };
    $d('[name=role]').onchange = sync; sync();
    dlg.onclick = ev => {
      const pf = ev.target.closest('[data-pf]')?.dataset.pf; if (!pf) return;
      const set = new Set(PROFILES.find(x => x.id === pf).menus);
      dlg.querySelectorAll('input[name=m]').forEach(i => { i.checked = set.has(i.value); });
    };
    $d('#uf').onsubmit = async ev => {
      ev.preventDefault();
      const status = $d('[name=status]').value, role = $d('[name=role]').value, before = pendingCount();
      const keys = [...dlg.querySelectorAll('input[name=m]:checked')].map(i => i.value);
      const r1 = await supabase.from('profiles').update({ status, role }).eq('id', p.id);
      if (r1.error) return toast(r1.error.message);
      const r2 = await supabase.from('user_menus').delete().eq('user_id', p.id);
      if (r2.error) return toast(r2.error.message);
      if (keys.length) { const r3 = await supabase.from('user_menus').insert(keys.map(k => ({ user_id: p.id, menu_key: k }))); if (r3.error) return toast(r3.error.message); }
      p.status = status; p.role = role; menusOf.set(p.id, new Set(keys));
      dlg.close(); draw(); toast('Guardado.');
      if (pendingCount() !== before) onChange?.();   // atualiza o número de pendentes no separador
    };
    $d('#pw').onclick = async () => {
      const password = prompt('Nova palavra-passe (mínimo 8 caracteres):'); if (!password) return;
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'reset_password', user_id: p.id, password } });
      toast(error || data?.error ? (data?.error || 'Função "admin-users" não publicada ou sem permissão.') : 'Palavra-passe alterada.');
    };
    $d('#del').onclick = async () => {
      if (!confirm(`Eliminar a conta de ${p.full_name} definitivamente?`)) return;
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete_user', user_id: p.id } });
      if (error || data?.error) return toast(data?.error || 'Função "admin-users" não publicada ou sem permissão.');
      profs.splice(profs.indexOf(p), 1); dlg.close(); draw(); toast('Conta eliminada.');
    };
  }
  draw();
}
