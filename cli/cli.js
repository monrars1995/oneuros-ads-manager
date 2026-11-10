#!/usr/bin/env node
/**
 * CLI do neuro-ads-manager: gestor de tráfego pago para agentes de IA.
 *
 * Só lê a conta de anúncios (Graph API, GET). Audita, relata, confere conversão e compliance, gera nomes e
 * monta planos de mudança com hash e aprovação. Nunca lê .env nem imprime tokens.
 */
const fs = require('fs');
const path = require('path');
const util = require('./util');
const { C, CliError, parseArgs, readJson, writeFile, readText, assertNotSecret, resolvePeriod, previousPeriod } = util;

const VERSION = '0.2.0';
const REPO = 'monrars1995/oneuros-ads-manager';

function out(s = '') { process.stdout.write(s + '\n'); }
function err(s = '') { process.stderr.write(s + '\n'); }

function banner() {
  out(`${C.gold}${C.bold}neuro-ads-manager v${VERSION}${C.reset} ${C.gray}— gestor de tráfego pago (Meta Ads) para agentes de IA${C.reset}`);
}

function help() {
  banner();
  out(`
${C.bold}USO${C.reset}
  neuro-ads-manager <comando> [opções]          ${C.gray}(no Claude Code e no Neuro Harness, com o plugin ativo)${C.reset}
  node cli/cli.js <comando> [opções]            ${C.gray}(a partir de um clone)${C.reset}
  ${C.gray}Referência completa: docs/COMANDOS.md${C.reset}

${C.bold}PERFIS${C.reset}
  ${C.green}perfil${C.reset} listar | mostrar <id> | novo --json <arq> | editar <id> --json <arq> | remover <id> | validar --json <arq>

${C.bold}CONTA (Graph API, só leitura)${C.reset}
  ${C.green}meta conferir${C.reset}  [--perfil <id>] [--conta act_…]          token, conta, status, uso da API
  ${C.green}meta snapshot${C.reset}  [--perfil <id>] [--conta act_…] [--periodo 7d|30d|mes|mes-passado|AAAA-MM-DD:AAAA-MM-DD]
                 [--comparar] [--ativos] [--saida <arq.json>]     estrutura + insights + diário + públicos

${C.bold}ANÁLISE (sobre o snapshot)${C.reset}
  ${C.green}auditar${C.reset}   <snapshot.json> [--perfil <id>] [--saida <md>] [--json]
  ${C.green}alertas${C.reset}   <snapshot.json> [--perfil <id>] [--saida <md>] [--json]  pausar, congelar, escalar (regras do perfil)
  ${C.green}relatorio${C.reset} <snapshot.json | export.csv> [--perfil <id>] [--saida <md>] [--titulo "…"] [--gasto-min <R$>]

${C.bold}CONVERSÃO (CAPI e offline)${C.reset}
  ${C.green}conversao validar${C.reset}    <arquivo.csv> [--evento <nome>] [--origem <action_source>] [--excluir-ids <arq>]
  ${C.green}conversao normalizar${C.reset} <arquivo.csv> --saida <hash.csv>      só hashes SHA-256 e campos do evento
  ${C.green}conversao payload${C.reset}    <arquivo.csv> --saida <payload.json> [--teste <TEST_EVENT_CODE>] [--lote 1000]
  ${C.green}conversao dataset${C.reset}    [<dataset_id>] [--perfil <id>]                  pixel/dataset: último disparo e eventos

${C.bold}COPY E NOMES${C.reset}
  ${C.green}compliance${C.reset} <arquivo|-> [--perfil <id> | --regras oab,meta_politicas] [--titulo "…"] [--json]
  ${C.green}compliance regras${C.reset} [<conjunto>]                                     conjuntos e checklist
  ${C.green}nome gerar${C.reset}   <campanha|conjunto|anuncio> --perfil <id> campo=valor …
  ${C.green}nome validar${C.reset} <campanha|conjunto|anuncio> "<nome>" [--perfil <id>]

${C.bold}MUDANÇAS NA CONTA (plano + aprovação + registro)${C.reset}
  ${C.green}operacao nova${C.reset} <escopo> [--perfil <id>] [--pasta operacoes]
  ${C.green}operacao validar${C.reset} <pasta> | ${C.green}status${C.reset} <pasta>
  ${C.green}operacao aprovar${C.reset} <pasta> --aprovador "<nome>" --mensagem "<texto literal da aprovação>"
  ${C.green}operacao registrar${C.reset} <pasta> --op <id> --estado <prepared|request_started|response_received|verified|outcome_unknown|…>

${C.bold}NEURO HARNESS${C.reset}
  ${C.green}harness instalar${C.reset} [--copiar] [--dry-run] [--perfil-harness neuro] [--base <pasta>] | ${C.green}status${C.reset} | ${C.green}remover${C.reset} [--dry-run]

${C.bold}OUTROS${C.reset}
  ${C.green}status${C.reset}  onde estão a skill, os perfis e a instalação no Harness   ${C.green}version${C.reset}   ${C.green}help${C.reset}

${C.bold}AMBIENTE${C.reset}
  META_ACCESS_TOKEN (ou o token_env do perfil, ou --token-env)   META_AD_ACCOUNT_ID   META_DATASET_ID   META_GRAPH_VERSION (padrão v27.0)
  O CLI nunca lê .env: carregue o ambiente no seu terminal. Use um token de usuário do sistema com ads_read.
`);
}

