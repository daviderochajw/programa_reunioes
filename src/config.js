// Campos do formulário de cada menu. Para acrescentar um campo, basta acrescentar uma linha aqui
// (os dados ficam guardados em JSON, não é preciso mexer na base de dados).
//  kind      weekly = dados por semana · list = lista · sheet = folha de Excel mostrada como tabela
//  title     campo usado como título do cartão
//  group     campo que agrupa os cartões (opcional)
//  dateField campo de data que decide a semana (menus semanais com datas)
//  sheet     nome da folha no ficheiro Excel (modelo / exportação)
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const SECCOES = ['Geral', 'Tesouros', 'Ministério', 'Viver como Cristãos', 'Fim de semana', 'Equipa'];
export const EVENT_TYPES = ['Assembleia', 'Congresso', 'Memorial', 'Evento', 'EMR', 'EAC', 'Visita do superintendente de circuito'];

export const FIELDS = {
  prog: {
    kind: 'weekly', sheet: 'Programa', title: 'parte', group: 'seccao',
    fields: [
      { key: 'seccao', label: 'Secção', type: 'select', options: SECCOES },
      { key: 'parte', label: 'Parte / título', required: true },
      { key: 'min', label: 'Minutos', type: 'number' },
      { key: 'responsavel', label: 'Responsável' },
      { key: 'ajudante', label: 'Ajudante / sala' },
      { key: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  saidas: {
    kind: 'weekly', sheet: 'Saídas', title: 'local', dateField: 'data',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'hora', label: 'Hora', type: 'time' },
      { key: 'local', label: 'Local', required: true },
      { key: 'grupos', label: 'Grupos' },
      { key: 'dirigente', label: 'Dirigente' },
      { key: 'fonte', label: 'Fonte de matéria' },
    ],
  },
  testemunho: {
    kind: 'weekly', sheet: 'Testemunho público', title: 'local', dateField: 'data',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'hora', label: 'Hora', type: 'time' },
      { key: 'local', label: 'Local', required: true },
      { key: 'publicador', label: 'Publicador (ou evento)' },
    ],
  },
  anuncios: {
    kind: 'weekly', sheet: 'Anúncios', title: 'titulo',
    fields: [
      { key: 'titulo', label: 'Título', required: true },
      { key: 'texto', label: 'Texto', type: 'textarea' },
    ],
  },
  eventos: {
    kind: 'list', sheet: 'Eventos', title: 'nome', sortBy: 'data', upcoming: true,
    fields: [
      { key: 'tipo', label: 'Tipo', type: 'select', options: EVENT_TYPES },
      { key: 'nome', label: 'Nome', required: true },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'fim', label: 'Data de fim', type: 'date' },
      { key: 'local', label: 'Local' },
      { key: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  contactos: {
    kind: 'list', sheet: 'Contactos', title: 'nome',
    fields: [
      { key: 'nome', label: 'Nome', required: true },
      { key: 'grupo', label: 'Grupo' },
      { key: 'sexo', label: 'Sexo' },
      { key: 'nascimento', label: 'Nascimento' },
      { key: 'batismo', label: 'Batismo' },
      { key: 'telemovel', label: 'Telemóvel', type: 'tel' },
      { key: 'telefone', label: 'Telefone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'morada', label: 'Morada' },
      { key: 'privilegios', label: 'Privilégios' },
      { key: 'emergencia', label: 'Contacto de emergência' },
      { key: 'emergencia2', label: '2.º contacto de emergência' },
    ],
  },
  irmaos: {
    kind: 'list', sheet: 'Irmãos', title: 'nome',
    fields: [
      { key: 'nome', label: 'Nome', required: true },
      { key: 'idade', label: 'Idade' },
      { key: 'batismo', label: 'Ano de batismo' },
      { key: 'privilegio', label: 'Privilégio', type: 'select', options: ['', 'A', 'SM'] },
      { key: 'publicador', label: 'Publicador', type: 'select', options: ['', 'Pub/B', 'Pub N/Bat'] },
      { key: 'cs', label: 'CS' },
      { key: 'obs', label: 'Observações' },
      { key: 'tarefas', label: 'Designações', type: 'textarea' },
      { key: 'telemovel', label: 'Telemóvel', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
  },
  resp: {
    kind: 'list', sheet: 'Responsabilidades', title: 'responsabilidade', group: 'grupo',
    fields: [
      { key: 'responsabilidade', label: 'Responsabilidade', required: true },
      { key: 'grupo', label: 'Secção' },
      { key: 'irmaos', label: 'Irmãos', type: 'textarea' },
      { key: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  grupos: {
    kind: 'list', sheet: 'Grupos', title: 'grupo', group: 'centro',
    fields: [
      { key: 'grupo', label: 'Grupo', required: true },
      { key: 'centro', label: 'Centro de saída' },
      { key: 'superintendente', label: 'Superintendente' },
      { key: 'ajudante', label: 'Ajudante' },
      { key: 'membros', label: 'Membros', type: 'textarea' },
    ],
  },
  movs: {
    kind: 'list', sheet: 'Novos e batismos', title: 'nome',
    fields: [
      { key: 'nome', label: 'Nome', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Novo publicador', 'Batismo', 'Outro'] },
      { key: 'data', label: 'Data (mês/ano)' },
      { key: 'notas', label: 'Notas / de que congregação', type: 'textarea' },
    ],
  },
  outras: { kind: 'sheet', sheet: 'Outras folhas', title: 'titulo', fields: [] },
};

// Menus pré-selecionados quando o administrador aprova alguém (acesso base)
export const DEFAULT_MENUS = ['prog', 'saidas', 'testemunho', 'anuncios', 'eventos'];

// Perfis rápidos (atalhos no ecrã do administrador), como no painel original
export const PROFILES = [
  { id: 'P', label: 'Publicador', menus: DEFAULT_MENUS },
  { id: 'SM', label: 'Servo ministerial', menus: [...DEFAULT_MENUS, 'irmaos', 'resp', 'grupos', 'movs'] },
  { id: 'A', label: 'Ancião (tudo)', menus: Object.keys(FIELDS) },
];

export const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const DEFAULT_MEETINGS = { d1: 1, t1: '20:30', d2: 6, t2: '15:00' };
export { DIAS };
