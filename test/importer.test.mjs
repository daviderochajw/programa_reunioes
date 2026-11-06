import { analyze, parseDate, mondayISO } from '../src/importer.js';
import { matchName, waPhone, tokens } from '../src/names.js';
import { buildICS, meetingWhen } from '../src/ics.js';
import assert from 'node:assert/strict';

// --- datas
assert.equal(parseDate('2026-11-05'), '2026-11-05');
assert.equal(parseDate('5/11/2026'), '2026-11-05');
assert.equal(parseDate('32/13/2026'), '');
assert.equal(mondayISO('2026-11-05'), '2026-11-02');
assert.equal(mondayISO('2026-11-08'), '2026-11-02');

// --- programa (grelha original): 2 semanas nas colunas 1-2 e 4-5
const g = []; const set = (r, c, v) => { (g[r] ||= [])[c] = v; };
set(0, 3, '2026-11-02'); set(2, 1, 'Semana'); set(2, 4, 'Semana');
set(3, 1, '2 a 8 de novembro'); set(4, 1, 'Presidente'); set(4, 2, 'Ana Silva'); set(4, 5, 'Rui Costa');
set(5, 2, 'Pedro Gomes'); set(8, 1, 'João Lopes'); set(9, 1, '1. Discurso (10 min)');
set(15, 1, 'Maria A'); set(15, 2, 'Sofia B'); set(16, 1, '4. Iniciar conversas (3 min)');
set(36, 2, 'Orador X'); set(37, 2, 'Porto'); set(38, 1, 'Tema Y'); set(42, 2, 'Luís Z');
const sheets = [['ENTRADA', g]];
// --- saídas / testemunho
sheets.push(['Saídas', [['Data', 'Hora', 'Local'], ['2026-11-07', '9:30', 'Salão', 'Todos', 'Rui Costa', 'A ser designada'], ['NOTA', 'x']]]);
sheets.push(['Testemunho público', [['Data'], ['5/11/2026', '10:00', 'Braga Parque', 'Ana & Rui']]]);
// --- designações
const r0 = ['', 'Irmãos', '', '', '', '', '', 'Designações', '', 'Contactos', ''];
const r1 = ['', 'Idade', 'Ano de batismo', 'OBS', 'Privilégio', 'Publicador', 'CS', 'Micros', 'Tribuna', 'Telemóvel', 'Email'];
sheets.push(['Designações', [r0, r1, ['Ana Silva', '40', '2000', '', 'A', 'Pub/B', '', '✓', '', '912345678', 'a@x.pt'], ['Rui Costa', '30', '2010', '', 'SM', 'Pub/B', '', '', '✓', '', '']]]);
// --- grupos + batismos
const gg = [['Centro 1', '', '', '', '', '', '', '', '', '', '', '', 'Novos publicadores', '', 'mar-26'], ['', 'Grupo 1', 'Grupo 2'], ['', 'Ana - SG', 'Rui'], ['', 'Rui - ASG', ''], ['', 'Zé', '']];
gg[2][12] = 'Novo Pub'; gg[2][14] = 'mar-26';
sheets.push(['Grupos de Saída', gg]);
sheets.push(['Departamentos', [['Dep', 'Resp'], ['Som', 'Luís']]]);
// --- modelo
sheets.push(['Anúncios', [['Semana (segunda-feira)', 'Título', 'Texto'], ['2026-11-04', 'Limpeza', 'Sábado'], ['', 'Sem data', 'x']]]);
sheets.push(['Eventos', [['Tipo', 'Nome', 'Data', 'Data de fim', 'Local', 'Notas'], ['Assembleia', 'AC', '2026-12-05', '', 'Braga', '']]]);

const { blocks, ignored } = analyze(sheets);
const by = m => blocks.filter(b => b.menu === m);
const prog = by('prog')[0];
assert.equal(prog.weeks.join(), '2026-11-02,2026-11-09');
const w1 = prog.rows.filter(r => r.week_start === '2026-11-02').map(r => r.data);
assert.equal(w1[0].responsavel, 'Ana Silva');
assert.equal(w1.find(x => x.parte === 'Discurso').min, '10');
assert.equal(w1.find(x => x.seccao === 'Ministério').ajudante, 'Sofia B');
assert.equal(w1.find(x => x.parte === 'Tema Y').notas, 'Congregação: Porto');
assert.equal(w1.find(x => x.parte === 'Indicadores').responsavel, 'Luís Z');
assert.equal(by('saidas')[0].rows[0].data.hora, '09:30');
assert.equal(by('saidas')[0].rows[0].week_start, '2026-11-02');
assert.equal(by('testemunho')[0].rows[0].data.publicador, 'Ana & Rui');
assert.equal(by('irmaos')[0].rows.length, 2);
assert.equal(by('irmaos')[0].rows[0].data.tarefas, 'Micros');
assert.ok(by('resp')[0].rows.some(r => r.data.responsabilidade === 'Tribuna' && r.data.irmaos === 'Rui Costa'));
const gr = by('grupos')[0].rows; assert.equal(gr[0].data.superintendente, 'Ana'); assert.equal(gr[0].data.ajudante, 'Rui');
assert.equal(by('movs')[0].rows[0].data.nome, 'Novo Pub');
assert.equal(by('outras')[0].rows[0].data.linhas[1][1], 'Luís');
assert.equal(by('anuncios')[0].rows.length, 1); assert.match(by('anuncios')[0].warn, /1 linha/);
assert.equal(by('eventos')[0].rows[0].data.nome, 'AC');
console.log('blocos:', blocks.map(b => `${b.menu}:${b.rows.length}`).join(' '), '| ignoradas:', ignored.join() || '-');

// --- nomes
const known = [{ k: 'ana silva' }, { k: 'rui manuel costa' }, { k: 'maria joao santos' }];
assert.equal(matchName('Rui Costa', known).k, 'rui manuel costa');
assert.equal(matchName('Ana', known).k, 'ana silva');
assert.equal(matchName('Zé', known), null);
assert.deepEqual(tokens('A & B / C'), ['A', 'B', 'C']);
assert.equal(waPhone('912 345 678'), '351912345678');
assert.equal(waPhone('+44 7700'), '447700');

// --- ics
const w = meetingWhen('2026-11-02', false, { d1: 1, t1: '20:30', d2: 6, t2: '15:00' });
assert.equal(w.date, '2026-11-02'); assert.equal(meetingWhen('2026-11-02', true, { d1: 1, t1: '20:30', d2: 6, t2: '15:00' }).date, '2026-11-07');
const ics = buildICS('Teste', [{ uid: 'a', summary: 'Tesouros', description: 'x, y', ...w }]);
assert.match(ics, /DTSTART:20261102T203000/); assert.match(ics, /DTEND:20261102T221500/);
console.log('todos os testes passaram');
