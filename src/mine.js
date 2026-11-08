// As designações de UMA pessoa (puro, testável em Node).
// prog/saidas/testemunho = registos da tabela items; name = nome da pessoa; today/end = 'AAAA-MM-DD'.
import { norm, tokens, matchName } from './names.js';
import { meetingWhen } from './ics.js';

export function collectMine({ prog = [], saidas = [], testemunho = [], name, mt, today, end }) {
  const known = [{ k: norm(name) }], mine = v => tokens(v).some(t => matchName(t, known));
  const inRange = d => d >= today && d <= end, out = [];
  prog.forEach(i => {
    const d = i.data || {}, sec = d.seccao || 'Geral';
    [[d.responsavel, ''], [d.ajudante, 'ajudante']].forEach(([v, role]) => {
      if (!mine(v)) return;
      const w = sec === 'Equipa' ? { date: meetingWhen(i.week_start, true, mt).date, time: '' } : meetingWhen(i.week_start, sec === 'Fim de semana', mt);
      if (!inRange(w.date)) return;
      out.push({ date: w.date, time: w.time, kind: 'prog', ord: i.position || 0, id: i.id, min: d.min || '', title: d.parte,
        sub: [sec === 'Geral' ? 'Reunião de semana' : sec, role, d.min && d.min + ' min'].filter(Boolean).join(' · ') });
    });
  });
  saidas.forEach(i => { const d = i.data || {}; if (mine(d.dirigente) && inRange(d.data)) out.push({ date: d.data, time: d.hora || '', kind: 'saidas', ord: i.position || 0, id: i.id, min: '', title: 'Saída ao serviço de campo', sub: ['Dirigente', d.local].filter(Boolean).join(' · ') }); });
  testemunho.forEach(i => { const d = i.data || {}; if (mine(d.publicador) && inRange(d.data)) out.push({ date: d.data, time: d.hora || '', kind: 'testemunho', ord: i.position || 0, id: i.id, min: '', title: 'Testemunho público', sub: d.local || '' }); });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.ord - b.ord);
}

// último dia do mês seguinte ao de "now"
export const endOfNextMonth = now => {
  const x = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
