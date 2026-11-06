import { supabase } from './supabase.js';
import { DIAS_SEMANA, DEFAULT_MEETINGS } from './config.js';
import { esc, toast } from './ui.js';

export function renderSettings(root, ctx) {
  const m = ctx.settings.meetings, opt = v => DIAS_SEMANA.map((d, i) => `<option value="${i}" ${i === +v ? 'selected' : ''}>${d}</option>`).join('');
  root.innerHTML = `<form id="f" class="card" style="max-width:480px"><h2>Reuniões</h2>
    <p class="muted small">Usado no modo presidente, lembretes, partilha e calendário (.ics).</p>
    <div class="row"><label>Reunião de semana · dia<select name="d1">${opt(m.d1)}</select></label><label>Hora<input name="t1" type="time" value="${esc(m.t1)}" required></label></div>
    <div class="row"><label>Reunião de fim de semana · dia<select name="d2">${opt(m.d2)}</select></label><label>Hora<input name="t2" type="time" value="${esc(m.t2)}" required></label></div>
    <div class="actions"><button class="btn primary" type="submit">Guardar</button></div></form>`;
  root.querySelector('#f').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const v = { d1: +f.get('d1'), t1: f.get('t1'), d2: +f.get('d2'), t2: f.get('t2') };
    const { error } = await supabase.from('settings').upsert({ key: 'meetings', value: v, updated_at: new Date().toISOString() });
    if (error) return toast(error.message + ' (corra a migração 0002.)');
    ctx.settings.meetings = { ...DEFAULT_MEETINGS, ...v }; toast('Guardado.');
  };
}
