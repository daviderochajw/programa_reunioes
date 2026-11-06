import { supabase } from './supabase.js';
import { DEFAULT_MENUS, PROFILES } from './config.js';
import { esc, toast } from './ui.js';

const ST = { pending: 'Pendente', approved: 'Aprovado', blocked: 'Bloqueado' };

export async function renderUsers(root, me, menus, onChange) {
  root.innerHTML = '<p class="muted">A carregar…</p>';
  const [p, u] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('user_menus').select('*'),
  ]);
  if (p.error || u.error) { root.innerHTML = `<p class="msg">${esc((p.error || u.error).message)}</p>`; return; }
  const rank = { pending: 0, approved: 1, blocked: 2 };
  const profs = p.data.sort((a, b) => rank[a.status] - rank[b.status] || a.full_name.localeCompare(b.full_name, 'pt'));
  const has = (x, k) => x.status === 'pending' ? DEFAULT_MENUS.includes(k) : u.data.some(r => r.user_id === x.id && r.menu_key === k);

  root.innerHTML = `<p class="muted">Aprove os novos registos e escolha os menus que cada pessoa pode ver (só leitura). Só os administradores editam.</p>
  ${profs.map(x => {
    const self = x.id === me.id;
    return `<article class="item" data-uid="${x.id}">
      <div class="ih"><h3>${esc(x.full_name)} <small class="muted">@${esc(x.username)}${self ? ' · é você' : ''}</small></h3>
        <span class="badge st-${x.status}">${ST[x.status]}</span></div>
      <div class="row">
        <label>Estado<select name="status" ${self ? 'disabled' : ''}>${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Perfil<select name="role" ${self ? 'disabled' : ''}>
          <option value="viewer" ${x.role === 'viewer' ? 'selected' : ''}>Visualização</option>
          <option value="admin" ${x.role === 'admin' ? 'selected' : ''}>Administrador (vê e edita tudo)</option></select></label>
      </div>
      ${self ? '' : `<fieldset><legend>Menus que pode ver</legend>
        <div class="actions" style="margin:0 0 6px">${PROFILES.map(p => `<button class="btn sm" type="button" data-pf="${p.id}">Perfil: ${p.label}</button>`).join('')}</div>
        ${menus.map(m => `<label class="chk"><input type="checkbox" name="m" value="${m.key}" ${has(x, m.key) ? 'checked' : ''}> ${esc(m.label)}${m.sensitive ? ' <small class="muted">(dados pessoais)</small>' : ''}</label>`).join('')}</fieldset>
      <div class="ia"><button class="btn primary sm" data-s>Guardar</button>
        <button class="btn sm" data-pw>Repor palavra-passe</button><button class="btn sm danger" data-del>Eliminar</button></div>`}
    </article>`;
  }).join('')}`;

  root.onclick = async e => {
    const card = e.target.closest('[data-uid]'); if (!card) return;
    const uid = card.dataset.uid;
    const pf = e.target.closest('[data-pf]')?.dataset.pf;
    if (pf) { const set = new Set(PROFILES.find(p => p.id === pf).menus); card.querySelectorAll('input[name=m]').forEach(i => { i.checked = set.has(i.value); }); return; }
    if (e.target.closest('[data-s]')) {
      const status = card.querySelector('[name=status]').value, role = card.querySelector('[name=role]').value;
      const r1 = await supabase.from('profiles').update({ status, role }).eq('id', uid);
      if (r1.error) return toast(r1.error.message);
      const r2 = await supabase.from('user_menus').delete().eq('user_id', uid);
      if (r2.error) return toast(r2.error.message);
      const keys = [...card.querySelectorAll('input[name=m]:checked')].map(i => i.value);
      if (keys.length) {
        const r3 = await supabase.from('user_menus').insert(keys.map(k => ({ user_id: uid, menu_key: k })));
        if (r3.error) return toast(r3.error.message);
      }
      toast('Guardado.'); onChange?.();
    } else if (e.target.closest('[data-pw]')) {
      const password = prompt('Nova palavra-passe (mínimo 8 caracteres):');
      if (!password) return;
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'reset_password', user_id: uid, password } });
      toast(error || data?.error ? (data?.error || 'Função "admin-users" não publicada ou sem permissão.') : 'Palavra-passe alterada.');
    } else if (e.target.closest('[data-del]')) {
      if (!confirm('Eliminar esta conta definitivamente?')) return;
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete_user', user_id: uid } });
      if (error || data?.error) return toast(data?.error || 'Função "admin-users" não publicada ou sem permissão.');
      toast('Conta eliminada.'); renderUsers(root, me, menus, onChange);
    }
  };
}
