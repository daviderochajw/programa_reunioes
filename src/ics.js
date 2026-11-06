// Calendário .ics (puro, testável em Node)
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = line => {
  const out = []; let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
  out.push(s); return out.join('\r\n');
};
export const ymd = iso => iso.replace(/-/g, '');
export const addDaysISO = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

// ev: {uid, summary, description, date:'YYYY-MM-DD', time:'HH:MM' (opcional), minutes (duração), endDate (dia inteiro, inclusivo)}
export function buildICS(calName, events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Painel Braga Central//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(calName)];
  events.forEach((e, i) => {
    L.push('BEGIN:VEVENT', `UID:${ymd(e.date)}-${i}-${String(e.uid || 'x').replace(/\W/g, '')}@painel-braga-central`, 'DTSTAMP:' + stamp);
    if (e.time && /^\d{1,2}:\d{2}$/.test(e.time)) {
      const [h, m] = e.time.split(':').map(Number), end = h * 60 + m + (e.minutes || 60);
      L.push(`DTSTART:${ymd(e.date)}T${pad(h)}${pad(m)}00`, `DTEND:${ymd(e.date)}T${pad(Math.floor(end / 60) % 24)}${pad(end % 60)}00`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(addDaysISO(e.endDate || e.date, 1))}`);
    }
    L.push('SUMMARY:' + esc(e.summary), 'DESCRIPTION:' + esc(e.description || ''), 'TRANSP:TRANSPARENT');
    if (e.time) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.summary), 'TRIGGER:-PT1H', 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// Data e hora da reunião de uma semana (weekStart = segunda-feira ISO). we = reunião de fim de semana.
export function meetingWhen(weekStart, we, mt) {
  const dn = we ? mt.d2 : mt.d1;          // 0=domingo … 6=sábado
  return { date: addDaysISO(weekStart, (dn + 6) % 7), time: we ? mt.t2 : mt.t1, minutes: we ? 120 : 105 };
}
