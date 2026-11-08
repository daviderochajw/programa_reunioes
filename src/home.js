import { supabase } from './supabase.js';
import { esc, iso, mondayOf, fmtDay, parseISO, MES, downloadBlob, toast } from './ui.js';
import { buildICS } from './ics.js';
import { mondayISO } from './importer.js';
import { collectMine, endOfNextMonth } from './mine.js';
import { progInfo } from './prog.js';

const WXC = { 0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Pouco nublado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'], 45: ['🌫️', 'Nevoeiro'], 48: ['🌫️', 'Nevoeiro'], 51: ['🌦️', 'Chuvisco'], 53: ['🌦️', 'Chuvisco'], 55: ['🌦️', 'Chuvisco'], 61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'], 71: ['🌨️', 'Neve'], 80: ['🌦️', 'Aguaceiros'], 81: ['🌦️', 'Aguaceiros'], 82: ['🌧️', 'Aguaceiros fortes'], 95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada'], 99: ['⛈️', 'Trovoada'] };
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=41.5503&longitude=-8.4201&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLisbon&forecast_days=7';
const KIND = { prog: ['Reunião', 'c2'], saidas: ['Campo', 'c1'], testemunho: ['Testemunho', 'c3'] };

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
  const now = new Date(), today = iso(now), mon = iso(mondayOf(now)), mt = ctx.settings.meetings, me = ctx.profile;
  const end = endOfNextMonth(now), endMon = mondayISO(end), nextName = MES[(now.getMonth() + 1) % 12];
  root.innerHTML = `<h2 class="sec" style="margin-top:4px">Olá, ${esc(me.full_name.split(' ')[0])}</h2><div id="hm"><p class="muted">A carregar…</p></div>`;
  const q = (key, from, to) => supabase.from('items').select('*').eq('menu_key', key).gte('week_start', from).lte('week_start', to).order('position').limit(5000);

  // ---- as minhas designações: de hoje até ao fim do mês seguinte, por data e hora
  const [pr, sa, te] = await Promise.all(['prog', 'saidas', 'testemunho'].map(k => ctx.canView(k) ? q(k, mon, endMon) : { data: [] }));
  const mine = collectMine({ prog: pr.data || [], saidas: sa.data || [], testemunho: te.data || [], name: me.full_name, mt, today, end });
  ctx._mine = mine;
  const thisM = mine.filter(m => m.date.slice(0, 7) === today.slice(0, 7)).length, nextM = mine.length - thisM;
  const out = [`<div class="tiles"><div class="tile" style="--h:var(--c2)"><b>${mine.length}</b><span>designações até ao fim de ${esc(nextName)}</span></div>
    <div class="tile" style="--h:var(--c1)"><b>${thisM}</b><span>neste mês (a partir de hoje)</span></div>
    <div class="tile" style="--h:var(--c3)"><b>${nextM}</b><span>em ${esc(nextName)}</span></div>
    <div class="tile" style="--h:var(--c4)"><b>${mine[0] ? esc(fmtDay(mine[0].date)) : '—'}</b><span>próxima designação</span></div></div>`];

  out.push('<h2 class="sec" style="--h:var(--c2)">As minhas designações</h2>');
  if (!mine.length) out.push(`<p class="muted">Sem designações até ${esc(fmtDay(end))}. O seu nome tem de coincidir com o do programa; se não aparecer nada, fale com o administrador.</p>`);
  else {
    let month = '', day = '', html = '';
    mine.forEach(m => {
      const mm = m.date.slice(0, 7);
      if (mm !== month) { if (day) html += '</section>'; day = ''; month = mm; html += `<h3 class="sec" style="--h:var(--c3)">${esc(MES[+mm.slice(5) - 1][0].toUpperCase() + MES[+mm.slice(5) - 1].slice(1))} ${mm.slice(0, 4)}</h3>`; }
      if (m.date !== day) { if (day) html += '</section>'; day = m.date; html += `<section class="mv" style="--h:var(--c2)"><h4><span>${esc(fmtDay(m.date))}</span></h4>`; }
      const [kl, kc] = KIND[m.kind];
      html += `<div class="mr"><time>${esc(m.time || '—')}</time><span class="nm">${esc(m.title)}${m.sub ? `<br><small class="muted">${esc(m.sub)}</small>` : ''}</span><span class="pill" style="--h:var(--${kc})">${kl}</span></div>`;
    });
    out.push(html + '</section><div class="actions"><button class="btn sm" id="ics" type="button">Adicionar ao calendário (.ics)</button></div>');
  }
  root.querySelector('#hm').innerHTML = out.join('');
  const hm = root.querySelector('#hm');
  hm.onclick = e => {
    const g = e.target.closest('[data-go]')?.dataset.go; if (g) ctx.go(g);
    if (e.target.closest('#ics')) {
      const ev = mine.map(m => ({ uid: m.id, summary: m.title, description: m.sub, date: m.date, time: m.time || '', minutes: Number(m.min) || 60 }));
      downloadBlob(new Blob([buildICS('Designações · ' + me.full_name, ev)], { type: 'text/calendar' }), 'minhas-designacoes.ics'); toast('Ficheiro .ics descarregado.');
    }
  };

  // ---- extras (carregam depois, sem atrasar a lista acima)
  const extra = [];
  const wx = await weather();
  if (wx) { const i = Math.max(0, wx.time.indexOf(today)), w = WXC[wx.weather_code[i]] || ['🌡️', ''];
    extra.push(`<section class="item" style="--h:var(--c1)"><h3>Braga hoje</h3><p style="margin:6px 0 0">${w[0]} ${esc(w[1])} · ${Math.round(wx.temperature_2m_max[i])}° / ${Math.round(wx.temperature_2m_min[i])}°${wx.precipitation_probability_max?.[i] != null ? ' · 💧' + wx.precipitation_probability_max[i] + '%' : ''}</p></section>`); }
  if (ctx.admin) {
    const [{ count }, p] = await Promise.all([supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'), q('prog', mon, mon)]);
    const warn = (count ? `<p class="warn">⚠ ${count} registo(s) à espera de aprovação (separador Utilizadores).</p>` : '') + progInfo(p.data || []);
    if (warn) extra.push(`<section class="item" style="--h:var(--c4)"><h3>Avisos</h3>${warn}</section>`);
  }
  const blocks = [['saidas', 'Saídas ao serviço de campo (esta semana)', d => `${d.data ? fmtDay(d.data) : ''} ${d.hora || ''} · ${d.local || ''}${d.dirigente ? ' · ' + d.dirigente : ''}`, 'c1'],
    ['testemunho', 'Testemunho público (esta semana)', d => `${d.data ? fmtDay(d.data) : ''} ${d.hora || ''} · ${d.local || ''}${d.publicador ? ' · ' + d.publicador : ''}`, 'c3'],
    ['anuncios', 'Anúncios (esta semana)', d => d.titulo + (d.texto ? ' — ' + d.texto : ''), 'c4']].filter(([k]) => ctx.canView(k));
  const res = await Promise.all(blocks.map(([k]) => q(k, mon, mon)));
  blocks.forEach(([k, title, fmt, c], i) => { const l = res[i].data || []; if (l.length) extra.push(`<section class="item" style="--h:var(--${c})"><h3>${esc(title)}</h3>${l.map(x => `<p class="line">${esc(fmt(x.data))}</p>`).join('')}<div class="actions"><button class="btn sm" data-go="${k}" type="button">Abrir</button></div></section>`); });
  if (extra.length) hm.insertAdjacentHTML('beforeend', '<h2 class="sec" style="--h:var(--c6)">Esta semana</h2>' + extra.join(''));
}
