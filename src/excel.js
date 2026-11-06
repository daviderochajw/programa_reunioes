import { FIELDS } from './config.js';
import { downloadBlob } from './ui.js';

const pad = n => String(n).padStart(2, '0');
// Converte uma célula do Excel em texto. Datas -> AAAA-MM-DD; horas -> HH:MM.
export function cellText(v) {
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    if (v.getFullYear() < 1950) { const m = Math.round(v.getHours() * 60 + v.getMinutes() + v.getSeconds() / 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }
    const d = new Date(v.getTime() + 6 * 3600e3);   // folga para pequenos desvios de fuso
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return v == null ? '' : String(v).trim();
}

// O leitor de Excel (SheetJS) só é descarregado quando se usa
async function lib() { return import('xlsx'); }

export async function readWorkbook(file) {
  const X = await lib();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return wb.SheetNames.map(n => [n, X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true, blankrows: true }).map(r => r.map(cellText))]);
}

export async function saveWorkbook(sheets, filename) {
  const X = await lib(), wb = X.utils.book_new(), used = new Set();
  sheets.forEach(([name, aoa]) => {
    let n = String(name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Folha', i = 2;
    while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + i++;
    used.add(n.toLowerCase());
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), n);
  });
  downloadBlob(new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

const header = key => { const c = FIELDS[key]; return [...(c.kind === 'weekly' && !c.dateField ? ['Semana (segunda-feira)'] : []), ...c.fields.map(f => f.label)]; };
const rowOf = (key, it) => { const c = FIELDS[key]; return [...(c.kind === 'weekly' && !c.dateField ? [it.week_start || ''] : []), ...c.fields.map(f => it.data?.[f.key] ?? '')]; };
const MENU_KEYS = Object.keys(FIELDS).filter(k => FIELDS[k].fields.length);

const HELP = [
  ['Como usar este modelo'],
  [''],
  ['1. Preencha as folhas que quiser (pode apagar as outras). Uma linha = um registo.'],
  ['2. Não altere os títulos da primeira linha de cada folha nem o nome das folhas.'],
  ['3. Datas no formato AAAA-MM-DD (ex.: 2026-11-09). Horas no formato HH:MM (ex.: 20:30).'],
  ['4. Programa e Anúncios: na coluna «Semana» ponha qualquer data dessa semana; a app usa a segunda-feira.'],
  ['5. Na app: Menu «⋯» > Importar Excel. Escolha o ficheiro, confira o resumo e confirme.'],
  [''],
  ['Também é possível importar o ficheiro original da congregação (ENTRADA, Designações, Contactos, Grupos de Saída, …).'],
];

export const templateSheets = () => [['LEIA-ME', HELP], ...MENU_KEYS.map(k => [FIELDS[k].sheet, [header(k)]])];

// items = todos os registos da base de dados; menus = lista de menus visíveis
export function exportSheets(items, menus) {
  const ok = new Set(menus.map(m => m.key)), out = [];
  MENU_KEYS.filter(k => ok.has(k)).forEach(k => {
    const its = items.filter(i => i.menu_key === k).sort((a, b) => String(a.week_start || '').localeCompare(String(b.week_start || '')) || a.position - b.position);
    out.push([FIELDS[k].sheet, [header(k), ...its.map(i => rowOf(k, i))]]);
  });
  if (ok.has('outras')) items.filter(i => i.menu_key === 'outras').forEach(i => out.push([i.data?.titulo || 'Folha', i.data?.linhas || []]));
  return out;
}
