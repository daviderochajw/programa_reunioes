// Funcionalidades do menu «Programa»: atribuições em falta, conflitos, modo presidente,
// programa do mês (PDF), lembretes por WhatsApp, partilha e impressão.
import { supabase } from './supabase.js';
import { esc, toast, openDialog, iso, addDays, mondayOf, fmtWeek, fmtDay, printHtml, parseISO, pad2 } from './ui.js';
import { norm, tokens, matchName, waPhone } from './names.js';
import { addDaysISO, meetingWhen } from './ics.js';
import { DIAS_SEMANA, SECCOES } from './config.js';

const OPT = new Set(['Equipa', 'Classe auxiliar (conselheiro)', 'Oração final']);
const people = ({ responsavel, ajudante }) => [...tokens(responsavel), ...tokens(ajudante)];

export function progInfo(items) {
  const d = i => i.data || {};
  const miss = items.filter(i => !d(i).responsavel && d(i).seccao !== 'Equipa' && !OPT.has(d(i).parte));
  const by = new Map();
  items.forEach(i => people(d(i)).forEach(t => { const k = norm(t); if (!by.has(k)) by.set(k, { n: t, parts: [], team: 0 }); const x = by.get(k); if (d(i).seccao === 'Equipa') x.team++; else x.parts.push(d(i).parte); }));
  const conf = [...by.values()].filter(x => x.parts.length >= 3 || x.team >= 2);
  let h = '';
  if (miss.length) h += `<p class="warn">⚠ ${miss.length} designação(ões) por atribuir: ${miss.slice(0, 6).map(i => esc(d(i).parte)).join(', ')}${miss.length > 6 ? '…' : ''}</p>`;
  conf.forEach(x => { h += `<p class="warn">⚠ ${esc(x.n)} tem ${x.parts.length >= 3 ? x.parts.length + ' partes' : x.team + ' funções de equipa'} nesta semana.</p>`; });
  return h;
}

// Pessoas conhecidas (nome + telemóvel) para ligações de WhatsApp. Só quem pode ler Contactos/Irmãos.
export async function getPeople(ctx) {
  if (ctx._people) return ctx._people;
  const m = new Map();
  for (const key of ['contactos', 'irmaos']) {
    if (!ctx.canView(key)) continue;
    const { data } = await supabase.from('items').select('data').eq('menu_key', key).limit(5000);
    (data || []).forEach(r => { const k = norm(r.data?.nome); if (!k) return; const ph = waPhone(r.data.telemovel || r.data.telefone || ''); const o = m.get(k); if (!o) m.set(k, { k, n: r.data.nome, phone: ph }); else if (!o.phone) o.phone = ph; });
  }
  return (ctx._people = [...m.values()]);
}

const grouped = items => SECCOES.map(s => [s, items.filter(i => (i.data?.seccao || 'Geral') === s)]).filter(([, l]) => l.length);
const line = d => `${d.parte}${d.min ? ' (' + d.min + ' min)' : ''}${d.sala ? ' [' + d.sala + ']' : ''}${d.responsavel ? ' — ' + d.responsavel : ' — por atribuir'}${d.ajudante ? ' / ' + d.ajudante : ''}`;

function weekText(items, week, mt) {
  let t = `*Programa · ${fmtWeek(week)}*\n`;
  grouped(items).forEach(([s, l]) => {
    const we = s === 'Fim de semana', w = s === 'Equipa' ? null : meetingWhen(iso(week), we, mt);
    t += `\n_${s}${w ? ` (${fmtDay(w.date)}, ${w.time})` : ''}_\n` + l.map(i => '• ' + line(i.data)).join('\n') + '\n';
  });
  return t;
}

export function progExtras(bar, api) {
  const { ctx } = api, admin = ctx.admin, mt = ctx.settings.meetings;
  bar.innerHTML = `<button class="btn" data-p="share">Partilhar (WhatsApp)</button><button class="btn" data-p="print">Imprimir semana</button>
    <button class="btn" data-p="month">Programa do mês (PDF)</button>${admin ? '<button class="btn" data-p="pres">Modo presidente</button><button class="btn" data-p="rem">Lembretes WhatsApp</button>' : ''}`;
  bar.onclick = e => {
    const p = e.target.closest('[data-p]')?.dataset.p; if (!p) return;
    const items = api.getItems(), week = api.getWeek();
    if (!items.length && p !== 'month') return toast('Esta semana está vazia.');
    if (p === 'share') window.open('https://wa.me/?text=' + encodeURIComponent(weekText(items, week, mt)), '_blank', 'noopener');
    else if (p === 'print') printHtml(`<h1>Programa · ${esc(fmtWeek(week))}</h1>` + grouped(items).map(([s, l]) => `<h2>${esc(s)}</h2><ul>${l.map(i => `<li>${esc(line(i.data))}</li>`).join('')}</ul>`).join(''));
    else if (p === 'month') monthPrint(api);
    else if (p === 'pres') presidente(api);
    else if (p === 'rem') reminders(api);
  };
}