// ---------- perfil ---------------------------------------------------------------------------------

function loadProfile(id) {
  if (!id) return {};
  const perfis = require('./perfis');
  return perfis.resolve(id);
}

function cmdPerfil(args) {
  const perfis = require('./perfis');
  const [sub = 'listar', id] = args._;
  const o = args;
  if (sub === 'listar') {
    const all = perfis.list();
    for (const [k, p] of Object.entries(all)) out(`${C.green}${k.padEnd(16)}${C.reset} ${String(p.nome || '').padEnd(26)} ${C.gray}${p.segmento || ''} · ${(p.compliance && p.compliance.regras || []).join(', ')} · ${p._origem}${C.reset}`);
    out(`\n${C.gray}Perfis do usuário: ${perfis.USER_DIR}${C.reset}`);
    return 0;
  }
  if (sub === 'mostrar') {
    if (!id) throw new CliError('Uso: perfil mostrar <id>', 2);
    out(JSON.stringify(perfis.resolve(id), null, 2));
    return 0;
  }
  if (sub === 'validar') {
    const p = readJson(o.json || id);
    const e = perfis.validate(p);
    if (e.length) { err('Perfil inválido:\n  - ' + e.join('\n  - ')); return 1; }
    out('Perfil válido.');
    return 0;
  }
  if (sub === 'novo' || sub === 'editar') {
    const file = o.json;
    if (!file) throw new CliError(`Uso: perfil ${sub} ${sub === 'editar' ? '<id> ' : ''}--json <arquivo>`, 2);
    let p = readJson(file);
    if (sub === 'editar') {
      if (!id) throw new CliError('Uso: perfil editar <id> --json <arquivo com os campos que mudam>', 2);
      p = perfis.deepMerge(perfis.resolve(id), { ...p, id });
    } else if (o.base || p.base) {
      p = perfis.deepMerge(perfis.resolve(o.base || p.base), p);
    }
    const saved = perfis.save(p);
    out(`✅ Perfil ${p.id} gravado em ${saved}`);
    return 0;
  }
  if (sub === 'remover') {
    if (!id) throw new CliError('Uso: perfil remover <id>', 2);
    out(`🗑️  Removido: ${perfis.remove(id)}`);
    return 0;
  }
  throw new CliError(`Subcomando desconhecido: perfil ${sub}`, 2);
}

// ---------- meta -----------------------------------------------------------------------------------

