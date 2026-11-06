import { supabase } from './supabase.js';
import { esc, iso, mondayOf, addDays, fmtWeek, fmtDay, downloadBlob, toast } from './ui.js';
import { norm, tokens, matchName } from './names.js';
import { buildICS, meetingWhen } from './ics.js';
import { progInfo } from './prog.js';

const WXC = { 0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Pouco nublado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'], 45: ['🌫️', 'Nevoeiro'], 48: ['🌫️', 'Nevoeiro'], 51: ['🌦️', 'Chuvisco'], 53: ['🌦️', 'Chuvisco'], 55: ['🌦️', 'Chuvisco'], 61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'], 71: ['🌨️', 'Neve'], 80: ['🌦️', 'Aguaceiros'], 81: ['🌦️', 'Aguaceiros'], 82: ['🌧️', 'Aguaceiros fortes'], 95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada'], 99: ['⛈️', 'Trovoada'] };
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=41.5503&longitude=-8.4201&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLisbon&forecast_days=7';

async function weather() {
  try {
    const c = JSON.parse(localStorage.getItem('painel-wx') || 'null');
    if (c && Date.now() - c.t < 30 * 60000) return c.d;
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000);
    const j = await (await fetch(WX_URL, { signal: ac.signal })).json(); clearTimeout(to);
    if (!j?.daily?.time) return null;
    localStorage.setItem('painel-wx', JSON.stringify({ t: Date.now(), d: j.daily })); return j.daily;
  } catch { return null; }
}

export async function renderHome(root, ctx) {
  const mon = iso(mondayOf(new Date())), today = iso(new Date()), mt = ctx.settings.meetings, me = ctx.profile;
  root.innerHTML = `<h2>Esta semana · ${esc(fmtWeek(mondayOf(new Date())))}</h2><div id="hm"><p class="muted">A carregar…</p></div>`;
  const out = [], q = (key, w) => supabase.from('items').select('*').eq('menu_key', key).eq('week_start', w).order('position');

  // Meteorologia (Braga)
  const wx = await weather();
  if (wx) { const i = Math.max(0, wx.time.indexOf(today)), w = WXC[wx.weather_code[i]] || ['🌡️', ''];
    out.push(`<section class="item"><h3>Braga hoje</h3><p>${w[0]} ${esc(w[1])} · ${Math.round(wx.temperature_2m_max[i])}° / ${Math.round(wx.temperature_2m_min[i])}°${wx.precipitation_probability_max?.[i] != null ? ' · 💧' + wx.precipitation_probability_max[i] + '%' : ''}</p></section>`); }

  // Administração: avisos
  if (ctx.admin) {
    const [{ count }, p] = await Promise.all([supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'), q('prog', mon)]);
    const warn = (count ? `<p class="warn">⚠ ${count} registo(s) à espera de aprovação (separador Utilizadores).</p>` : '') + progInfo(p.data || []);
    if (warn) out.push(`<section class="item"><h3>Avisos</h3>${warn}</section>`);
  }

  // As minhas designações (compara o meu nome com o do programa)
  if (ctx.canView('prog')) {
    const end = iso(addDays(mondayOf(new Date()), 49));
    const { data } = await supabase.from('items').select('*').eq('menu_key', 'prog').gte('week_start', mon).lte('week_start', end).order('week_start').order('position');
    const known = [{ k: norm(me.full_name) }], mine = [];
    (data || []).forEach(i => [[i.data.responsavel, ''], [i.data.ajudante, ' (ajudante)']].forEach(([v, sfx]) => { if (tokens(v).some(t => matchName(t, known))) {
      const sec = i.data.seccao, w = sec === 'Equipa' ? { date: meetingWhen(i.week_start, true, mt).date, time: '' } : meetingWhen(i.week_start, sec === 'Fim de semana', mt);
      if (w.date >= today) mine.push({ w, label: i.data.parte + sfx, min: i.data.min, sec, id: i.id });
    } }));
    mine.sort((a, b) => a.w.date.localeCompare(b.w.date));
    out.push(`<section class="item"><h3>As minhas designações</h3>${mine.length ? mine.map(m => `<div class="mr"><time>${esc(fmtDay(m.w.date))}${m.w.time ? ' · ' + esc(m.w.time) : ''}</time><span class="nm">${esc(m.label)}${m.min ? ` <small class="muted">${esc(m.min)} min</small>` : ''}</span></div>`).join('') + '<div class="actions"><button class="btn sm" id="ics" type="button">Adicionar ao calendário (.ics)</button></div>' : '<p class="muted">Sem designações nas próximas 7 semanas (o seu nome tem de coincidir com o do programa).</p>'}</section>`);
    ctx._mine = mine;
  }

  // Resumo da semana
  const blocks = [['saidas', 'Saídas ao serviço de campo', d => `${d.data ? fmtDay(d.data) : ''} ${d.hora || ''} · ${d.local || ''}${d.dirigente ? ' · ' + d.dirigente : ''}`],
    ['testemunho', 'Testemunho público', d => `${d.data ? fmtDay(d.data) : ''} ${d.hora || ''} · ${d.local || ''}${d.publicador ? ' · ' + d.publicador : ''}`],
    ['anuncios', 'Anúncios', d => d.titulo + (d.texto ? ' — ' + d.texto : '')]].filter(([k]) => ctx.canView(k));
  const res = await Promise.all(blocks.map(([k]) => q(k, mon)));
  blocks.forEach(([k, title, fmt], i) => { const l = res[i].data || []; if (l.length) out.push(`<section class="item"><h3>${esc(title)}</h3>${l.map(x => `<p class="line">${esc(fmt(x.data))}</p>`).join('')}<div class="actions"><button class="btn sm" data-go="${k}" type="button">Abrir</button></div></section>`); });

  root.querySelector('#hm').innerHTML = out.join('') || '<p class="muted">Sem dados para esta semana.</p>';
  root.querySelector('#hm').onclick = e => {
    const g = e.target.closest('[data-go]')?.dataset.go; if (g) ctx.go(g);
    if (e.target.closest('#ics')) {
      const ev = ctx._mine.map(m => ({ uid: m.id, summary: m.label, description: 'Designação · ' + m.sec, date: m.w.date, time: m.w.time || '', minutes: Number(m.min) || 30 }));
      downloadBlob(new Blob([buildICS('Designações · ' + me.full_name, ev)], { type: 'text/calendar' }), 'minhas-designacoes.ics'); toast('Ficheiro .ics descarregado.');
    }
  };
}
