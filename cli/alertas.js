/**
 * Alertas de rotina (o monitoramento diário): aplica as `regras_decisao` do perfil aos insights do
 * retrato e devolve candidatos a pausar, congelar e escalar. Nada é executado: cada candidato vira item de um
 * plano de mudança, que o usuário aprova.
 */
const { groupBy, sum, DEFAULT_RESULT_TYPES } = require('./metricas');
const { toNumber, brl, dec } = require('./util');

function alerts(snap, profile = {}) {
  const types = (profile.kpi && profile.kpi.resultado) || DEFAULT_RESULT_TYPES;
  const r = profile.regras_decisao || {};
  const pausar = r.pausar || {};
  const congelar = r.congelar || {};
  const escalar = r.escalar || {};
  const ins = snap.insights || {};
  const out = { pausar: [], congelar: [], escalar: [], conta: [] };

  const killCpr = toNumber(pausar.cpr_acima);
  const killSpend = toNumber(pausar.gasto_min) ?? 0;
  const freqMax = toNumber(congelar.frequencia_acima);
  const scaleCpr = toNumber(escalar.cpr_ate);
  const days = snap.meta && snap.meta.period ? Math.round((Date.parse(snap.meta.period.until) - Date.parse(snap.meta.period.since)) / 86400000) + 1 : null;

  for (const g of groupBy(ins.ad || [], 'ad_id', 'ad_name', types)) {
    if (killCpr !== null && g.spend >= killSpend && (g.results === 0 || g.cpr > killCpr)) {
      out.pausar.push({ nivel: 'anuncio', id: g.id, nome: g.name, motivo: g.results === 0 ? `${brl(g.spend)} sem resultado (limite: CPR > ${brl(killCpr)} depois de ${brl(killSpend)})` : `CPR ${brl(g.cpr)} > ${brl(killCpr)} com ${brl(g.spend)} gastos` });
    }
  }
  for (const g of groupBy(ins.adset || [], 'adset_id', 'adset_name', types)) {
    if (freqMax !== null && g.frequency !== null && g.frequency > freqMax) {
      out.congelar.push({ nivel: 'conjunto', id: g.id, nome: g.name, motivo: `frequência ${dec(g.frequency)} > ${dec(freqMax)}: não aumentar verba; renovar criativo` });
    }
    if (scaleCpr !== null && g.results > 0 && g.cpr <= scaleCpr && (!escalar.dias || (days !== null && days >= escalar.dias))) {
      out.escalar.push({ nivel: 'conjunto', id: g.id, nome: g.name, motivo: `CPR ${brl(g.cpr)} ≤ ${brl(scaleCpr)} em ${days} dia(s): candidato a +${escalar.aumento_pct || 20}% (intervalo mínimo ${escalar.intervalo_h || 72} h; confira o evento qualificado antes)` });
    }
  }
  const total = sum(ins.campaign || [], types);
  const geral = toNumber(r.alerta_cpr_geral);
  if (geral !== null && total.cpr !== null && total.cpr > geral) out.conta.push(`CPR da conta ${brl(total.cpr)} acima do alerta de ${brl(geral)}.`);
  if (total.spend > 0 && total.results === 0) out.conta.push(`Gasto de ${brl(total.spend)} sem nenhum resultado: confira a mensuração antes de qualquer pausa.`);
  const acc = snap.account || {};
  if (acc.account_status !== undefined && Number(acc.account_status) !== 1) out.conta.push(`Conta com account_status=${acc.account_status}: a entrega pode estar parada.`);
  const cap = toNumber(acc.spend_cap); const spent = toNumber(acc.amount_spent);
  if (cap && spent !== null && cap > 0 && spent / cap > 0.85) out.conta.push(`Limite de gasto da conta em ${dec((spent / cap) * 100, 0)}%: a entrega para quando chegar a 100%.`);
  if (killCpr === null && scaleCpr === null && freqMax === null) out.conta.push('O perfil não tem regras_decisao definidas: defina pausar/congelar/escalar com o cliente.');
  return { periodo: snap.meta && snap.meta.period, total, ...out };
}

function toMarkdown(a, profile = {}) {
  const L = [];
  L.push(`# Alertas${profile.nome ? ` — ${profile.nome}` : ''}${a.periodo ? ` (${a.periodo.since} a ${a.periodo.until})` : ''}`);
  L.push('');
  L.push(`Investimento ${brl(a.total.spend)} · resultados ${dec(a.total.results, 0)} · custo por resultado ${brl(a.total.cpr)}`);
  L.push('');
  for (const msg of a.conta) L.push(`- ⚠️ ${msg}`);
  if (a.conta.length) L.push('');
  const section = (title, list) => {
    L.push(`## ${title} (${list.length})`);
    L.push('');
    if (!list.length) { L.push('Nenhum.'); L.push(''); return; }
    for (const x of list) L.push(`- **${x.nome}** (${x.nivel}): ${x.motivo}`);
    L.push('');
  };
  section('Candidatos a pausar', a.pausar);
  section('Congelar verba', a.congelar);
  section('Candidatos a escalar', a.escalar);
  L.push('> Nada foi alterado. Para agir, monte um plano: `neuro-ads-manager operacao nova <escopo>`, mostre ao aprovador e registre a aprovação.');
  return L.join('\n') + '\n';
}

module.exports = { alerts, toMarkdown };
