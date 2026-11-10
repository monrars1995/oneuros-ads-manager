/**
 * Métricas a partir dos insights da Meta (ou de uma exportação CSV do Gerenciador de Anúncios):
 * soma por nível, resultado conforme o perfil, custo por resultado, ROAS e comparação de períodos.
 */
const { toNumber, div, parseCsv } = require('./util');

/** Tipos de ação que contam como "resultado" quando o perfil não define. */
const DEFAULT_RESULT_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
];

function actionValue(list, types) {
  if (!Array.isArray(list)) return 0;
  let best = 0;
  // Um mesmo evento aparece com vários nomes (lead e offsite_conversion.fb_pixel_lead); use o primeiro tipo
  // da lista que existir, para não somar duas vezes.
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) { best = toNumber(hit.value) || 0; break; }
  }
  return best;
}

/** Linha de insight → números. `types` = tipos de ação que contam como resultado (em ordem de preferência). */
function rowMetrics(r, types = DEFAULT_RESULT_TYPES) {
  if (r.__csv) return r.__csv;
  const spend = toNumber(r.spend) || 0;
  const impressions = toNumber(r.impressions) || 0;
  const reach = toNumber(r.reach);
  const linkClicks = toNumber(r.inline_link_clicks) ?? toNumber(r.clicks) ?? 0;
  const results = actionValue(r.actions, types);
  const value = actionValue(r.action_values, types.filter((t) => /purchase|lead|registration/.test(t)));
  const thruplay = Array.isArray(r.video_thruplay_watched_actions) ? toNumber(r.video_thruplay_watched_actions[0]?.value) : null;
  const p100 = Array.isArray(r.video_p100_watched_actions) ? toNumber(r.video_p100_watched_actions[0]?.value) : null;
  return { spend, impressions, reach, linkClicks, results, value, thruplay, p100, frequency: toNumber(r.frequency) };
}

function sum(rows, types) {
  const t = { spend: 0, impressions: 0, reach: 0, linkClicks: 0, results: 0, value: 0, thruplay: 0, p100: 0, hasReach: false };
  for (const r of rows) {
    const m = rowMetrics(r, types);
    t.spend += m.spend; t.impressions += m.impressions; t.linkClicks += m.linkClicks; t.results += m.results; t.value += m.value;
    if (m.reach !== null && m.reach !== undefined) { t.reach += m.reach; t.hasReach = true; }
    t.thruplay += m.thruplay || 0; t.p100 += m.p100 || 0;
  }
  return derive(t);
}

function derive(t) {
  return {
    ...t,
    reach: t.hasReach ? t.reach : null,
    frequency: t.hasReach && t.reach ? t.impressions / t.reach : null,
    ctr: div(t.linkClicks * 100, t.impressions),
    cpc: div(t.spend, t.linkClicks),
    cpm: div(t.spend * 1000, t.impressions),
    cpr: div(t.spend, t.results),
    convRate: div(t.results * 100, t.linkClicks),
    roas: t.value ? div(t.value, t.spend) : null,
  };
}

/** Variação percentual de `a` sobre `b`. */
const delta = (a, b) => (a === null || b === null || b === undefined || !b ? null : ((a - b) / Math.abs(b)) * 100);

/** Agrupa linhas de insight por uma chave (campaign_id, adset_id, ad_id). */
function groupBy(rows, key, nameKey, types) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key] || r[nameKey] || '(sem id)';
    if (!map.has(k)) map.set(k, { id: r[key], name: r[nameKey] || k, rows: [], raw: r });
    map.get(k).rows.push(r);
  }
  return [...map.values()].map((g) => ({ id: g.id, name: g.name, raw: g.raw, ...sum(g.rows, types) }));
}

// ---------- exportação do Gerenciador de Anúncios (CSV) ------------------------------------------

const CSV_COLUMNS = {
  campaign_name: ['nome da campanha', 'campaign name'],
  adset_name: ['nome do conjunto de anúncios', 'ad set name'],
  ad_name: ['nome do anúncio', 'ad name'],
  spend: ['valor usado (brl)', 'valor gasto (brl)', 'valor usado', 'amount spent (brl)', 'amount spent', 'spend'],
  impressions: ['impressões', 'impressions'],
  reach: ['alcance', 'reach'],
  frequency: ['frequência', 'frequency'],
  linkClicks: ['cliques no link', 'link clicks'],
  results: ['resultados', 'results'],
  value: ['valor de conversão de compras', 'purchases conversion value', 'valor de conversão'],
  day: ['dia', 'day', 'início dos relatórios', 'reporting starts'],
};

function fromAdsManagerCsv(text) {
  const { header, rows } = parseCsv(text);
  const low = header.map((h) => h.toLowerCase().trim());
  const col = {};
  for (const [k, names] of Object.entries(CSV_COLUMNS)) {
    const i = low.findIndex((h) => names.includes(h));
    if (i >= 0) col[k] = header[i];
  }
  return {
    columns: col,
    rows: rows.map((r) => {
      const n = (k) => (col[k] ? toNumber(r[col[k]]) : null);
      const m = { spend: n('spend') || 0, impressions: n('impressions') || 0, reach: n('reach'), linkClicks: n('linkClicks') || 0, results: n('results') || 0, value: n('value') || 0, thruplay: null, p100: null, frequency: n('frequency') };
      return {
        campaign_name: col.campaign_name ? r[col.campaign_name] : undefined,
        adset_name: col.adset_name ? r[col.adset_name] : undefined,
        ad_name: col.ad_name ? r[col.ad_name] : undefined,
        date_start: col.day ? r[col.day] : undefined,
        __csv: m,
      };
    }),
  };
}

module.exports = { DEFAULT_RESULT_TYPES, actionValue, rowMetrics, sum, derive, delta, groupBy, fromAdsManagerCsv };
