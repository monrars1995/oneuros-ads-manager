/**
 * Auditoria automática de uma conta Meta Ads a partir do retrato (`meta snapshot`).
 * Cada verificação devolve achados com área, severidade, evidência e recomendação. A nota (0–100) é um
 * resumo para acompanhar a evolução; a decisão é sempre do gestor, com os achados na mão.
 *
 * As verificações só leem o retrato. Nada é alterado na conta: recomendações de pausa, orçamento ou
 * estrutura viram um plano de mudança que o usuário aprova (ver a skill, seção "Mudanças na conta").
 */
const compliance = require('./compliance');
const nomes = require('./nomes');
const { sum, groupBy, DEFAULT_RESULT_TYPES } = require('./metricas');
const { toNumber, brl, dec, pct } = require('./util');

const SEV_WEIGHT = { critico: 15, alto: 8, medio: 4, baixo: 1 };
const AREAS = ['mensuracao', 'estrutura', 'orcamento', 'publicos', 'criativos', 'desempenho', 'compliance'];

/** Limites padrão (regras práticas de mercado). O perfil pode trocar qualquer um em `limites`. */
const LIMITES_PADRAO = {
  frequencia_max: 3.5,
  ctr_link_min: 0.7,
  anuncios_por_conjunto_min: 2,
  anuncios_por_conjunto_max: 6,
  conjuntos_por_campanha_max: 5,
  campanhas_mesmo_objetivo_max: 3,
  eventos_aprendizado_semana: 50,
  gasto_sem_resultado_multiplo: 2,
  cpr_tolerancia: 1.3,
};