function clientFor(args, profile) {
  const { MetaClient } = require('./meta');
  const amb = profile.ambiente || {};
  const validEnv = (n) => n && /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
  let tokenEnv = args['token-env'] || (validEnv(amb.token_env) ? amb.token_env : 'META_ACCESS_TOKEN');
  if (!process.env[tokenEnv] && process.env.META_ACCESS_TOKEN) tokenEnv = 'META_ACCESS_TOKEN';
  return new MetaClient({ tokenEnv, version: args['api-version'] || (validEnv(amb.versao_env) ? process.env[amb.versao_env] : undefined), verbose: !!args.verbose });
}

function accountFor(args, profile) {
  const amb = profile.ambiente || {};
  return args.conta || (amb.conta_env && process.env[amb.conta_env]) || process.env.META_AD_ACCOUNT_ID || process.env.META_ACCOUNT_ID;
}

async function cmdMeta(args) {
  const meta = require('./meta');
  const [sub] = args._;
  const profile = loadProfile(args.perfil);
  const client = clientFor(args, profile);
  if (sub === 'conferir') {
    const me = await client.get('me', { fields: 'id,name' });
    out(`✅ Token válido · usuário: ${me.name || me.id} · API ${client.version}`);
    const acc = accountFor(args, profile);
    if (acc) {
      const act = meta.normAccount(acc);
      const a = await client.get(act, { fields: meta.FIELDS.account });
      const st = { 1: 'ativa', 2: 'desativada', 3: 'pagamento pendente', 7: 'em revisão de risco', 9: 'em período de carência', 100: 'fechamento pendente', 101: 'fechada' };
      out(`${Number(a.account_status) === 1 ? '✅' : '⚠️ '} Conta: ${a.name} · ${st[a.account_status] || a.account_status} · ${a.currency} · ${a.timezone_name}`);
      if (a.spend_cap && Number(a.spend_cap) > 0) out(`   limite de gasto: ${(Number(a.amount_spent) / Number(a.spend_cap) * 100).toFixed(0)}% usado`);
    } else out('ℹ️  Sem conta (use --conta act_… ou META_AD_ACCOUNT_ID).');
    out(`   uso da API (maior cabeçalho): ${client.lastUsage}% · chamadas: ${client.calls}`);
    return 0;
  }
  if (sub === 'snapshot') {
    const acc = accountFor(args, profile);
    const period = resolvePeriod(args.periodo);
    const snap = await meta.snapshot(client, acc, period, { ativos: !!args.ativos, anterior: args.comparar ? previousPeriod(period) : null });
    snap.meta.perfil = args.perfil || null;
    const file = args.saida || path.join('relatorios', `snapshot-${period.since}_${period.until}.json`);
    writeFile(file, JSON.stringify(snap, null, 2) + '\n');
    try { fs.chmodSync(file, 0o600); } catch { /* ok */ }
    out(`✅ Snapshot gravado em ${file}`);
    out(`   ${snap.campaigns.length} campanhas · ${snap.adsets.length} conjuntos · ${snap.ads.length} anúncios · ${(snap.insights.ad || []).length} linhas de insight por anúncio · ${client.calls} chamadas`);
    return 0;
  }
  throw new CliError('Uso: meta conferir | meta snapshot [opções]', 2);
}

// ---------- análise --------------------------------------------------------------------------------

function loadSnapshot(file) {
  if (!file) throw new CliError('Informe o snapshot (gerado por `neuro-ads-manager meta snapshot`).', 2);
  assertNotSecret(file);
  const s = readJson(file);
  if (!s.insights) throw new CliError(`${file} não parece um snapshot do neuro-ads-manager (falta "insights").`, 2);
  return s;
}

function emit(args, markdown, json) {
  if (args.json) { out(JSON.stringify(json, null, 2)); return; }
  if (args.saida) { writeFile(args.saida, markdown); out(`✅ Gravado em ${args.saida}`); return; }
  out(markdown);
}

function cmdAuditar(args) {
  const snap = loadSnapshot(args._[0]);
  const profile = loadProfile(args.perfil || (snap.meta && snap.meta.perfil));
  const auditoria = require('./auditoria');
  const r = auditoria.audit(snap, profile);
  emit(args, auditoria.toMarkdown(r), r);
  return r.achados.some((f) => f.severidade === 'critico') ? 1 : 0;
}

