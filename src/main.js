import './style.css';
import { supabase, configured } from './supabase.js';
import { renderAuth, renderWaiting } from './auth.js';
import { renderMenu } from './menu.js';
import { renderUsers } from './admin.js';
import { renderHome } from './home.js';
import { renderHistory } from './history.js';
import { renderUsage } from './usage.js';
import { renderSettings } from './settings.js';
import { openSearch } from './search.js';
import { openImport, exportAll } from './importUi.js';
import { saveWorkbook, templateSheets } from './excel.js';
import { DEFAULT_MEETINGS } from './config.js';
import { esc, applyPrefs, cycleTheme, cycleFont, toast } from './ui.js';

const app = document.getElementById('app');
applyPrefs();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});

async function boot(startTab) {
  app.innerHTML = '<p class="muted center">A carregar…</p>';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return renderAuth(app, boot);

  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error || !profile) {
    app.innerHTML = `<section class="card auth"><p class="msg">Não foi possível ler o perfil. ${esc(error?.message || '')}</p><button class="btn" id="out">Sair</button></section>`;
    app.querySelector('#out').onclick = () => supabase.auth.signOut();
    return;
  }
  if (profile.status !== 'approved') return renderWaiting(app, profile, boot);

  const admin = profile.role === 'admin';
  const { data: allRaw } = await supabase.from('menus').select('*').order('sort');
  const all = allRaw || [];
  let menus = all;
  if (!admin) {
    const { data: um } = await supabase.from('user_menus').select('menu_key');
    const ok = new Set((um || []).map(r => r.menu_key));
    menus = all.filter(m => ok.has(m.key));
  }
  const { data: st } = await supabase.from('settings').select('*');   // vazio se a migração 0002 ainda não correu
  const settings = { meetings: { ...DEFAULT_MEETINGS, ...((st || []).find(r => r.key === 'meetings')?.value || {}) } };
  let pending = 0;
  if (admin) pending = (await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count || 0;

  const ctx = { admin, profile, menus, allMenus: all, settings, canView: k => menus.some(m => m.key === k), go: (id, o) => go(id, o) };
  const tabs = [{ id: '_home', label: 'Início' }, ...menus.map(m => ({ id: m.key, label: m.label })),
    ...(admin ? [{ id: '_users', label: 'Utilizadores' + (pending ? ` (${pending})` : '') }, { id: '_usage', label: 'Utilização' }, { id: '_history', label: 'Histórico' }, { id: '_settings', label: 'Definições' }] : [])];

  app.innerHTML = `<div class="wrap">
    <header class="top"><div><h1>Painel da congregação</h1><p class="muted">${esc(profile.full_name)}${admin ? ' · Administrador' : ''}</p></div>
      <div class="actions" style="margin:0"><button class="btn" id="srch" type="button" aria-label="Pesquisar">🔍 Pesquisar</button>
        <details class="more"><summary class="btn" aria-label="Mais opções">⋯</summary><div class="pop">
          <button class="btn" id="th" type="button">Tema: claro / escuro / auto</button><button class="btn" id="fs" type="button">Tamanho da letra</button>
          ${admin ? '<hr><button class="btn" id="imp" type="button">Importar Excel</button><button class="btn" id="exp" type="button">Exportar Excel (cópia de segurança)</button><button class="btn" id="tpl" type="button">Descarregar modelo Excel</button>' : ''}
          <hr><button class="btn" id="out" type="button">Sair</button></div></details></div></header>
    <nav class="nav" id="nav"></nav><main id="view"></main></div>`;
  const $ = s => app.querySelector(s), nav = $('#nav'), view = $('#view');
  $('#out').onclick = () => supabase.auth.signOut();
  $('#srch').onclick = () => openSearch(ctx);
  $('#th').onclick = () => toast('Tema: ' + { auto: 'automático', light: 'claro', dark: 'escuro' }[cycleTheme()]);
  $('#fs').onclick = cycleFont;
  if (admin) {
    $('#imp').onclick = () => { $('.more').open = false; openImport(menus, () => go(localStorage.getItem('painel-last') || '_home')); };
    $('#exp').onclick = () => { $('.more').open = false; exportAll(menus); };
    $('#tpl').onclick = () => { $('.more').open = false; saveWorkbook(templateSheets(), 'modelo-painel-braga-central.xlsx'); };
  }

  function go(id, opts) {
    if (!tabs.some(t => t.id === id)) id = '_home';
    localStorage.setItem('painel-last', id);
    nav.innerHTML = tabs.map(t => `<button data-id="${t.id}" aria-pressed="${t.id === id}">${esc(t.label)}</button>`).join('');
    if (id === '_home') renderHome(view, ctx);
    else if (id === '_users') renderUsers(view, profile, all, () => boot('_users'));
    else if (id === '_usage') renderUsage(view);
    else if (id === '_history') renderHistory(view, ctx);
    else if (id === '_settings') renderSettings(view, ctx);
    else renderMenu(view, menus.find(m => m.key === id), ctx, opts);
  }
  nav.onclick = e => { const b = e.target.closest('[data-id]'); if (b) go(b.dataset.id); };
  go(startTab || localStorage.getItem('painel-last') || '_home');
}

if (!configured) {
  app.innerHTML = '<section class="card auth"><h1>Falta configurar</h1><p>Crie o ficheiro <code>.env</code> com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o README).</p></section>';
} else {
  supabase.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') boot(); });
  boot();
}
