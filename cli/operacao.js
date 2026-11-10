/**
 * Plano de mudança na conta (pasta `operacoes/`, com plano, aprovação e ledger):
 *
 *   operacoes/AAAA-MM-DD-<escopo>/
 *     README.md       o que muda, por quê, como reverter
 *     plano.json      operações canônicas (antes/depois/rollback), regras e gates
 *     aprovacao.json  aprovador, mensagem literal e SHA-256 do plano aprovado
 *     ledger.jsonl    um registro por passo de cada operação (append-only)
 *
 * O plugin não escreve na conta nesta versão: ele monta, valida, registra a aprovação e o andamento.
 * A execução fica com a ferramenta do projeto (ou com o Gerenciador), e só depois da aprovação válida.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, readJson, toNumber } = require('./util');

const ESTADOS = ['prepared', 'request_started', 'response_received', 'verified', 'outcome_unknown', 'verification_failed', 'rolled_back', 'skipped'];
const METODOS = ['POST', 'GET'];

/** JSON canônico (chaves ordenadas) para o hash não mudar com a formatação. */
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const planHash = (plan) => crypto.createHash('sha256').update(canonical(plan)).digest('hex');

function slugify(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function create(escopo, opts = {}) {
  if (!escopo) throw new CliError('Informe o escopo: neuro-ads-manager operacao nova <escopo> (ex.: pausar-anuncios-sem-resultado).', 2);
  const date = (opts.data || new Date().toISOString()).slice(0, 10);
  const dir = path.resolve(opts.pasta || 'operacoes', `${date}-${slugify(escopo)}`);
  if (fs.existsSync(dir)) throw new CliError(`Já existe: ${dir}. Planos não são sobrescritos; crie outro escopo ou uma versão (-v2).`, 2);
  fs.mkdirSync(dir, { recursive: true });
  const plan = {
    versao: '1.0.0',
    escopo,
    perfil: opts.perfil || null,
    criado_em: new Date().toISOString(),
    conta: { env: opts.contaEnv || 'META_AD_ACCOUNT_ID', nome_esperado: null, moeda_esperada: opts.moeda || 'BRL' },
    motivo: '',
    evidencias: [],
    regras: { criar_pausado: true, nunca_excluir: true, reducoes_antes_de_aumentos: true, escala_max_pct: 20, escala_intervalo_h: 72, ler_antes_e_depois: true, sem_retry_de_escrita_incerta: true },
    gates: [],
    operacoes: [
      {
        id: 'op-01',
        bloco: 'A',
        entidade: 'adset | campaign | ad | creative | audience',
        nome: '',
        metodo: 'POST',
        caminho: '<id do objeto>',
        antes: {},
        depois: {},
        rollback: {},
        depende_de: [],
        motivo: '',
      },
    ],
  };
  fs.writeFileSync(path.join(dir, 'plano.json'), JSON.stringify(plan, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'README.md'), readme(escopo, date));
  fs.writeFileSync(path.join(dir, 'ledger.jsonl'), '');
  return dir;
}

function readme(escopo, date) {
  return `# Operação: ${escopo} (${date})

> **Altera produção.** Nada roda antes de \`aprovacao.json\` válido para o hash atual do \`plano.json\`.

## O que muda e por quê
<!-- Uma frase por operação; a evidência (relatório, auditoria, alertas) vai em plano.json → evidencias. -->

## Como executar
<!-- Ferramenta e comando exatos (CLI do projeto, Gerenciador). Ordem: reduções antes de aumentos. -->

## Como verificar
<!-- Leitura depois de cada escrita (GET) e o que precisa bater. -->

## Como reverter
<!-- O rollback de cada operação está em plano.json; diga aqui a ordem e quem executa. -->

## Registro
- Aprovação: \`neuro-ads-manager operacao aprovar <pasta> --aprovador "<nome>" --mensagem "<texto literal>"\`
- Andamento: \`neuro-ads-manager operacao registrar <pasta> --op <id> --estado <estado>\`
`;
}

function load(dir) {
  const file = path.join(dir, 'plano.json');
  if (!fs.existsSync(file)) throw new CliError(`Não achei ${file}.`, 2);
  return readJson(file);
}

/** Validação do plano: estrutura, regras de segurança e orçamento. */
function validate(plan) {
  const errors = [];
  const warnings = [];
  if (!plan.escopo) errors.push('escopo vazio');
  if (!plan.motivo) warnings.push('motivo vazio: diga por que a mudança é necessária');
  if (!Array.isArray(plan.operacoes) || !plan.operacoes.length) errors.push('nenhuma operação');
  const ids = new Set();
  let increase = 0; let decrease = 0; let firstIncrease = null; let lastDecrease = null;
  (plan.operacoes || []).forEach((op, i) => {
    const tag = op.id || `#${i + 1}`;
    if (!op.id) errors.push(`${tag}: sem id`);
    if (ids.has(op.id)) errors.push(`${tag}: id repetido`);
    ids.add(op.id);
    const m = String(op.metodo || '').toUpperCase();
    if (m === 'DELETE') errors.push(`${tag}: DELETE não é permitido (reverta por status: PAUSED/ARCHIVED)`);
    else if (!METODOS.includes(m)) errors.push(`${tag}: método ${op.metodo || '(vazio)'} inválido`);
    if (!op.caminho || /</.test(op.caminho)) errors.push(`${tag}: caminho (id do objeto) não preenchido`);
    if (m === 'POST' && (!op.depois || !Object.keys(op.depois).length)) errors.push(`${tag}: "depois" vazio`);
    if (m === 'POST' && (!op.rollback || !Object.keys(op.rollback).length)) errors.push(`${tag}: sem rollback`);
    if (m === 'POST' && (!op.antes || !Object.keys(op.antes).length) && !/cria|create|novo|new/i.test(`${op.nome} ${op.motivo}`)) warnings.push(`${tag}: "antes" vazio (leia o estado atual e registre)`);
    const depois = op.depois || {};
    if (depois.status && depois.status === 'ACTIVE' && /cria|create|novo|new/i.test(`${op.nome} ${op.motivo}`) && plan.regras && plan.regras.criar_pausado) errors.push(`${tag}: objeto novo deve nascer PAUSED (ative em outra operação, depois da revisão)`);
    for (const k of ['daily_budget', 'lifetime_budget']) {
      const a = toNumber((op.antes || {})[k]);
      const d = toNumber(depois[k]);
      if (a !== null && d !== null && a > 0) {
        const pct = ((d - a) / a) * 100;
        if (d > a) { increase += d - a; if (firstIncrease === null) firstIncrease = i; }
        if (d < a) { decrease += a - d; lastDecrease = i; }
        const max = (plan.regras && plan.regras.escala_max_pct) || 20;
        if (pct > max + 1e-9) errors.push(`${tag}: aumento de ${pct.toFixed(0)}% em ${k} passa do limite de ${max}% (escale em etapas, com ${plan.regras.escala_intervalo_h || 72} h entre elas)`);
      }
    }
    for (const dep of op.depende_de || []) if (!ids.has(dep) && !(plan.operacoes || []).some((o) => o.id === dep)) errors.push(`${tag}: depende de ${dep}, que não existe`);
  });
  if (plan.regras && plan.regras.reducoes_antes_de_aumentos && firstIncrease !== null && lastDecrease !== null && lastDecrease > firstIncrease) errors.push('há redução de orçamento depois de um aumento: coloque as reduções primeiro');
  if (plan.orcamento_soma_constante && Math.abs(increase - decrease) > 1) errors.push(`a soma dos orçamentos muda (${increase} a mais × ${decrease} a menos, em centavos) e o plano declara soma constante`);
  for (const g of plan.gates || []) if (!g.status || g.status !== 'ok') warnings.push(`gate pendente: ${g.id || g.nome || JSON.stringify(g)}`);
  return { ok: !errors.length, errors, warnings, hash: planHash(plan) };
}

function approve(dir, { aprovador, mensagem }) {
  if (!aprovador || !mensagem) throw new CliError('Informe --aprovador e --mensagem (o texto literal com que a pessoa aprovou).', 2);
  const plan = load(dir);
  const v = validate(plan);
  if (!v.ok) throw new CliError('O plano tem erros; corrija antes de aprovar:\n  - ' + v.errors.join('\n  - '), 2);
  const file = path.join(dir, 'aprovacao.json');
  if (fs.existsSync(file)) {
    const prev = readJson(file);
    if (prev.plano_sha256 === v.hash) throw new CliError('Este plano já está aprovado.', 2);
    fs.renameSync(file, path.join(dir, `aprovacao.${prev.plano_sha256.slice(0, 8)}.json`));
  }
  const approval = { aprovador, mensagem, plano_sha256: v.hash, aprovado_em: new Date().toISOString(), extensao_de_escopo: false };
  fs.writeFileSync(file, JSON.stringify(approval, null, 2) + '\n');
  return approval;
}

function record(dir, { op, estado, nota }) {
  if (!ESTADOS.includes(estado)) throw new CliError(`Estado inválido: ${estado}. Use: ${ESTADOS.join(', ')}`, 2);
  const plan = load(dir);
  if (!(plan.operacoes || []).some((o) => o.id === op)) throw new CliError(`Operação ${op} não está no plano.`, 2);
  const st = status(dir);
  if (!st.aprovado && estado !== 'skipped') throw new CliError('Plano sem aprovação válida para o hash atual: nada pode ser executado.', 2);
  const last = st.operacoes[op];
  if (last && ['request_started', 'outcome_unknown'].includes(last) && estado === 'request_started') throw new CliError(`${op} está em ${last}: não repita a escrita. Leia o estado na conta (GET) e registre response_received/verified ou outcome_unknown.`, 2);
  const entry = { em: new Date().toISOString(), op, estado, plano_sha256: st.hash, ...(nota ? { nota } : {}) };
  fs.appendFileSync(path.join(dir, 'ledger.jsonl'), JSON.stringify(entry) + '\n');
  return entry;
}

function status(dir) {
  const plan = load(dir);
  const v = validate(plan);
  const file = path.join(dir, 'aprovacao.json');
  const approval = fs.existsSync(file) ? readJson(file) : null;
  const ledgerFile = path.join(dir, 'ledger.jsonl');
  const entries = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const ops = {};
  for (const o of plan.operacoes || []) ops[o.id] = null;
  for (const e of entries) ops[e.op] = e.estado;
  return {
    pasta: dir,
    escopo: plan.escopo,
    hash: v.hash,
    valido: v.ok,
    erros: v.errors,
    avisos: v.warnings,
    aprovacao: approval,
    aprovado: !!(approval && approval.plano_sha256 === v.hash),
    alterado_depois_da_aprovacao: !!(approval && approval.plano_sha256 !== v.hash),
    operacoes: ops,
  };
}

module.exports = { create, load, validate, approve, record, status, planHash, canonical, ESTADOS };