const ACTIVE = (o) => (o.effective_status || o.status) === 'ACTIVE';
const LEAD_GOALS = new Set(['LEAD_GENERATION', 'OFFSITE_CONVERSIONS', 'CONVERSATIONS', 'QUALITY_LEAD', 'QUALITY_CALL', 'VALUE', 'APP_INSTALLS']);
const TRAFFIC_GOALS = new Set(['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'IMPRESSIONS', 'REACH', 'POST_ENGAGEMENT', 'THRUPLAY']);

function audit(snap, profile = {}, opts = {}) {
  const lim = { ...LIMITES_PADRAO, ...(profile.limites || {}) };
  const types = (profile.kpi && profile.kpi.resultado) || DEFAULT_RESULT_TYPES;
  const cprAlvo = profile.kpi && toNumber(profile.kpi.cpr_alvo);
  const objetivoFunil = (profile.kpi && profile.kpi.objetivo) || 'leads';
  const findings = [];
  const add = (area, severidade, titulo, evidencia, recomendacao, extra = {}) => findings.push({ area, severidade, titulo, evidencia, recomendacao, ...extra });

  const campaigns = snap.campaigns || [];
  const adsets = snap.adsets || [];
  const ads = snap.ads || [];
  const ins = snap.insights || {};
  const activeCampaigns = campaigns.filter(ACTIVE);
  const activeAdsets = adsets.filter(ACTIVE);
  const activeAds = ads.filter(ACTIVE);
  const total = sum(ins.campaign || [], types);

  // ---- conta --------------------------------------------------------------------------------
  const acc = snap.account || {};
  if (acc.account_status !== undefined && Number(acc.account_status) !== 1) {
    add('estrutura', 'critico', 'Conta não está ativa', `account_status=${acc.account_status}${acc.disable_reason ? `, disable_reason=${acc.disable_reason}` : ''}`, 'Resolva o status da conta (pagamento, revisão de política ou restrição) antes de qualquer otimização.');
  }

  // ---- mensuração ---------------------------------------------------------------------------
  if (total.spend > 0 && total.results === 0) {
    add('mensuracao', 'critico', 'Gasto sem nenhum resultado registrado', `${brl(total.spend)} no período e 0 resultados dos tipos ${types.slice(0, 3).join(', ')}…`, 'Confira o evento de otimização, o pixel/dataset e a CAPI (/neuro-ads-manager:conversao) e se o perfil usa os tipos de ação certos (kpi.resultado).');
  }
  const trafficOpt = activeAdsets.filter((a) => TRAFFIC_GOALS.has(a.optimization_goal));
  if (objetivoFunil !== 'alcance' && trafficOpt.length) {
    add('mensuracao', 'alto', 'Conjuntos otimizando para clique/engajamento numa conta de resultado', `${trafficOpt.length} conjunto(s) ativo(s) com optimization_goal ${[...new Set(trafficOpt.map((a) => a.optimization_goal))].join(', ')}`, 'Otimize para o evento que vira receita (lead, conversa, compra ou lead qualificado do CRM). Clique barato não é cliente.', { itens: trafficOpt.slice(0, 10).map((a) => a.name) });
  }
  const noPromoted = activeAdsets.filter((a) => ['OFFSITE_CONVERSIONS', 'VALUE'].includes(a.optimization_goal) && !(a.promoted_object && (a.promoted_object.pixel_id || a.promoted_object.custom_event_type || a.promoted_object.custom_conversion_id)));
  if (noPromoted.length) add('mensuracao', 'alto', 'Conversão sem pixel/evento definido', `${noPromoted.length} conjunto(s) com OFFSITE_CONVERSIONS sem promoted_object`, 'Defina o dataset e o evento de conversão do conjunto.');
  const attr = new Set(activeAdsets.map((a) => JSON.stringify(a.attribution_spec || null)));
  if (attr.size > 1) add('mensuracao', 'medio', 'Janelas de atribuição diferentes entre conjuntos', `${attr.size} configurações de attribution_spec nos conjuntos ativos`, 'Use a mesma janela nos conjuntos que você compara (padrão de mercado: 7 dias após clique + 1 dia após visualização), ou compare só dentro da mesma janela.');

  // ---- estrutura ----------------------------------------------------------------------------
  const model = nomes.modelFor(profile);
  const badNames = [];
  for (const [lvl, list] of [['campanha', activeCampaigns], ['conjunto', activeAdsets], ['anuncio', activeAds]]) {
    for (const o of list) if (!nomes.check(model, lvl, o.name).ok) badNames.push(`${lvl}: ${o.name}`);
  }
  if (badNames.length) add('estrutura', 'baixo', 'Nomes fora do padrão de nomenclatura', `${badNames.length} item(ns) ativo(s) fora do modelo (${model.campanha})`, 'Renomeie para o padrão: os relatórios e filtros por funil, público e criativo dependem do nome.', { itens: badNames.slice(0, 15) });

  const byObjective = {};
  for (const c of activeCampaigns) byObjective[c.objective || '?'] = (byObjective[c.objective || '?'] || 0) + 1;
  for (const [obj, n] of Object.entries(byObjective)) {
    if (n > lim.campanhas_mesmo_objetivo_max) add('estrutura', 'medio', 'Muitas campanhas ativas com o mesmo objetivo', `${n} campanhas ${obj}`, 'Consolide: menos campanhas e conjuntos dão mais eventos por conjunto, saem do aprendizado mais rápido e reduzem a sobreposição de leilão.');
  }
  const adsetsByCampaign = {};
  for (const a of activeAdsets) (adsetsByCampaign[a.campaign_id] = adsetsByCampaign[a.campaign_id] || []).push(a);
  for (const [cid, list] of Object.entries(adsetsByCampaign)) {
    if (list.length > lim.conjuntos_por_campanha_max) {
      const c = campaigns.find((x) => x.id === cid);
      add('estrutura', 'medio', 'Campanha fragmentada em muitos conjuntos', `${c ? c.name : cid}: ${list.length} conjuntos ativos`, 'Junte públicos parecidos e use público amplo/Advantage+ com exclusões; deixe a segmentação para o criativo.');
    }
  }
  const learningFail = activeAdsets.filter((a) => a.learning_stage_info && a.learning_stage_info.status === 'FAIL');
  if (learningFail.length) add('estrutura', 'alto', 'Conjuntos com aprendizado limitado', `${learningFail.length} de ${activeAdsets.length} conjuntos ativos`, `Cada conjunto precisa de ~${lim.eventos_aprendizado_semana} eventos de otimização em 7 dias. Consolide conjuntos, suba o orçamento ou otimize para um evento mais frequente.`, { itens: learningFail.slice(0, 10).map((a) => a.name) });

  const adsByAdset = {};
  for (const ad of activeAds) (adsByAdset[ad.adset_id] = adsByAdset[ad.adset_id] || []).push(ad);
  const few = activeAdsets.filter((a) => (adsByAdset[a.id] || []).length < lim.anuncios_por_conjunto_min);
  const many = activeAdsets.filter((a) => (adsByAdset[a.id] || []).length > lim.anuncios_por_conjunto_max);
  if (few.length) add('criativos', 'medio', 'Conjuntos com poucos anúncios ativos', `${few.length} conjunto(s) com menos de ${lim.anuncios_por_conjunto_min} anúncios`, 'Mantenha 3–6 anúncios com conceitos diferentes por conjunto para o algoritmo ter opção e para medir fadiga.', { itens: few.slice(0, 10).map((a) => a.name) });
  if (many.length) add('criativos', 'baixo', 'Conjuntos com anúncios demais', `${many.length} conjunto(s) com mais de ${lim.anuncios_por_conjunto_max} anúncios`, 'Anúncios demais diluem a entrega: pause os que não receberam entrega e teste conceitos novos em vez de variações mínimas.');

  // ---- orçamento ----------------------------------------------------------------------------
  if (cprAlvo) {
    const minDaily = (cprAlvo * lim.eventos_aprendizado_semana) / 7;
    const small = activeAdsets.filter((a) => { const b = toNumber(a.daily_budget); return b !== null && b / 100 < minDaily; });
    const smallCbo = activeCampaigns.filter((c) => { const b = toNumber(c.daily_budget); return b !== null && b / 100 < minDaily; });
    if (small.length || smallCbo.length) add('orcamento', 'medio', 'Orçamento diário abaixo do necessário para sair do aprendizado', `${small.length + smallCbo.length} item(ns) abaixo de ${brl(minDaily)}/dia (CPR alvo ${brl(cprAlvo)} × ${lim.eventos_aprendizado_semana} ÷ 7)`, 'Concentre a verba em menos conjuntos ou otimize para um evento mais frequente do funil.');
  }
  if (profile.orcamento && toNumber(profile.orcamento.mensal) && snap.meta && snap.meta.period) {
    const days = (Date.parse(snap.meta.period.until) - Date.parse(snap.meta.period.since)) / 86400000 + 1;
    const perDay = total.spend / days;
    const target = toNumber(profile.orcamento.mensal) / 30.4;
    const ratio = perDay / target;
    if (ratio > 1.15 || ratio < 0.85) add('orcamento', ratio > 1.15 ? 'alto' : 'medio', ratio > 1.15 ? 'Ritmo de gasto acima do orçamento' : 'Ritmo de gasto abaixo do orçamento', `${brl(perDay)}/dia × alvo ${brl(target)}/dia (${dec(ratio * 100, 0)}%)`, 'Ajuste os orçamentos para fechar o mês dentro da verba aprovada.');
  }

  // ---- públicos -----------------------------------------------------------------------------
  const noExclusion = activeAdsets.filter((a) => {
    const t = a.targeting || {};
    return !(t.excluded_custom_audiences && t.excluded_custom_audiences.length);
  });
  if (activeAdsets.length && noExclusion.length === activeAdsets.length && (profile.publicos || {}).exclusoes !== false) {
    add('publicos', 'medio', 'Nenhum conjunto exclui clientes/leads já convertidos', `${activeAdsets.length} conjuntos ativos sem excluded_custom_audiences`, 'Exclua clientes atuais e leads recentes (lista do CRM com hash) da prospecção para não pagar por quem já converteu.');
  }
  if (profile.publicos && profile.publicos.idade_min) {
    const young = activeAdsets.filter((a) => a.targeting && Number(a.targeting.age_min) < Number(profile.publicos.idade_min));
    if (young.length) add('compliance', 'alto', `Público com idade abaixo do mínimo do perfil (${profile.publicos.idade_min}+)`, `${young.length} conjunto(s)`, 'Suba a idade mínima: o perfil exige público adulto.', { itens: young.slice(0, 10).map((a) => a.name) });
  }

  if (Array.isArray(snap.audiences) && snap.audiences.length) {
    const used = new Set();
    for (const a of activeAdsets) for (const k of ['excluded_custom_audiences', 'custom_audiences']) for (const x of (a.targeting && a.targeting[k]) || []) used.add(String(x.id || x));
    const tiny = snap.audiences.filter((au) => used.has(String(au.id)) && toNumber(au.approximate_count_upper_bound) !== null && toNumber(au.approximate_count_upper_bound) <= 1000);
    if (tiny.length) add('publicos', 'medio', 'Público em uso vazio ou muito pequeno', `${tiny.length} público(s) usados em conjuntos ativos com até ~1.000 pessoas: ${tiny.slice(0, 5).map((a) => a.name).join('; ')}`, 'Confira a origem da lista (filtro do CRM, etapa, hash). Exclusão vazia deixa clientes atuais recebendo anúncio de aquisição.');
    const broken = snap.audiences.filter((au) => used.has(String(au.id)) && au.delivery_status && Number(au.delivery_status.code) !== 200);
    if (broken.length) add('publicos', 'medio', 'Público em uso com problema de entrega', `${broken.length} público(s): ${broken.slice(0, 5).map((a) => `${a.name} (${a.delivery_status.description || a.delivery_status.code})`).join('; ')}`, 'Atualize ou recrie o público; um público com problema pode zerar a entrega do conjunto.');
  }

  // ---- desempenho ---------------------------------------------------------------------------
  const adRows = groupBy(ins.ad || [], 'ad_id', 'ad_name', types);
  const highFreq = groupBy(ins.adset || [], 'adset_id', 'adset_name', types).filter((g) => g.frequency !== null && g.frequency > lim.frequencia_max);
  if (highFreq.length) add('criativos', 'medio', 'Frequência alta (sinal de fadiga)', `${highFreq.length} conjunto(s) acima de ${lim.frequencia_max} no período: ${highFreq.slice(0, 3).map((g) => `${g.name} (${dec(g.frequency)})`).join('; ')}`, 'Renove criativos (conceito novo, não só cor) ou amplie o público. Confira se o CTR caiu junto.');
  if (total.ctr !== null && total.impressions > 1000 && total.ctr < lim.ctr_link_min) add('criativos', 'medio', 'CTR de link abaixo da regra prática', `${pct(total.ctr)} na conta (referência mínima ${pct(lim.ctr_link_min)})`, 'Teste ganchos novos nos 3 primeiros segundos e uma promessa mais específica.');
  if (cprAlvo && total.cpr !== null && total.cpr > cprAlvo * lim.cpr_tolerancia) add('desempenho', 'alto', 'Custo por resultado acima do alvo', `${brl(total.cpr)} × alvo ${brl(cprAlvo)}`, 'Ataque nesta ordem: mensuração → oferta/landing → criativo → público → lance.');
  const sink = adRows.filter((g) => g.results === 0 && cprAlvo && g.spend >= cprAlvo * lim.gasto_sem_resultado_multiplo);
  if (sink.length) add('desempenho', 'alto', 'Anúncios gastando sem resultado', `${sink.length} anúncio(s) com gasto ≥ ${lim.gasto_sem_resultado_multiplo}× o CPR alvo e 0 resultados`, 'Candidatos a pausa. Monte o plano de mudança e peça aprovação antes de pausar.', { itens: sink.slice(0, 10).map((g) => `${g.name} (${brl(g.spend)})`) });
  const belowAvg = (ins.ad || []).filter((r) => /BELOW_AVERAGE/.test(`${r.quality_ranking}${r.engagement_rate_ranking}${r.conversion_rate_ranking}`));
  if (belowAvg.length) add('criativos', 'baixo', 'Anúncios com ranking abaixo da média', `${belowAvg.length} anúncio(s) com quality/engagement/conversion ranking BELOW_AVERAGE`, 'Ranking baixo encarece o leilão: reveja gancho, relevância para o público e a experiência pós-clique.');
  if (activeAds.length && activeAds.length < 5) add('criativos', 'medio', 'Pouca diversidade de criativos na conta', `${activeAds.length} anúncio(s) ativo(s)`, 'Mantenha um volume de conceitos em teste por mês (ver a seção de testes da skill).');

  // ---- compliance de copy -------------------------------------------------------------------
  const sets = (profile.compliance && profile.compliance.regras) || ['meta_politicas'];
  const copyFindings = [];
  for (const ad of activeAds) {
    const cr = ad.creative || {};
    const text = [cr.title, cr.body].filter(Boolean).join('\n');
    if (!text) continue;
    const r = compliance.check(text, sets);
    for (const a of r.achados) if (['critico', 'alto'].includes(a.severidade)) copyFindings.push(`${ad.name}: "${a.trecho}" (${a.conjunto}/${a.regra})`);
  }
  if (copyFindings.length) add('compliance', 'critico', 'Copy ativa com termo de risco de compliance', `${copyFindings.length} ocorrência(s)`, 'Revise com o subagente revisor-compliance e troque a copy. Em advocacia, risco de representação na OAB; em qualquer segmento, risco de reprovação e de restrição da conta.', { itens: copyFindings.slice(0, 15) });
  const cats = (profile.compliance && profile.compliance.categorias_especiais) || null;
  if (cats && cats.length) {
    const missing = activeCampaigns.filter((c) => !cats.every((k) => (c.special_ad_categories || []).includes(k)));
    if (missing.length) add('compliance', 'critico', 'Campanha sem a categoria especial de anúncio exigida', `${missing.length} campanha(s) sem ${cats.join(', ')}`, 'Declare a categoria especial na campanha (a Meta reprova ou restringe a conta se não declarar).');
  }

  // Sem dados de desempenho não há nota: melhor "evidência insuficiente" do que um número inventado.
  const enough = (ins.campaign || []).length > 0 && total.spend > 0;
  const score = enough ? Math.max(0, 100 - findings.reduce((s, f) => s + (SEV_WEIGHT[f.severidade] || 0), 0)) : null;
  const byArea = Object.fromEntries(AREAS.map((a) => [a, findings.filter((f) => f.area === a).length]));
  const order = { critico: 0, alto: 1, medio: 2, baixo: 3 };
  findings.sort((a, b) => order[a.severidade] - order[b.severidade]);
  return {
    perfil: profile.id || null,
    periodo: snap.meta && snap.meta.period,
    conta: { nome: acc.name || null, moeda: acc.currency || null, fuso: acc.timezone_name || null },
    contagem: { campanhas_ativas: activeCampaigns.length, conjuntos_ativos: activeAdsets.length, anuncios_ativos: activeAds.length },
    totais: total,
    nota: score,
    nota_motivo: enough ? null : 'evidência insuficiente (sem insights ou sem gasto no período)',
    por_area: byArea,
    achados: findings,
    limites: lim,
  };
}

function toMarkdown(r) {
  const sev = { critico: '⛔ Crítico', alto: '🔴 Alto', medio: '🟠 Médio', baixo: '🟡 Baixo' };
  const t = r.totais;
  const lines = [];
  lines.push(`# Auditoria da conta${r.conta.nome ? ` — ${r.conta.nome}` : ''}`);
  lines.push('');
  lines.push(`- **Perfil:** ${r.perfil || '—'} · **Período:** ${r.periodo ? `${r.periodo.since} a ${r.periodo.until}` : '—'} · **Moeda:** ${r.conta.moeda || '—'}`);
  lines.push(`- **Ativos:** ${r.contagem.campanhas_ativas} campanhas, ${r.contagem.conjuntos_ativos} conjuntos, ${r.contagem.anuncios_ativos} anúncios`);
  lines.push(`- **Período:** ${brl(t.spend)} investidos, ${dec(t.results, 0)} resultados, custo por resultado ${brl(t.cpr)}, CTR de link ${pct(t.ctr)}, CPM ${brl(t.cpm)}`);
  lines.push(r.nota === null ? `- **Nota automática:** sem nota (${r.nota_motivo})` : `- **Nota automática:** ${r.nota}/100 (resumo dos achados; não substitui a leitura)`);
  lines.push('');
  lines.push('| Área | Achados |');
  lines.push('|---|---|');
  for (const [a, n] of Object.entries(r.por_area)) lines.push(`| ${a} | ${n} |`);
  lines.push('');
  lines.push('## Achados');
  lines.push('');
  if (!r.achados.length) lines.push('Nenhum achado automático. Faça a revisão manual da skill (seção Auditoria).');
  r.achados.forEach((f, i) => {
    lines.push(`### ${i + 1}. ${sev[f.severidade]} · ${f.area} · ${f.titulo}`);
    lines.push(`- **Evidência:** ${f.evidencia}`);
    lines.push(`- **Recomendação:** ${f.recomendacao}`);
    if (f.itens && f.itens.length) lines.push(`- **Itens:** ${f.itens.map((x) => `\`${x}\``).join(', ')}`);
    lines.push('');
  });
  lines.push('---');
  lines.push('Gerado por `neuro-ads-manager auditar`. Nada foi alterado na conta.');
  return lines.join('\n') + '\n';
}

module.exports = { audit, toMarkdown, LIMITES_PADRAO };