function cmdAlertas(args) {
  const snap = loadSnapshot(args._[0]);
  const profile = loadProfile(args.perfil || (snap.meta && snap.meta.perfil));
  const alertas = require('./alertas');
  const a = alertas.alerts(snap, profile);
  emit(args, alertas.toMarkdown(a, profile), a);
  return 0;
}

function cmdRelatorio(args) {
  const file = args._[0];
  if (!file) throw new CliError('Uso: relatorio <snapshot.json | export.csv> [--perfil <id>]', 2);
  assertNotSecret(file);
  let input;
  if (/\.csv$/i.test(file)) {
    const { fromAdsManagerCsv } = require('./metricas');
    const csv = fromAdsManagerCsv(readText(file));
    if (!csv.columns.spend) throw new CliError('CSV sem coluna de valor usado/gasto. Exporte do Gerenciador com "Valor usado (BRL)", "Impressões", "Resultados" e "Cliques no link".', 2);
    const byCampaign = csv.rows.map((r) => ({ ...r, campaign_id: r.campaign_name, ad_id: r.ad_name }));
    input = { meta: { source: 'csv', period: args.periodo ? resolvePeriod(args.periodo) : null }, insights: { campaign: byCampaign, ad: csv.columns.ad_name ? byCampaign : [] }, daily: [] };
  } else {
    input = loadSnapshot(file);
  }
  const profile = loadProfile(args.perfil || (input.meta && input.meta.perfil));
  const r = require('./relatorio').build(input, profile, { titulo: args.titulo, minSpend: args['gasto-min'] !== undefined ? Number(args['gasto-min']) : undefined });
  emit(args, r.markdown, { totais: r.totals, anterior: r.previous, campanhas: r.campaigns, melhores: r.best, piores: r.worst });
  return 0;
}

// ---------- conversão ------------------------------------------------------------------------------

function conversionOpts(args) {
  let excludeIds;
  if (args['excluir-ids']) {
    assertNotSecret(args['excluir-ids']);
    const txt = readText(args['excluir-ids']);
    excludeIds = new Set(txt.split(/[\r\n,;]+/).map((s) => s.trim()).filter((s) => s && s !== 'event_id'));
  }
  return { eventName: args.evento, actionSource: args.origem, currency: args.moeda, phoneCountry: args.ddi || '55', defaultCountry: args.pais || 'br', leadEventSource: args.crm, tz: args.fuso || '-03:00', excludeIds };
}

