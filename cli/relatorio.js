/**
 * Relatório de desempenho em Markdown a partir do retrato (`meta snapshot`) ou de uma exportação CSV do
 * Gerenciador de Anúncios. Traz os números e os destaques calculados; a leitura (o "porquê" e os próximos
 * passos) é escrita pelo agente por cima, seguindo o modelo templates/relatorio.md da skill.
 */
const { sum, groupBy, delta, DEFAULT_RESULT_TYPES } = require('./metricas');
const { brl, int, dec, pct, toNumber } = require('./util');

/** Nome dentro de célula de tabela Markdown: os nomes de campanha usam " | " como separador. */
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const arrow = (d, inverse = false) => {
  if (d === null || d === undefined || !Number.isFinite(d)) return '';
  const good = inverse ? d < 0 : d > 0;
  return ` (${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${dec(Math.abs(d), 1)}%${Math.abs(d) >= 1 ? (good ? ' ✅' : ' ⚠️') : ''})`;
};

function build(input, profile = {}, opts = {}) {
  const types = (profile.kpi && profile.kpi.resultado) || DEFAULT_RESULT_TYPES;
  const resultLabel = (profile.kpi && profile.kpi.nome_resultado) || 'Resultados';
  const cprAlvo = profile.kpi && toNumber(profile.kpi.cpr_alvo);
  const minSpend = opts.minSpend ?? (cprAlvo ? cprAlvo : 50);

  const campaignRows = input.insights.campaign || [];
  const adRows = input.insights.ad || [];
  const total = sum(campaignRows, types);
  const prev = input.previous ? sum(input.previous, types) : null;
  const byCampaign = groupBy(campaignRows, 'campaign_id', 'campaign_name', types).sort((a, b) => b.spend - a.spend);
  const byAd = groupBy(adRows, 'ad_id', 'ad_name', types).filter((g) => g.spend >= minSpend);
  const best = byAd.filter((g) => g.results > 0).sort((a, b) => a.cpr - b.cpr).slice(0, 5);
  const worst = byAd.slice().sort((a, b) => (b.results === 0 ? Infinity : b.cpr) - (a.results === 0 ? Infinity : a.cpr) || b.spend - a.spend).slice(0, 5);

  const L = [];
  const title = opts.titulo || `Relatório de tráfego pago${profile.nome ? ` — ${profile.nome}` : ''}`;
  L.push(`# ${title}`);
  L.push('');
  const p = input.meta && input.meta.period;
  L.push(`**Período:** ${p ? `${p.since} a ${p.until}` : '—'}${input.meta && input.meta.previous_period ? ` · comparado com ${input.meta.previous_period.since} a ${input.meta.previous_period.until}` : ''}  `);
  L.push(`**Fonte:** ${input.meta && input.meta.source === 'csv' ? 'exportação do Gerenciador de Anúncios' : `Marketing API ${input.meta ? input.meta.api_version : ''}`} · **Gerado em:** ${new Date().toISOString().slice(0, 10)}`);
  L.push('');
  L.push('## Resumo');
  L.push('');
  L.push('| Indicador | Valor |');
  L.push('|---|---|');
  L.push(`| Investimento | ${brl(total.spend)}${prev ? arrow(delta(total.spend, prev.spend)).replace(/ ✅| ⚠️/, '') : ''} |`);
  L.push(`| ${resultLabel} | ${int(total.results)}${prev ? arrow(delta(total.results, prev.results)) : ''} |`);
  L.push(`| Custo por resultado | ${brl(total.cpr)}${prev ? arrow(delta(total.cpr, prev.cpr), true) : ''}${cprAlvo ? ` · alvo ${brl(cprAlvo)}` : ''} |`);
  if (total.value) L.push(`| Valor de conversão · ROAS | ${brl(total.value)} · ${dec(total.roas)}x${prev && prev.roas ? arrow(delta(total.roas, prev.roas)) : ''} |`);
  L.push(`| Impressões · alcance | ${int(total.impressions)} · ${int(total.reach)} |`);
  L.push(`| Frequência | ${dec(total.frequency)} |`);
  L.push(`| Cliques no link · CTR | ${int(total.linkClicks)} · ${pct(total.ctr)}${prev ? arrow(delta(total.ctr, prev.ctr)) : ''} |`);
  L.push(`| CPC · CPM | ${brl(total.cpc)} · ${brl(total.cpm)}${prev ? arrow(delta(total.cpm, prev.cpm), true) : ''} |`);
  L.push(`| Taxa clique → resultado | ${pct(total.convRate)} |`);
  L.push('');
  L.push('> A soma do alcance entre campanhas conta a mesma pessoa mais de uma vez; para alcance único, use o nível da conta.');
  L.push('');

  L.push('## Por campanha');
  L.push('');
  L.push(`| Campanha | Investimento | ${resultLabel} | Custo/resultado | CTR | CPM | Freq. |`);
  L.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const c of byCampaign) L.push(`| ${cell(c.name)} | ${brl(c.spend)} | ${int(c.results)} | ${brl(c.cpr)} | ${pct(c.ctr)} | ${brl(c.cpm)} | ${dec(c.frequency)} |`);
  L.push('');

  if (byAd.length) {
    L.push(`## Anúncios (gasto ≥ ${brl(minSpend)})`);
    L.push('');
    L.push('**Melhores (menor custo por resultado):**');
    L.push('');
    L.push('| Anúncio | Investimento | Resultados | Custo/resultado | CTR |');
    L.push('|---|---:|---:|---:|---:|');
    for (const a of best) L.push(`| ${cell(a.name)} | ${brl(a.spend)} | ${int(a.results)} | ${brl(a.cpr)} | ${pct(a.ctr)} |`);
    L.push('');
    L.push('**Piores (maior custo ou sem resultado):**');
    L.push('');
    L.push('| Anúncio | Investimento | Resultados | Custo/resultado | CTR |');
    L.push('|---|---:|---:|---:|---:|');
    for (const a of worst) L.push(`| ${cell(a.name)} | ${brl(a.spend)} | ${int(a.results)} | ${brl(a.cpr)} | ${pct(a.ctr)} |`);
    L.push('');
  }

  const daily = (input.daily || []).map((r) => ({ day: r.date_start, ...sum([r], types) })).filter((d) => d.day);
  if (daily.length > 1) {
    L.push('## Dia a dia');
    L.push('');
    L.push(`| Dia | Investimento | ${resultLabel} | Custo/resultado |`);
    L.push('|---|---:|---:|---:|');
    for (const d of daily) L.push(`| ${d.day} | ${brl(d.spend)} | ${int(d.results)} | ${brl(d.cpr)} |`);
    L.push('');
  }

  L.push('## Destaques automáticos');
  L.push('');
  const notes = [];
  if (prev && delta(total.cpr, prev.cpr) !== null) notes.push(`Custo por resultado ${delta(total.cpr, prev.cpr) <= 0 ? 'caiu' : 'subiu'} ${dec(Math.abs(delta(total.cpr, prev.cpr)), 1)}% contra o período anterior.`);
  if (cprAlvo && total.cpr !== null) notes.push(total.cpr <= cprAlvo ? `Dentro do alvo de ${brl(cprAlvo)} por resultado.` : `Acima do alvo de ${brl(cprAlvo)} por resultado (${pct(((total.cpr - cprAlvo) / cprAlvo) * 100, 0)} acima).`);
  if (byCampaign.length > 1 && total.spend) {
    const top = byCampaign[0];
    notes.push(`"${top.name}" levou ${pct((top.spend / total.spend) * 100, 0)} do investimento e ${total.results ? pct((top.results / total.results) * 100, 0) : '—'} dos resultados.`);
  }
  if (total.frequency && total.frequency > 3.5) notes.push(`Frequência média ${dec(total.frequency)}: atenção à fadiga dos criativos.`);
  const zero = byAd.filter((a) => a.results === 0);
  if (zero.length) notes.push(`${zero.length} anúncio(s) com gasto relevante e nenhum resultado.`);
  if (!notes.length) notes.push('Sem destaques automáticos.');
  for (const n of notes) L.push(`- ${n}`);
  L.push('');
  L.push('## Leitura e próximos passos');
  L.push('');
  L.push('<!-- O agente escreve aqui: o que explica os números (criativo, público, oferta, mensuração, sazonalidade), o que foi feito no período e as próximas ações com responsável e prazo. Mudanças na conta só com aprovação. -->');
  L.push('');
  return { markdown: L.join('\n'), totals: total, previous: prev, campaigns: byCampaign, best, worst };
}

module.exports = { build };
