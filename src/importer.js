// Leitura de ficheiros Excel -> registos da base de dados. Tudo aqui é PURO (sem DOM, sem rede):
// recebe as folhas já lidas como [[nome, linhas[][]], ...] com todas as células em texto
// (as datas já vêm como AAAA-MM-DD, ver excel.js) e devolve blocos prontos a gravar.
//
// Aceita DOIS formatos:
//  1) o MODELO simples da app (uma folha por menu, uma linha por registo; ver excel.js > templateSheets)
//  2) o ficheiro original da congregação (ENTRADA, Designações, Contactos, Grupos de Saída, Saídas, Testemunho público, …)
import { FIELDS } from './config.js';
import { norm } from './names.js';

const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function parseDate(s) {
  s = String(s ?? '').trim(); let m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; mo = +m[2]; d = +m[1]; }
  else return '';
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? isoOf(y, mo, d) : '';
}
export const addDaysISO = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d + n); return isoOf(x.getFullYear(), x.getMonth() + 1, x.getDate()); };
export const mondayISO = iso => { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d); return addDaysISO(iso, -((x.getDay() + 6) % 7)); };
const timeText = v => { const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})/); return m ? `${pad(+m[1])}:${m[2]}` : String(v ?? '').trim(); };
const str = v => String(v ?? '').trim();
const cell = (a, r, c) => { const v = str((a[r] || [])[c]); return v === '0' ? '' : v; };

