/**
 * Testes do neuro-ads-manager (node --test). Só dados sintéticos: nenhum teste chama a Graph API de verdade
 * nem lê arquivo de cliente.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nam-test-'));
process.env.NEURO_ADS_HOME = tmp();

const conv = require('../cli/conversao');
const compliance = require('../cli/compliance');
const nomes = require('../cli/nomes');
const perfis = require('../cli/perfis');
const auditoria = require('../cli/auditoria');
const alertas = require('../cli/alertas');
const relatorio = require('../cli/relatorio');
const operacao = require('../cli/operacao');
const util = require('../cli/util');
const { MetaClient, redact, usagePct } = require('../cli/meta');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const snapshot = () => JSON.parse(fs.readFileSync(path.join(FIX, 'snapshot.json'), 'utf8'));
/** Perfil fictício (escritório de advocacia de exemplo) por cima do `modelo`; metas e limites inventados. */
const exemplo = () => perfis.deepMerge(perfis.resolve('modelo'), {
  id: 'exemplo',
  nome: 'Escritório Exemplo',
  segmento: 'advocacia',
  kpi: { nome_resultado: 'Leads', resultado: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'], cpr_alvo: 50 },
  regras_decisao: { pausar: { cpr_acima: 80, gasto_min: 100 }, congelar: { frequencia_acima: 2.5 }, escalar: { cpr_ate: 40, dias: 3, aumento_pct: 20, intervalo_h: 72 }, alerta_cpr_geral: 50 },
  limites: { frequencia_max: 2.5 },
  compliance: { regras: ['oab', 'meta_politicas', 'lgpd'] },
  nomenclatura: { separador: ' | ', campanha: 'ACME | {frente} | {objetivo} | {destino} | {mes}', valores: { frente: ['JURIDICO'], destino: ['FORM', 'SITE', 'WA'] } },
});

test('telefone brasileiro vira E.164 só com dígitos', () => {
  assert.equal(conv.normalizePhone('(71) 98888-0001'), '5571988880001');
  assert.equal(conv.normalizePhone('071 98888-0001'), '5571988880001');
  assert.equal(conv.normalizePhone('+55 71 98888-0001'), '5571988880001');
  assert.equal(conv.normalizePhone('123'), '');
});

test('e-mail e nome são normalizados antes do hash; dado cru não sai', () => {
  const a = conv.analyze(fs.readFileSync(path.join(FIX, 'conversoes.csv'), 'utf8'), { now: Date.parse('2026-11-08T12:00:00Z') });
  const first = a.rows[0];
  assert.equal(first.user_data.em, sha('maria.teste@example.com'));
  assert.equal(first.user_data.fn, sha('maria'));
  assert.equal(first.user_data.st, sha('ba'));
  assert.equal(first.user_data.country, sha('br'));
  const csv = conv.hashedCsv(a);
  assert.doesNotMatch(csv, /example\.com|Maria|98888/);
});

test('regras de retenção da CAPI: 7 dias fora de physical_store, 62 dias, sem chave', () => {
  const a = conv.analyze(fs.readFileSync(path.join(FIX, 'conversoes.csv'), 'utf8'), { now: Date.parse('2026-11-08T12:00:00Z') });
  assert.equal(a.total, 5);
  assert.equal(a.valid, 3);
  const byLine = Object.fromEntries(a.rows.map((r) => [r.line, r.problems]));
  assert.ok(byLine[4].some((p) => /chave de correspondência/.test(p)));
  assert.equal(byLine[5].length, 0, 'physical_store com 38 dias segue');
  assert.ok(byLine[6].some((p) => /7 dias/.test(p)));
});

test('event_id gerado é estável e o histórico bloqueia reenvio', () => {
  const text = fs.readFileSync(path.join(FIX, 'conversoes.csv'), 'utf8');
  const now = Date.parse('2026-11-08T12:00:00Z');
  const a = conv.analyze(text, { now });
  const b = conv.analyze(text, { now });
  assert.equal(a.rows[0].event.event_id, b.rows[0].event.event_id);
  const c = conv.analyze(text, { now, excludeIds: new Set([a.rows[0].event.event_id]) });
  assert.ok(c.rows[0].problems.some((p) => /já enviado/.test(p)));
});

test('payload da CAPI: hashes em lista, test_event_code, custom_data do CRM', () => {
  const a = conv.analyze(fs.readFileSync(path.join(FIX, 'conversoes.csv'), 'utf8'), { now: Date.parse('2026-11-08T12:00:00Z'), leadEventSource: 'GoHighLevel' });
  const [p] = conv.capiPayloads(a, { testEventCode: 'TEST1' });
  assert.equal(p.test_event_code, 'TEST1');
  assert.equal(p.data.length, 3);
  const ev = p.data[0];
  assert.ok(Array.isArray(ev.user_data.em));
  assert.equal(ev.custom_data.event_source, 'crm');
  assert.equal(ev.custom_data.currency, 'BRL');
  assert.equal(ev.custom_data.value, 1500);
});

test('compliance OAB acha promessa, gratuidade e captação, e aceita o disclaimer', () => {
  const bad = compliance.check('Garantimos sua causa! Análise gratuita. Ligue já.', ['oab']);
  const ids = bad.achados.map((x) => x.regra);
  assert.ok(ids.includes('promessa_resultado'));
  assert.ok(ids.includes('preco_gratuidade'));
  assert.ok(ids.includes('captacao_urgencia'));
  const good = compliance.check('Entenda as regras. Publicidade jurídica informativa. Cada caso exige análise individual. Sem garantia de resultado. OAB/BA', ['oab']);
  assert.equal(good.achados.length, 0);
  assert.equal(good.obrigatorios.length, 0);
});

test('compliance ECA e Meta: culpa dos pais e atributo financeiro', () => {
  const r = compliance.check('O futuro dele depende só de você.\nRenegocie sua dívida hoje.', ['eca_lgpd', 'meta_politicas']);
  const ids = r.achados.map((x) => x.regra);
  assert.ok(ids.includes('culpa_medo_pais'));
  assert.ok(ids.includes('atributo_financeiro'));
});

test('limites de copy: título e primeira linha', () => {
  const text = 'x'.repeat(130) + '\nresto';
  const r = compliance.lengthChecks(compliance.check(text, ['estetica_tatuagem']), text, { titulo: 'y'.repeat(41) });
  const ids = r.achados.map((x) => x.regra);
  assert.ok(ids.includes('titulo'));
  assert.ok(ids.includes('primeira_linha'));
});

test('nomenclatura: gera e valida pelo modelo do perfil', () => {
  const model = nomes.modelFor(perfis.resolve('modelo'));
  const name = nomes.build(model, 'campanha', { cliente: 'Acme', canal: 'WA', objetivo: 'Leads', segmento: 'Geral', mes: '2026-11' });
  assert.equal(name, 'ACME | WA | LEADS | GERAL | 2026-11');
  assert.ok(nomes.check(model, 'campanha', name).ok);
  assert.equal(nomes.check(model, 'campanha', 'Campanha qualquer').ok, false);
  assert.throws(() => nomes.build(model, 'campanha', { canal: 'WA' }), /Faltam campos/);
  const proprio = nomes.modelFor(exemplo());
  assert.ok(nomes.check(proprio, 'campanha', 'ACME | JURIDICO | LEADS | FORM | 2026-11').ok);
});

test('perfis da skill não têm IDs nem segredos, e o validador recusa', () => {
  assert.deepEqual(Object.keys(perfis.builtins()), ['modelo'], 'a skill só traz o modelo genérico');
  for (const [id, p] of Object.entries(perfis.builtins())) assert.deepEqual(perfis.validate({ ...p, id }), [], id);
  const errs = perfis.validate({ id: 'x1', nome: 'X', segmento: 'geral', conta: 'act_1234567890' });
  assert.ok(errs.some((e) => /ID de conta/.test(e)));
});

test('auditoria acha copy de risco, aprendizado limitado e otimização para clique', () => {
  const r = auditoria.audit(snapshot(), exemplo());
  const titles = r.achados.map((f) => f.titulo);
  assert.ok(titles.some((t) => /compliance/.test(t)));
  assert.ok(titles.some((t) => /aprendizado limitado/.test(t)));
  assert.ok(titles.some((t) => /clique/.test(t)));
  assert.equal(typeof r.nota, 'number');
  const compl = r.achados.find((f) => f.area === 'compliance');
  assert.ok(!compl.itens.some((i) => /EXPLICATIVO/.test(i)), 'o anúncio com disclaimer não é falso positivo');
});

test('auditoria sem insights não inventa nota', () => {
  const s = snapshot();
  s.insights = { campaign: [], adset: [], ad: [] };
  const r = auditoria.audit(s, {});
  assert.equal(r.nota, null);
});

test('alertas seguem as regras de decisão do perfil', () => {
  const a = alertas.alerts(snapshot(), exemplo());
  assert.ok(a.pausar.some((x) => x.nome === 'perfil 1'));
  assert.ok(a.congelar.length >= 1);
  assert.ok(a.conta.some((m) => /Limite de gasto/.test(m)));
});

test('relatório compara com o período anterior e escapa o separador dos nomes', () => {
  const r = relatorio.build(snapshot(), exemplo());
  assert.match(r.markdown, /comparado com 2026-10-25/);
  assert.match(r.markdown, /ACME \\\| JURIDICO/);
  assert.equal(r.totals.results, 30);
});

test('relatório a partir do CSV do Gerenciador de Anúncios', () => {
  const { fromAdsManagerCsv } = require('../cli/metricas');
  const csv = 'Nome da campanha;Valor usado (BRL);Impressões;Resultados;Cliques no link\nCamp A;1.234,56;10.000;12;150\n';
  const r = fromAdsManagerCsv(csv);
  assert.equal(r.rows[0].__csv.spend, 1234.56);
  assert.equal(r.rows[0].__csv.impressions, 10000);
});

test('operação: plano, validação, aprovação amarrada ao hash e ledger', () => {
  const dir = operacao.create('pausar anúncios sem resultado', { pasta: tmp(), perfil: 'exemplo' });
  const plan = operacao.load(dir);
  assert.equal(operacao.validate(plan).ok, false, 'o modelo vazio não valida');
  plan.motivo = 'Gasto sem resultado';
  plan.operacoes = [
    { id: 'op-01', bloco: 'A', entidade: 'ad', nome: 'pausar perfil 1', metodo: 'POST', caminho: 'a4', antes: { status: 'ACTIVE' }, depois: { status: 'PAUSED' }, rollback: { status: 'ACTIVE' }, depende_de: [] },
    { id: 'op-02', bloco: 'A', entidade: 'adset', nome: 'reduzir s2', metodo: 'POST', caminho: 's2', antes: { daily_budget: 10000 }, depois: { daily_budget: 8000 }, rollback: { daily_budget: 10000 }, depende_de: ['op-01'] },
    { id: 'op-03', bloco: 'A', entidade: 'adset', nome: 'escalar s1', metodo: 'POST', caminho: 's1', antes: { daily_budget: 50000 }, depois: { daily_budget: 60000 }, rollback: { daily_budget: 50000 }, depende_de: [] },
  ];
  fs.writeFileSync(path.join(dir, 'plano.json'), JSON.stringify(plan, null, 2));
  const v = operacao.validate(plan);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.throws(() => operacao.record(dir, { op: 'op-01', estado: 'request_started' }), /aprovação/);
  operacao.approve(dir, { aprovador: 'Responsável', mensagem: 'Pode pausar o perfil 1 e ajustar os orçamentos.' });
  assert.equal(operacao.status(dir).aprovado, true);
  operacao.record(dir, { op: 'op-01', estado: 'request_started' });
  assert.throws(() => operacao.record(dir, { op: 'op-01', estado: 'request_started' }), /não repita/);
  plan.operacoes[2].depois.daily_budget = 70000;
  fs.writeFileSync(path.join(dir, 'plano.json'), JSON.stringify(plan, null, 2));
  const st = operacao.status(dir);
  assert.equal(st.aprovado, false);
  assert.equal(st.alterado_depois_da_aprovacao, true);
  assert.ok(st.erros.some((e) => /limite de 20%/.test(e)));
});

test('operação recusa DELETE e redução depois de aumento', () => {
  const plan = { escopo: 'x', motivo: 'y', regras: { reducoes_antes_de_aumentos: true, escala_max_pct: 20 }, operacoes: [
    { id: 'a', metodo: 'POST', caminho: '1', antes: { daily_budget: 100 }, depois: { daily_budget: 110 }, rollback: { daily_budget: 100 } },
    { id: 'b', metodo: 'POST', caminho: '2', antes: { daily_budget: 100 }, depois: { daily_budget: 90 }, rollback: { daily_budget: 100 } },
    { id: 'c', metodo: 'DELETE', caminho: '3' },
  ] };
  const v = operacao.validate(plan);
  assert.ok(v.errors.some((e) => /DELETE/.test(e)));
  assert.ok(v.errors.some((e) => /reduções primeiro/.test(e)));
});

test('cliente da Graph API: pagina, tira o token da URL, repete erro transitório e oculta o token', async () => {
  const calls = [];
  const pages = [
    { status: 200, body: { data: [{ id: 1 }], paging: { next: 'https://graph.facebook.com/v27.0/act_1/campaigns?access_token=EAAsecretsecretsecretsecret123&after=X' } } },
    { status: 500, body: { error: { code: 2, message: 'temporário', is_transient: true } } },
    { status: 200, body: { data: [{ id: 2 }] } },
  ];
  const fetch = async (u, init) => {
    calls.push({ url: String(u), auth: init.headers.Authorization });
    const p = pages.shift();
    return { ok: p.status < 400, status: p.status, headers: new Map([['x-ad-account-usage', JSON.stringify({ acc_id_util_pct: 10 })]]), json: async () => p.body };
  };
  const c = new MetaClient({ token: 'EAAtesttesttesttesttest123', fetch, maxRetries: 2 });
  c.request = c.request.bind(c);
  const sleep = global.setTimeout;
  global.setTimeout = (fn) => sleep(fn, 0);
  try {
    const all = await c.all('act_1/campaigns', { fields: 'id' });
    assert.deepEqual(all.map((x) => x.id), [1, 2]);
  } finally { global.setTimeout = sleep; }
  assert.ok(calls.every((x) => !/access_token/.test(x.url)), 'token nunca vai na URL');
  assert.equal(redact('erro access_token=EAAabcdefghijklmnopqrstuvwxyz'), 'erro access_token=***');
  assert.equal(usagePct(new Map([['x-app-usage', JSON.stringify({ call_count: 80 })]])), 80);
});

test('CLI recusa ler .env', () => {
  assert.throws(() => util.assertNotSecret('/x/.env'), /segredos/);
  assert.throws(() => util.assertNotSecret('/x/.env.act_1.bak'), /segredos/);
  assert.doesNotThrow(() => util.assertNotSecret('/x/.env.example'));
});

test('provedor do Neuro Harness registra a skill e os comandos', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'harness', 'index.mjs')).href);
  let factory;
  mod.apply({ skills: { registerProvider: (f) => { factory = f; } } });
  const provider = factory({ signal: new AbortController().signal, invalidate() {} });
  const list = await provider.list({});
  const names = list.map((c) => c.name);
  assert.ok(names.includes('neuro-ads-manager'));
  for (const c of ['auditar', 'planejar', 'relatorio', 'criativos', 'conversao']) assert.ok(names.includes(`neuro-ads-${c}`), c);
  for (const c of list) assert.match(c.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const skill = await provider.get(list.find((c) => c.name === 'neuro-ads-manager'), {});
  assert.doesNotMatch(skill.content, /^---/);
  const cmd = await provider.get(list.find((c) => c.name === 'neuro-ads-auditar'), {});
  assert.doesNotMatch(cmd.content, /\$ARGUMENTS/);
  assert.equal(list.find((c) => c.name === 'neuro-ads-auditar').invocation.modelInvocable, false);
});
