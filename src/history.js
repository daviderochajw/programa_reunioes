import { supabase } from './supabase.js';
import { esc } from './ui.js';

const ACT = { insert: 'Adicionou', update: 'Alterou', delete: 'Apagou' };
export async function renderHistory(root, ctx) {
  root.innerHTML = '<p class="muted">A carregar…</p>';
  const { data, error } = await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(200);
  if (error) { root.innerHTML = `<p class="msg">${esc(error.message)} (corra a migração 0002.)</p>`; return; }
  const lab = k => ctx.menus.find(m => m.key === k)?.label || k;
  root.innerHTML = `<p class="muted">Últimas 200 alterações feitas por administradores.</p>` + (data.map(r => `<div class="mr"><time class="muted" style="min-width:11ch">${esc(new Date(r.at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }))}</time>
    <span class="nm"><b>${esc(r.username || '?')}</b> ${ACT[r.action]} ${r.n} registo(s) em ${esc((r.menu_keys || []).map(lab).join(', '))}${r.summary ? ` <small class="muted">· ${esc(r.summary)}${r.n > 1 ? '…' : ''}</small>` : ''}</span></div>`).join('') || '<p class="muted">Ainda sem registos.</p>');
}