async function cmdConversao(args) {
  const conv = require('./conversao');
  const [sub, file] = args._;
  if (sub === 'dataset') {
    const profile = loadProfile(args.perfil);
    const amb = profile.ambiente || {};
    const id = file || (amb.dataset_env && process.env[amb.dataset_env]) || process.env.META_DATASET_ID;
    if (!id) throw new CliError('Informe o dataset/pixel: conversao dataset <id> (ou META_DATASET_ID).', 2);
    const { datasetInfo } = require('./meta');
    const d = await datasetInfo(clientFor(args, profile), id);
    if (args.json) { out(JSON.stringify(d, null, 2)); return 0; }
    const last = d.info.last_fired_time ? new Date(d.info.last_fired_time) : null;
    const hours = last ? (Date.now() - last.getTime()) / 3600000 : null;
    out(`${hours !== null && hours < 24 ? '✅' : '⚠️ '} ${d.info.name || 'dataset'} · último evento: ${last ? `${last.toISOString()} (${hours.toFixed(1)} h atrás)` : 'nunca'}`);
    if (d.info.is_unavailable) out('⚠️  Dataset marcado como indisponível.');
    if (d.info.enable_automatic_matching === false) out('ℹ️  Correspondência avançada automática desligada.');
    if (d.stats && Array.isArray(d.stats.data)) {
      const counts = {};
      for (const bucket of d.stats.data) for (const x of bucket.data || []) counts[x.value] = (counts[x.value] || 0) + Number(x.count || 0);
      out('Eventos recebidos (janela padrão da API):');
      for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) out(`  ${k.padEnd(28)} ${n}`);
    } else if (d.stats && d.stats.error) out(`ℹ️  Estatísticas indisponíveis: ${d.stats.error}`);
    out('A qualidade da correspondência (EMQ) e a deduplicação navegador/servidor são conferidas no Gerenciador de Eventos.');
    return 0;
  }
  if (!file) throw new CliError(`Uso: conversao ${sub || '<validar|normalizar|payload|dataset>'} <arquivo.csv>`, 2);
  assertNotSecret(file);
  const a = conv.analyze(readText(file), conversionOpts(args));
  if (sub === 'validar') {
    if (args.json) { const { rows, ...rest } = a; out(JSON.stringify(rest, null, 2)); }
    else out(conv.report(a));
    return a.valid === a.total ? 0 : 1;
  }
  if (sub === 'normalizar') {
    if (!args.saida) throw new CliError('Informe --saida <arquivo.csv> (o arquivo de entrada não é alterado).', 2);
    writeFile(args.saida, conv.hashedCsv(a));
    try { fs.chmodSync(args.saida, 0o600); } catch { /* ok */ }
    out(conv.report(a));
    out(`\n✅ ${a.valid} linha(s) com hash em ${args.saida} (permissão 600). Linhas com problema ficaram de fora.`);
    return 0;
  }
  if (sub === 'payload') {
    if (!args.saida) throw new CliError('Informe --saida <payload.json>.', 2);
    const batches = conv.capiPayloads(a, { testEventCode: args.teste, batch: args.lote ? Number(args.lote) : undefined, messagingChannel: args.canal });
    const body = batches.length === 1 ? batches[0] : { lotes: batches };
    writeFile(args.saida, JSON.stringify(body, null, 2) + '\n');
    try { fs.chmodSync(args.saida, 0o600); } catch { /* ok */ }
    out(conv.report(a));
    out(`\n✅ ${batches.reduce((n, b) => n + b.data.length, 0)} evento(s) em ${batches.length} lote(s) em ${args.saida}${args.teste ? ` (com test_event_code ${args.teste})` : ''}.`);
    out('   Nada foi enviado. Envie pela ferramenta do projeto depois da aprovação (POST /<dataset>/events), primeiro com --teste.');
    return 0;
  }
  throw new CliError(`Subcomando desconhecido: conversao ${sub}`, 2);
}

// ---------- compliance e nomes ---------------------------------------------------------------------

function cmdCompliance(args) {
  const compliance = require('./compliance');
  if (args._[0] === 'regras') {
    const sets = compliance.rulesets();
    const id = args._[1];
    if (!id) {
      for (const [k, s] of Object.entries(sets)) out(`${C.green}${k.padEnd(18)}${C.reset} ${s.nome} ${C.gray}(${(s.regras || []).length} regras, ${(s.checklist || []).length} itens de checklist)${C.reset}`);
      return 0;
    }
    const s = sets[id];
    if (!s) throw new CliError(`Conjunto desconhecido: ${id}`, 2);
    out(`${C.bold}${s.nome}${C.reset}\n${C.gray}${s.base_legal}${C.reset}\n`);
    for (const r of s.regras || []) out(`- [${r.severidade}] ${r.id}: ${r.mensagem}`);
    for (const r of s.obrigatorios || []) out(`- [obrigatório] ${r.id}: ${r.mensagem}`);
    if ((s.checklist || []).length) { out('\nChecklist (revisão humana):'); for (const c of s.checklist) out(`  ☐ ${c}`); }
    return 0;
  }
  const file = args._[0];
  if (!file) throw new CliError('Uso: compliance <arquivo|-> [--perfil <id> | --regras a,b]', 2);
  if (file !== '-') assertNotSecret(file);
  const text = readText(file);
  const profile = loadProfile(args.perfil);
  const ids = args.regras ? args.regras.split(',').map((s) => s.trim()).filter(Boolean) : ((profile.compliance && profile.compliance.regras) || ['meta_politicas']);
  const r = compliance.lengthChecks(compliance.check(text, ids), text, { titulo: args.titulo, limites: profile.criativos && profile.criativos.limites_copy });
  if (args.json) out(JSON.stringify(r, null, 2));
  else out(compliance.format(r));
  return compliance.exitCode(r);
}

