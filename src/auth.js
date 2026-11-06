import { supabase, toEmail, toUsername } from './supabase.js';
import { esc } from './ui.js';

export function renderAuth(root, onDone) {
  let mode = 'login';
  const draw = () => {
    const reg = mode === 'reg';
    root.innerHTML = `
    <section class="card auth">
      <h1>Painel da congregação</h1>
      <p class="muted">Braga Central</p>
      <div class="seg">
        <button type="button" data-m="login" aria-pressed="${!reg}">Entrar</button>
        <button type="button" data-m="reg" aria-pressed="${reg}">Criar conta</button>
      </div>
      <form id="f">
        <label>Nome<input name="nome" autocomplete="username" required placeholder="Ex.: João Silva"></label>
        <label>Palavra-passe<input name="pw" type="password" minlength="8" required autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
        ${reg ? `<label>Repetir palavra-passe<input name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
        <p class="muted small">Depois de criar a conta, o administrador tem de aprovar o seu acesso e escolher o que pode ver.</p>` : ''}
        <button class="btn primary" type="submit">${reg ? 'Criar conta' : 'Entrar'}</button>
        <p class="msg" id="m" hidden></p>
      </form>
    </section>`;
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    root.querySelector('#f').onsubmit = submit;
  };

  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.target), nome = String(f.get('nome')).trim(), pw = String(f.get('pw'));
    const m = root.querySelector('#m'), btn = e.target.querySelector('button[type=submit]');
    const fail = t => { m.textContent = t; m.hidden = false; btn.disabled = false; };
    m.hidden = true;
    if (!toUsername(nome)) return fail('Escreva o nome com letras (sem símbolos).');
    btn.disabled = true;
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(nome), password: pw });
      if (error) return fail('Nome ou palavra-passe incorretos.');
    } else {
      if (pw !== String(f.get('pw2'))) return fail('As palavras-passe não coincidem.');
      const { data, error } = await supabase.auth.signUp({
        email: toEmail(nome), password: pw,
        options: { data: { username: toUsername(nome), full_name: nome } },
      });
      if (error) return fail(/registered|exists/i.test(error.message) ? 'Já existe uma conta com este nome. Acrescente o apelido.' : error.message);
      if (!data.session) return fail('Conta criada, mas sem sessão: o administrador do Supabase tem de desativar "Confirm email".');
    }
    onDone();
  }
  draw();
}

export function renderWaiting(root, profile, onRetry) {
  const blocked = profile.status === 'blocked';
  root.innerHTML = `
  <section class="card auth">
    <h1>${blocked ? 'Acesso bloqueado' : 'À espera de aprovação'}</h1>
    <p>${blocked
      ? 'O seu acesso foi bloqueado. Fale com o administrador.'
      : `Olá, ${esc(profile.full_name)}. A sua conta foi criada. O administrador tem de aprovar o acesso e escolher os menus que pode ver.`}</p>
    <div class="actions">
      <button class="btn primary" id="again" type="button">Verificar novamente</button>
      <button class="btn" id="out" type="button">Sair</button>
    </div>
  </section>`;
  root.querySelector('#again').onclick = onRetry;
  root.querySelector('#out').onclick = () => supabase.auth.signOut();
}