// ---------------------------------------------------------------- programa (folha ENTRADA original)
const TR = [[8, 9], [10, 11], [12, 13]], MR = [[15, 16], [17, 18], [19, 20], [21, 22]], VR = [[24, 25], [26, 27], [28, 29]];
const TEAM = [['Indicadores', 42], ['Leitor', 43], ['Áudio / Vídeo', 44], ['Tribuna', 45], ['Micros', 46], ['Limpeza', 47]];
const weekCols = a => { const wc = []; (a[2] || []).forEach((x, c) => { if (norm(x) === 'semana') wc.push(c); }); return wc; };
export const isProgGrid = a => { const wc = weekCols(a); return wc.length > 0 && norm(str((a[4] || [])[wc[0]])) === 'presidente'; };
const cleanTitle = t => t.replace(/^\d+\.\s*/, '').replace(/\s*\(\s*\d+\s*min[^)]*\)/i, '').trim();
const minOf = t => { const m = t.match(/\((\d+)\s*min/i); return m ? m[1] : ''; };

function weekItems(a, c) {
  const g = (r, cc) => cell(a, r, cc), out = [];
  const add = (seccao, parte, responsavel, ajudante = '', notas = '', min = '', required = false) => {
    if (required || parte || responsavel || ajudante) out.push({ seccao, parte, min, responsavel, ajudante, notas });
  };
  add('Geral', 'Presidente', g(4, c + 1), '', '', '', true);
  add('Geral', 'Oração inicial', g(5, c + 1), '', '', '', true);
  if (g(6, c + 1)) add('Geral', 'Classe auxiliar (conselheiro)', g(6, c + 1));
  TR.forEach(([p, t]) => { const ti = g(t, c); add('Tesouros', cleanTitle(ti), g(p, c), '', '', minOf(ti)); });
  MR.forEach(([p, t]) => { const ti = g(t, c); add('Ministério', cleanTitle(ti), g(p, c), g(p, c + 1), '', minOf(ti)); });
  VR.forEach(([p, t]) => { const ti = g(t, c); add('Viver como Cristãos', cleanTitle(ti), g(p, c), '', '', minOf(ti)); });
  add('Geral', 'Oração final', g(31, c + 1), '', '', '', true);
  add('Fim de semana', 'Presidente', g(35, c + 1), '', '', '', true);
  const cong = g(37, c + 1);
  add('Fim de semana', g(38, c) || 'Discurso público', g(36, c + 1), '', cong ? 'Congregação: ' + cong : '', '', true);
  add('Fim de semana', 'Dirigente de A Sentinela', g(39, c + 1), '', '', '', true);
  add('Fim de semana', 'Oração final', g(40, c + 1));
  TEAM.forEach(([l, r]) => add('Equipa', l, g(r, c + 1)));
  return out;
}

export function parseProg(a) {
  const wc = weekCols(a); let start = '';
  for (let r = 0; r < 6 && !start; r++) for (const x of a[r] || []) { const d = parseDate(x); if (d) { start = d; break; } }
  if (!start) return { rows: [], warn: 'Não encontrei a data de início nas primeiras linhas da folha do programa.' };
  const rows = [];
  wc.forEach((c, i) => {
    const ws = mondayISO(addDaysISO(start, 7 * i));
    weekItems(a, c).forEach((data, j) => rows.push({ menu_key: 'prog', week_start: ws, position: (j + 1) * 10, data }));
  });
  return { rows };
}

// ---------------------------------------------------------------- saídas de campo / testemunho público
export function parseEsc(a, menu) {
  const list = [];
  a.forEach(r => {
    const d = parseDate((r || [])[0]); if (!d) return;
    list.push(menu === 'saidas'
      ? { data: d, hora: timeText(r[1]), local: str(r[2]), grupos: str(r[3]), dirigente: str(r[4]), fonte: str(r[5]) }
      : { data: d, hora: timeText(r[1]), local: str(r[2]), publicador: str(r[3]) });
  });
  list.sort((x, y) => (x.data + x.hora).localeCompare(y.data + y.hora));
  return { rows: list.map((data, i) => ({ menu_key: menu, week_start: mondayISO(data.data), position: (i + 1) * 10, data })) };
}

// ---------------------------------------------------------------- Designações (irmãos + responsabilidades)
export const isPeopleSheet = a => (a[1] || []).some(h => /privil/i.test(str(h)));
export function parsePeople(a) {
  const r0 = a[0] || [], r1 = (a[1] || []).map(str); let last = '';
  const sec = r1.map((_, i) => { const v = str(r0[i]); if (v) last = v; return last; });
  let tel = r1.findIndex(h => /telem/i.test(h)); if (tel < 0) tel = r1.length;
  const em = r1.findIndex(h => /e-?mail/i.test(h));
  const cols = []; for (let c = 7; c < tel; c++) if (r1[c]) cols.push(c);
  const people = [];
  a.slice(2).forEach(r => {
    const name = str(r[0]); if (!name) return;
    const g = i => str(r[i]);
    people.push({ name, idade: g(1), bat: g(2), obs: g(3), priv: g(4), pub: g(5), cs: g(6), tasks: cols.filter(c => /[✓✔]/.test(g(c))),
      tel: tel < r1.length ? g(tel) : '', email: em >= 0 ? g(em) : '' });
  });
  people.sort((x, y) => x.name.localeCompare(y.name, 'pt'));
  const irmaos = people.map((p, i) => ({ menu_key: 'irmaos', week_start: null, position: (i + 1) * 10, data: {
    nome: p.name, idade: p.idade, batismo: p.bat, privilegio: p.priv, publicador: p.pub, cs: p.cs, obs: p.obs,
    tarefas: p.tasks.map(c => r1[c]).join('\n'), telemovel: p.tel, email: p.email } }));
  const by = f => people.filter(f).map(p => p.name);
  const cats = [
    ['A', 'Estatuto', by(p => p.priv === 'A')], ['SM', 'Estatuto', by(p => p.priv === 'SM')],
    ['Pub N/Bat', 'Estatuto', by(p => p.pub === 'Pub N/Bat')], ['Pub/B', 'Estatuto', by(p => p.pub === 'Pub/B')],
    ['CS', 'Estatuto', people.filter(p => p.cs).map(p => `${p.name} (${p.cs})`)],
    ...cols.map(c => [r1[c], sec[c] || 'Outras', by(p => p.tasks.includes(c))]),
  ].filter(x => x[2].length);
  const resp = cats.map(([label, grupo, names], i) => ({ menu_key: 'resp', week_start: null, position: (i + 1) * 10, data: { responsabilidade: label, grupo, irmaos: names.join('\n'), notas: '' } }));
  return { irmaos, resp };
}

// ---------------------------------------------------------------- Contactos (folha original)
const ctHead = a => a.slice(0, 8).findIndex(r => (r || []).some(c => norm(c) === 'nome') && (r || []).some(c => norm(c) === 'grupo'));
export const isLegacyContacts = a => { const i = ctHead(a); return i >= 0 && a[i].some(c => ['esperanca', 'anos verdade', 'anos de verdade'].includes(norm(c))); };
export function parseContacts(a) {
  const hi = ctHead(a), h = a[hi].map(c => norm(c).replace(/-/g, ''));
  const ix = name => h.indexOf(name), ce = ix('contactos de emergencia'), ce2 = h.lastIndexOf('contactos de emergencia');
  const C = { nome: ix('nome'), grupo: ix('grupo'), sexo: ix('sexo'), nasc: ix('nascimento'), bat: ix('batismo'), tm: ix('telemovel'), tf: ix('telefone'), em: ix('email'), mo: ix('morada'), a: ix('a'), sm: ix('s. m.'), pr: ix('p.r.') };
  const v = (r, i) => (i < 0 ? '' : str(r[i])), dt = x => parseDate(x) || x;
  const pair = (r, i) => (i < 0 ? '' : [v(r, i), v(r, i + 1)].filter(Boolean).join(', '));
  // (a coluna "Esperança" e "Anos de verdade" não são importadas de propósito: minimização de dados)
  const rows = a.slice(hi + 1).filter(r => str(r[C.nome])).map((r, i) => ({ menu_key: 'contactos', week_start: null, position: (i + 1) * 10, data: {
    nome: v(r, C.nome), grupo: v(r, C.grupo), sexo: v(r, C.sexo), nascimento: dt(v(r, C.nasc)), batismo: dt(v(r, C.bat)),
    telemovel: v(r, C.tm), telefone: v(r, C.tf), email: v(r, C.em), morada: v(r, C.mo),
    privilegios: [v(r, C.a) && 'A', v(r, C.sm) && 'S. M.', v(r, C.pr) && 'P.R.'].filter(Boolean).join(' / '),
    emergencia: pair(r, ce), emergencia2: ce2 > ce ? pair(r, ce2) : '' } }));
  return { rows };
}

// ---------------------------------------------------------------- Grupos de Saída (grupos + novos publicadores/batismos)
function groupsOf(a) {
  const list = []; let ctr = '';
  const num = r => { const v = (a[r] || []).slice(0, 10).map(str).filter(Boolean); return v.length >= 5 && v.every(x => /^\d+$/.test(x)); };
  let lim = -1; for (let r = 2; r < a.length; r++) if (num(r)) { lim = r; break; }
  const top = lim < 0 ? a.length : lim;
  for (let c = 0; c < 10; c++) {
    const t = str((a[1] || [])[c]);
    if (str((a[0] || [])[c])) ctr = str(a[0][c]);
    if (!t) continue;
    const m = [];
    for (let r = 2; r < top && str((a[r] || [])[c]); r++) { const v = str(a[r][c]), x = v.match(/^(.*?)\s*-\s*(A?SG)$/); m.push(x ? { n: x[1], r: x[2] } : { n: v, r: '' }); }
    list.push({ t, ctr, m });
  }
  return list;
}
export function parseGroups(a) {
  return { rows: groupsOf(a).map((g, i) => ({ menu_key: 'grupos', week_start: null, position: (i + 1) * 10, data: {
    grupo: g.t, centro: g.ctr, superintendente: g.m.filter(x => x.r === 'SG').map(x => x.n).join(' & '), ajudante: g.m.filter(x => x.r === 'ASG').map(x => x.n).join(' & '),
    membros: g.m.filter(x => !x.r).map(x => x.n).join('\n') } })) };
}
export function parseMovs(a) {
  const h = []; (a[0] || []).forEach((x, c) => { const t = norm(x); if (c >= 11 && t) h.push({ c, t }); });
  const MD = [['novos', 'Novo publicador'], ['batism', 'Batismo']], out = [];
  h.forEach((x, i) => {
    const d = MD.find(z => x.t.startsWith(z[0])); if (!d) return;
    const nx = h[i + 1] ? h[i + 1].c : null, hasD = nx !== null && nx - x.c >= 4, cd = hasD ? x.c + 1 : -1, cm = hasD ? x.c + 2 : x.c + 1;
    for (let r = 2; r < a.length; r++) {
      const row = a[r] || [], n = str(row[x.c]); if (!n) continue;
      out.push({ nome: n, tipo: d[1], data: str(row[cm]), notas: cd >= 0 ? str(row[cd]) : '' });
    }
  });
  return { rows: out.map((data, i) => ({ menu_key: 'movs', week_start: null, position: (i + 1) * 10, data })) };
}

// ---------------------------------------------------------------- outras folhas (departamentos, etc.)
export function parseOther(name, a) {
  const rows = a.map(r => { let n = r.length; while (n && !str(r[n - 1])) n--; return r.slice(0, Math.min(n, 30)).map(str); });
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return { rows: [{ menu_key: 'outras', week_start: null, position: 0, data: { titulo: name, linhas: rows.slice(0, 500) } }] };
}

// ---------------------------------------------------------------- MODELO simples (uma folha por menu)
const TEMPLATE = {}; Object.entries(FIELDS).forEach(([k, c]) => { if (c.sheet && c.fields.length) TEMPLATE[norm(c.sheet)] = k; TEMPLATE[k] = k; });
export function parseTemplate(menu, a) {
  const cfg = FIELDS[menu], hr = a.findIndex(r => (r || []).filter(x => str(x)).length >= 2);
  if (hr < 0) return { rows: [], warn: 'folha vazia' };
  const hdr = a[hr].map(norm), col = {};
  cfg.fields.forEach(f => { const i = hdr.findIndex(x => x === norm(f.label) || x === f.key); if (i >= 0) col[f.key] = i; });
  const title = cfg.fields.find(f => f.key === cfg.title);
  if (!(title.key in col)) return { rows: [], warn: `não encontrei a coluna «${title.label}»` };
  const wk = cfg.kind === 'weekly' && !cfg.dateField, wcol = hdr.findIndex(x => x.startsWith('semana'));
  const rows = []; let skipped = 0; const pos = {};
  a.slice(hr + 1).forEach(r => {
    const data = {}; cfg.fields.forEach(f => { let v = col[f.key] >= 0 ? str(r[col[f.key]]) : ''; if (f.type === 'date') v = parseDate(v) || v; if (f.type === 'time') v = timeText(v); data[f.key] = v; });
    if (!Object.values(data).some(Boolean)) return;
    let week = null;
    if (wk) { const d = parseDate((r || [])[wcol]); if (!d) { skipped++; return; } week = mondayISO(d); }
    else if (cfg.dateField) { const d = parseDate(data[cfg.dateField]); if (!d) { skipped++; return; } week = mondayISO(d); data[cfg.dateField] = d; }
    pos[week] = (pos[week] || 0) + 10;
    rows.push({ menu_key: menu, week_start: week, position: pos[week], data });
  });
  return { rows, warn: skipped ? `${skipped} linha(s) sem data válida foram ignoradas` : '' };
}

// ---------------------------------------------------------------- análise global
const IGNORE = new Set(['leia-me', 'leia me', 'leiame', 'automacao', 'removidos']);
const SKIP_OTHER = new Set(['responsabilidades', 'batismos', 'chaves salao', 'oracoes ra', 'pioneiros', 'boleia', 'centro saida 1', 'entrada']);

export function analyze(sheets) {
  const blocks = [], ignored = []; let n = 0;
  const push = (menu, label, source, res, checked = true) => {
    if (!res.rows.length && !res.warn) return;
    const weeks = [...new Set(res.rows.map(r => r.week_start).filter(Boolean))].sort();
    blocks.push({ id: 'b' + n++, menu, label, source, rows: res.rows, weeks, warn: res.warn || '', checked: checked && res.rows.length > 0 });
  };
  sheets.forEach(([name, a]) => {
    const nn = norm(name), src = `Folha «${name}»`;
    if (IGNORE.has(nn)) return;
    if (isProgGrid(a)) return push('prog', 'Programa das reuniões', src, parseProg(a));
    if (isPeopleSheet(a)) { const p = parsePeople(a); push('irmaos', 'Irmãos (designações)', src, { rows: p.irmaos }); push('resp', 'Responsabilidades', src, { rows: p.resp }); return; }
    if (isLegacyContacts(a)) return push('contactos', 'Contactos', src, parseContacts(a));
    if (nn === 'grupos de saida') { push('grupos', 'Grupos de saída', src, parseGroups(a)); push('movs', 'Novos publicadores e batismos', src, parseMovs(a)); return; }
    if (nn === 'saidas') return push('saidas', 'Saídas ao Serviço de Campo', src, parseEsc(a, 'saidas'));
    if (nn === 'testemunho publico') return push('testemunho', 'Testemunho Público', src, parseEsc(a, 'testemunho'));
    const tm = TEMPLATE[nn];
    if (tm) return push(tm, FIELDS[tm].sheet, src, parseTemplate(tm, a));
    if (SKIP_OTHER.has(nn)) return void ignored.push(name);
    push('outras', 'Outra folha: ' + name, src, parseOther(name, a));
  });
  return { blocks, ignored };
}