async function monthPrint({ ctx, getWeek }) {
  const ref = addDays(getWeek(), 3), mon = ref.getMonth(), yr = ref.getFullYear();
  let m = mondayOf(new Date(yr, mon, 1)); const weeks = [];
  for (let i = 0; i < 6; i++) { const w = addDays(m, 7 * i); if (addDays(w, 3).getMonth() === mon) weeks.push(iso(w)); }
  const { data, error } = await supabase.from('items').select('*').eq('menu_key', 'prog').in('week_start', weeks).order('position');
  if (error) return toast(error.message);
  if (!data.length) return toast('Não há programa neste mês.');
  const NM = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const body = SECCOES.map(sec => {
    const cols = weeks.map(w => data.filter(i => i.week_start === w && (i.data.seccao || 'Geral') === sec));
    const n = Math.max(0, ...cols.map(c => c.length)); if (!n) return '';
    return `<tr><th colspan="${weeks.length}" class="sec">${esc(sec)}</th></tr>` + Array.from({ length: n }, (_, r) =>
      `<tr>${cols.map(c => { const it = c[r]?.data; return `<td>${it ? `<b>${esc(it.parte)}</b>${it.responsavel ? '<br>' + esc(it.responsavel) : ''}${it.ajudante ? ' / ' + esc(it.ajudante) : ''}` : ''}</td>`; }).join('')}</tr>`).join('');
  }).join('');
  printHtml(`<h1>Programa · ${NM[mon]} de ${yr}</h1><table class="month"><thead><tr>${weeks.map(w => `<th>${esc(fmtWeek(parseISO(w)))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`);
}

async function presidente({ ctx, getWeek, getItems }) {
  const mt = ctx.settings.meetings, week = getWeek(), kn = await getPeople(ctx);
  const items = getItems().filter(i => ['Geral', 'Tesouros', 'Ministério', 'Viver como Cristãos'].includes(i.data?.seccao || 'Geral'));
  const w = meetingWhen(iso(week), false, mt); let [h, m] = w.time.split(':').map(Number), t = h * 60 + m;
  const hm = x => `${pad2(Math.floor(x / 60) % 24)}:${pad2(x % 60)}`;
  const who = v => tokens(v).map(tk => { const k = matchName(tk, kn), ph = k?.phone; return `<b>${esc(tk)}</b>${ph ? ` <a class="btn sm" href="tel:+${ph}">Ligar</a> <a class="btn sm" href="https://wa.me/${ph}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`; }).join(' · ');
  const rows = items.map(i => { const d = i.data, at = t; t += Number(d.min) || 0;
    return `<div class="prr"><time>${hm(at)}</time><div><b>${esc(d.parte)}</b>${d.min ? ` <small class="muted">${esc(d.min)} min</small>` : ''}<br>${who(d.responsavel) || '<span class="warn">por atribuir</span>'}${d.ajudante ? '<br><small>Ajudante: ' + who(d.ajudante) + '</small>' : ''}</div></div>`; }).join('');
  const dlg = openDialog(`<div class="dh"><h2>Modo presidente</h2><button class="btn sm" id="x" type="button">Fechar</button></div>
    <p class="muted">${esc(fmtDay(w.date))} · início às ${esc(w.time)} · fim previsto ${hm(t)}</p><div class="pres">${rows}</div>`);
  dlg.classList.add('wide'); dlg.querySelector('#x').onclick = () => dlg.close();
}

async function reminders({ ctx, getWeek, getItems }) {
  const mt = ctx.settings.meetings, week = getWeek(), kn = await getPeople(ctx), key = 'painel-wa-' + iso(week);
  let sent = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  const by = new Map();
  getItems().forEach(i => {
    const d = i.data || {}, sec = d.seccao || 'Geral';
    const when = sec === 'Equipa' ? `semana de ${fmtDay(iso(week))}` : (w => `${fmtDay(w.date)}, ${w.time}`)(meetingWhen(iso(week), sec === 'Fim de semana', mt));
    [[d.responsavel, ''], [d.ajudante, ' (ajudante)']].forEach(([v, sfx]) => tokens(v).forEach(tk => {
      const k = matchName(tk, kn), id = k ? k.k : norm(tk); if (!by.has(id)) by.set(id, { id, n: k ? k.n : tk, phone: k?.phone || '', l: [] });
      by.get(id).l.push(`• ${when}: ${d.parte}${d.sala ? ' [' + d.sala + ']' : ''}${d.min ? ' (' + d.min + ' min)' : ''}${sfx}`);
    }));
  });
  const list = [...by.values()].sort((a, b) => a.n.localeCompare(b.n, 'pt'));
  const msg = p => `Olá ${p.n.split(' ')[0]}, lembrete das tuas designações (semana de ${fmtDay(iso(week))}):\n${p.l.join('\n')}\n\nSe não puderes, avisa-me o quanto antes. Obrigado!`;
  const dlg = openDialog('<div></div>'); dlg.classList.add('wide');
  const draw = () => {
    dlg.innerHTML = `<div class="dh"><h2>Lembretes · ${esc(fmtWeek(week))}</h2><button class="btn sm" id="x" type="button">Fechar</button></div>
      <p class="muted"><b>${list.filter(p => sent.has(p.id)).length} de ${list.length}</b> marcados como enviados · ${list.filter(p => !p.phone).length} sem telemóvel</p>
      ${list.map(p => `<div class="mr ${sent.has(p.id) ? 'done' : ''}"><span class="nm"><b>${esc(p.n)}</b><br><small class="muted">${p.l.map(x => esc(x.slice(2))).join('<br>')}</small></span>
        ${p.phone ? `<a class="btn sm primary" target="_blank" rel="noopener" href="https://wa.me/${p.phone}?text=${encodeURIComponent(msg(p))}" data-s="${esc(p.id)}">WhatsApp</a>` : '<small class="muted">Sem telemóvel</small>'}
        <button class="btn sm" data-c="${esc(p.id)}" type="button">Copiar</button><button class="btn sm" data-m="${esc(p.id)}" type="button">${sent.has(p.id) ? 'Desmarcar' : 'Marcar enviado'}</button></div>`).join('') || '<p class="muted">Sem designações.</p>'}`;
    dlg.querySelector('#x').onclick = () => dlg.close();
  };
  const save = () => localStorage.setItem(key, JSON.stringify([...sent]));
  dlg.onclick = e => {
    const c = e.target.closest('[data-c]')?.dataset.c, m = e.target.closest('[data-m]')?.dataset.m, s = e.target.closest('[data-s]')?.dataset.s;
    if (c) { navigator.clipboard?.writeText(msg(by.get(c))); toast('Copiado.'); }
    if (m) { sent.has(m) ? sent.delete(m) : sent.add(m); save(); draw(); }
    if (s) { sent.add(s); save(); setTimeout(draw, 300); }
  };
  draw();
}

// ---- Programa da semana em cartões (como no painel original)
export function progHtml(items, admin, week, mt) {
  const ad = id => admin ? `<span class="ia"><button class="btn sm" data-e="${id}" aria-label="Editar" title="Editar">✎</button><button class="btn sm danger" data-d="${id}" aria-label="Apagar" title="Apagar">✕</button></span>` : '';
  const COL = { Geral: 'c2', Tesouros: 'c1', 'Ministério': 'c4', 'Viver como Cristãos': 'c5', 'Fim de semana': 'c3', Equipa: 'c6' };
  const sec = i => i.data?.seccao || 'Geral';
  const MID = ['Geral', 'Tesouros', 'Ministério', 'Viver como Cristãos'];
  let n = 0, prevMin = null;
  const who = (label, name) => `<div class="who">${label ? `<span class="lb">${label}</span> ` : ''}${esc(name)}</div>`;
  const row = (i, numbered) => {
    const d = i.data || {}, mi = sec(i) === 'Ministério';
    let no = '';
    if (numbered) {
      // a mesma parte feita nas duas salas (mesmo título, salas diferentes) leva o mesmo número
      const same = mi && prevMin && norm(prevMin.parte) === norm(d.parte) && prevMin.sala && d.sala && prevMin.sala !== d.sala;
      if (!same) n++;
      no = `<span class="no" style="--h:var(--${COL[sec(i)]})">${n}</span>`;
    }
    prevMin = mi ? { parte: d.parte, sala: d.sala } : null;
    const main = d.responsavel ? who(mi ? 'Participante:' : '', d.responsavel) : '<div class="who"><span class="nb">por atribuir</span></div>';
    return `<div class="pi"><div class="pt">${no}${esc(d.parte)}${d.min ? ` <span class="lb">(${esc(d.min)} min)</span>` : ''}${d.sala ? ` <span class="pill" style="--h:var(--${d.sala === 'Principal' ? 'c2' : 'c4'})">${esc(d.sala)}</span>` : ''}${d.notas ? `<div class="lb">${esc(d.notas)}</div>` : ''}</div>
      <div class="pw">${main}${d.ajudante ? who('Ajudante:', d.ajudante) : ''}${ad(i.id)}</div></div>`;
  };
  const card = (title, color, when, list, strips) => {
    if (!list.length) return '';
    let last = null, h = '';
    list.forEach(i => {
      const s = sec(i);
      if (strips && s !== 'Geral' && s !== last) h += `<h5 class="ps" style="--h:var(--${COL[s]})">${esc(s)}</h5>`;
      last = s; h += row(i, strips && s !== 'Geral');
    });
    return `<section class="pg" style="--h:var(--${color})"><h4><span>${esc(title)}</span>${when ? `<span class="pill">${esc(when)}</span>` : ''}</h4>${h}</section>`;
  };
  const by = f => [...items].filter(i => f(sec(i))).sort((a, b) => a.position - b.position);
  const w1 = meetingWhen(iso(week), false, mt), w2 = meetingWhen(iso(week), true, mt);
  return card('Reunião de semana', 'c2', `${fmtDay(w1.date)} · ${w1.time}`, by(s => MID.includes(s)), true)
    + card('Reunião de fim de semana', 'c3', `${fmtDay(w2.date)} · ${w2.time}`, by(s => s === 'Fim de semana'), false)
    + card('Equipa', 'c6', '', by(s => s === 'Equipa'), false);
}