function cmdNome(args) {
  const nomes = require('./nomes');
  const [sub, lvl, ...rest] = args._;
  const profile = loadProfile(args.perfil);
  const model = nomes.modelFor(profile);
  if (sub === 'gerar') {
    const fields = {};
    for (const kv of rest) { const i = kv.indexOf('='); if (i > 0) fields[kv.slice(0, i)] = kv.slice(i + 1); }
    out(nomes.build(model, lvl, fields));
    return 0;
  }
  if (sub === 'validar') {
    const name = rest.join(' ');
    const r = nomes.check(model, lvl, name);
    if (r.ok) { out(`✅ dentro do padrão (${r.modelo})`); out(JSON.stringify(r.campos)); return 0; }
    out(`❌ fora do padrão: ${r.modelo}`);
    return 1;
  }
  if (sub === 'modelo' || !sub) { out(JSON.stringify(model, null, 2)); return 0; }
  throw new CliError('Uso: nome gerar|validar|modelo …', 2);
}

// ---------- operação -------------------------------------------------------------------------------

function cmdOperacao(args) {
  const op = require('./operacao');
  const [sub, target] = args._;
  if (sub === 'nova') {
    const profile = args.perfil ? loadProfile(args.perfil) : {};
    const dir = op.create(target, { perfil: args.perfil, pasta: args.pasta, contaEnv: profile.ambiente && profile.ambiente.conta_env, moeda: profile.moeda });
    out(`✅ Plano criado em ${dir}\n   Preencha plano.json (antes, depois, rollback de cada operação) e README.md; depois: operacao validar ${path.relative(process.cwd(), dir) || dir}`);
    return 0;
  }
  if (!target) throw new CliError(`Uso: operacao ${sub || '<nova|validar|aprovar|registrar|status>'} <pasta>`, 2);
  if (sub === 'validar') {
    const v = op.validate(op.load(target));
    for (const e of v.errors) out(`❌ ${e}`);
    for (const w of v.warnings) out(`⚠️  ${w}`);
    out(`${v.ok ? '✅ Plano válido' : '❌ Plano com erros'} · sha256 ${v.hash}`);
    return v.ok ? 0 : 1;
  }
  if (sub === 'aprovar') {
    const a = op.approve(target, { aprovador: args.aprovador, mensagem: args.mensagem });
    out(`✅ Aprovação registrada para o plano ${a.plano_sha256.slice(0, 12)}… por ${a.aprovador}`);
    return 0;
  }
  if (sub === 'registrar') {
    const e = op.record(target, { op: args.op, estado: args.estado, nota: args.nota });
    out(`✅ ${e.op} → ${e.estado}`);
    return 0;
  }
  if (sub === 'status') {
    const s = op.status(target);
    if (args.json) { out(JSON.stringify(s, null, 2)); return 0; }
    out(`${s.escopo} · sha256 ${s.hash.slice(0, 12)}…`);
    out(s.aprovado ? `✅ aprovado por ${s.aprovacao.aprovador} em ${s.aprovacao.aprovado_em}` : s.alterado_depois_da_aprovacao ? '❌ o plano mudou depois da aprovação: aprove de novo' : '⏳ sem aprovação');
    if (!s.valido) for (const e of s.erros) out(`❌ ${e}`);
    for (const [k, v] of Object.entries(s.operacoes)) out(`   ${k.padEnd(10)} ${v || '—'}`);
    return 0;
  }
  throw new CliError(`Subcomando desconhecido: operacao ${sub}`, 2);
}

// ---------- harness e status ---------------------------------------------------------------------

function cmdHarness(args) {
  const h = require('./harness');
  const [sub = 'status'] = args._;
  const opts = { copiar: !!args.copiar, dryRun: !!args['dry-run'], perfil: args['perfil-harness'], base: args.base };
  if (sub === 'status') {
    const s = h.status(opts);
    const mark = (b) => (b ? '✅' : '➖');
    out(`Neuro Harness em ${s.base} (perfil ${s.profile})`);
    out(`  ${mark(s.harness)} runtime do DeepSeek Harness (${s.dsh})`);
    out(`  ${mark(s.perfilExiste)} perfil ${s.profileDir}`);
    out(`  ${mark(s.dependencia)} dependência no perfil${s.dependencia ? `: ${s.dependencia}` : ''}${s.versao ? ` (v${s.versao})` : ''}`);
    out(`  ${mark(s.bundle)} bundle em dsh.profile.bundles`);
    return s.bundle ? 0 : 1;
  }
  if (sub === 'instalar' || sub === 'install') {
    const r = h.install(opts);
    for (const st of r.steps) out(`${r.dryRun ? '🧪' : '✅'} ${st}`);
    out(r.dryRun ? '\nNada foi alterado (--dry-run).' : `\nOrigem: ${r.source}\nReinicie o Harness para carregar: neuro-harness restart`);
    return 0;
  }
  if (sub === 'remover' || sub === 'uninstall') {
    const r = h.uninstall(opts);
    for (const st of r.steps) out(`${r.dryRun ? '🧪' : '🗑️ '} ${st}`);
    if (!r.steps.length) out('Nada a remover.');
    return 0;
  }
  throw new CliError('Uso: harness instalar [--copiar] [--dry-run] | status | remover', 2);
}

function cmdStatus() {
  const perfis = require('./perfis');
  banner();
  out(`  pacote: ${util.PKG_ROOT}`);
  out(`  skill:  ${util.SKILL_DIR}`);
  out(`  perfis: ${Object.keys(perfis.list()).join(', ')}`);
  out(`  biblioteca do usuário: ${util.USER_HOME}`);
  const env = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_DATASET_ID', 'META_GRAPH_VERSION'].map((k) => `${k}=${process.env[k] ? 'definida' : '—'}`);
  out(`  ambiente: ${env.join(' · ')}`);
  try {
    const s = require('./harness').status();
    out(`  Neuro Harness (${s.base}): ${s.bundle ? `instalado no perfil ${s.profile}${s.origem ? ` a partir de ${s.origem}` : ''}` : s.harness ? 'encontrado, plugin não instalado (neuro-ads-manager harness instalar)' : 'não encontrado'}`);
  } catch { /* ok */ }
  return 0;
}

// ---------- main -----------------------------------------------------------------------------------

const SPEC = {
  bool: ['json', 'comparar', 'ativos', 'verbose', 'copiar', 'dry-run', 'help'],
  alias: { h: 'help', o: 'saida', p: 'perfil' },
};

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { help(); return 0; }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') { out(VERSION); return 0; }
  const args = parseArgs(rest, SPEC);
  if (args.help) { help(); return 0; }
  switch (cmd) {
    case 'perfil': return cmdPerfil(args);
    case 'meta': return cmdMeta(args);
    case 'auditar': case 'auditoria': return cmdAuditar(args);
    case 'alertas': return cmdAlertas(args);
    case 'relatorio': case 'relatório': return cmdRelatorio(args);
    case 'conversao': case 'conversão': return cmdConversao(args);
    case 'compliance': return cmdCompliance(args);
    case 'nome': case 'nomes': return cmdNome(args);
    case 'operacao': case 'operação': return cmdOperacao(args);
    case 'harness': return cmdHarness(args);
    case 'status': return cmdStatus();
    default: throw new CliError(`Comando desconhecido: ${cmd}. Veja: neuro-ads-manager help`, 2);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code || 0)).catch((e) => {
    const { redact } = require('./meta');
    err(`${C.red}✗ ${redact(e.message)}${C.reset}`);
    if (process.env.NEURO_ADS_DEBUG && !(e instanceof CliError)) err(redact(e.stack));
    process.exit(e instanceof CliError ? e.code : 1);
  });
}

module.exports = { main, VERSION, REPO };
