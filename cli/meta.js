/**
 * Cliente da Graph/Marketing API da Meta, só leitura (GET). Nesta versão o plugin não escreve na conta.
 *
 * - Token: variável META_ACCESS_TOKEN (ou a indicada em --token-env). Nunca é impresso: erros e logs passam
 *   por `redact()`. Nenhum arquivo .env é lido pelo CLI; carregue o ambiente você mesmo.
 * - Versão da API: META_GRAPH_VERSION (padrão abaixo) ou --api-version.
 * - Paginação por `paging.next`, novas tentativas com espera exponencial nos erros transitórios e de limite
 *   (códigos 1, 2, 4, 17, 32, 341, 613, 80000–80014) e pausa quando os cabeçalhos de uso passam de 75%.
 */
const { CliError } = require('./util');

const DEFAULT_VERSION = 'v27.0';
const RETRY_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const isAdsThrottle = (c) => c >= 80000 && c <= 80014;

function redact(s) {
  return String(s)
    .replace(/access_token=[^&\s"']+/g, 'access_token=***')
    .replace(/EAA[A-Za-z0-9]{20,}/g, 'EAA***');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Maior percentual de uso informado nos cabeçalhos x-app-usage, x-ad-account-usage e x-business-use-case-usage. */
function usagePct(headers) {
  let max = 0;
  const read = (name) => { try { return JSON.parse(headers.get(name) || 'null'); } catch { return null; } };
  const app = read('x-app-usage');
  if (app) max = Math.max(max, app.call_count || 0, app.total_cputime || 0, app.total_time || 0);
  const acc = read('x-ad-account-usage');
  if (acc) max = Math.max(max, acc.acc_id_util_pct || 0);
  const buc = read('x-business-use-case-usage');
  if (buc) for (const arr of Object.values(buc)) for (const u of arr || []) max = Math.max(max, u.call_count || 0, u.total_cputime || 0, u.total_time || 0, (u.estimated_time_to_regain_access || 0) > 0 ? 100 : 0);
  return max;
}

class MetaClient {
  constructor(opts = {}) {
    const envName = opts.tokenEnv || 'META_ACCESS_TOKEN';
    this.token = opts.token || process.env[envName];
    if (!this.token) throw new CliError(`Defina ${envName} no ambiente (o token nunca é lido de arquivo pelo CLI). Ex.: export ${envName}=...  — use um token de usuário do sistema com ads_read.`, 2);
    this.version = opts.version || process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
    this.base = `https://graph.facebook.com/${this.version}`;
    this.fetch = opts.fetch || globalThis.fetch;
    this.maxRetries = opts.maxRetries ?? 5;
    this.verbose = !!opts.verbose;
    this.calls = 0;
    this.lastUsage = 0;
  }

  url(pathOrUrl, params = {}) {
    const u = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : `${this.base}/${pathOrUrl.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return u;
  }

  async request(method, pathOrUrl, params = {}, body) {
    const u = this.url(pathOrUrl, method === 'GET' ? params : {});
    for (let attempt = 0; ; attempt++) {
      if (this.lastUsage >= 75) {
        const wait = Math.min(60000, 5000 * (this.lastUsage >= 95 ? 6 : 1));
        if (this.verbose) process.stderr.write(`  uso da API em ${this.lastUsage}%: pausa de ${wait / 1000}s\n`);
        await sleep(wait);
      }
      this.calls++;
      let res; let json;
      try {
        res = await this.fetch(u, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        this.lastUsage = usagePct(res.headers);
        json = await res.json().catch(() => ({}));
      } catch (e) {
        if (attempt < this.maxRetries) { await sleep(1000 * 2 ** attempt); continue; }
        throw new CliError(`Falha de rede na Graph API: ${redact(e.message)}`);
      }
      if (res.ok && !json.error) return json;
      const err = json.error || {};
      const code = Number(err.code);
      const transient = err.is_transient || RETRY_CODES.has(code) || isAdsThrottle(code) || res.status >= 500;
      if (transient && attempt < this.maxRetries) {
        const wait = Math.min(120000, 2000 * 2 ** attempt);
        if (this.verbose) process.stderr.write(`  erro ${code || res.status} (transitório): nova tentativa em ${wait / 1000}s\n`);
        await sleep(wait);
        continue;
      }
      const hint = code === 190 ? ' (token inválido ou expirado)' : code === 10 || code === 200 ? ' (permissão: confira ads_read/ads_management e o acesso à conta)' : code === 100 ? ' (parâmetro ou campo inválido para esta versão da API)' : isAdsThrottle(code) || code === 17 ? ' (limite de uso: tente mais tarde ou peça o Full Access do Marketing API Access Tier)' : '';
      throw new CliError(`Graph API ${res.status} · código ${code || '?'}${err.error_subcode ? '/' + err.error_subcode : ''}: ${redact(err.message || 'erro desconhecido')}${hint}`);
    }
  }

  get(path, params) { return this.request('GET', path, params); }

  /** Todas as páginas de uma aresta (`data` + `paging.next`). */
  async all(path, params = {}, limit = 5000) {
    const out = [];
    let lastKey = null;
    let page = await this.get(path, { limit: 200, ...params });
    for (;;) {
      out.push(...(page.data || []));
      const next = page.paging && page.paging.next;
      if (!next || out.length >= limit) break;
      // a URL de `next` pode trazer o token: tira antes de usar (o token vai no cabeçalho) e nunca a guarda
      const u = new URL(next);
      u.searchParams.delete('access_token');
      const key = u.searchParams.get('after') || u.toString();
      if (key === lastKey) throw new CliError(`A paginação não avançou em ${path} (cursor repetido).`);
      lastKey = key;
      page = await this.get(u.toString());
    }
    return out;
  }
}

const normAccount = (id) => {
  const s = String(id || '').trim();
  if (!s) throw new CliError('Informe a conta de anúncio: --conta act_<id> (ou a variável META_AD_ACCOUNT_ID).', 2);
  return s.startsWith('act_') ? s : `act_${s.replace(/\D/g, '')}`;
};

const FIELDS = {
  account: 'name,account_status,disable_reason,currency,timezone_name,amount_spent,spend_cap,business_country_code',
  campaigns: 'id,name,objective,status,effective_status,buying_type,bid_strategy,daily_budget,lifetime_budget,special_ad_categories,special_ad_category_country,start_time,stop_time,created_time,updated_time',
  adsets: 'id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,destination_type,promoted_object,attribution_spec,targeting,learning_stage_info,start_time,end_time,updated_time',
  ads: 'id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative{id,name,object_type,title,body,call_to_action_type,thumbnail_url,video_id,image_hash,instagram_permalink_url}',
  audiences: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_updated',
  insights: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,cpc,cpm,actions,cost_per_action_type,action_values,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,quality_ranking,engagement_rate_ranking,conversion_rate_ranking',
};

/** Retrato completo da conta para auditoria e relatório: estrutura + insights por nível no período. */
async function snapshot(client, accountId, period, opts = {}) {
  const act = normAccount(accountId);
  const filtering = opts.ativos ? [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'] }] : undefined;
  const timeRange = { since: period.since, until: period.until };
  const account = await client.get(act, { fields: FIELDS.account });
  const campaigns = await client.all(`${act}/campaigns`, { fields: FIELDS.campaigns, filtering });
  const adsets = await client.all(`${act}/adsets`, { fields: FIELDS.adsets, filtering });
  const ads = await client.all(`${act}/ads`, { fields: FIELDS.ads, filtering });
  const insights = {};
  for (const level of opts.niveis || ['campaign', 'adset', 'ad']) {
    insights[level] = await client.all(`${act}/insights`, { level, fields: FIELDS.insights, time_range: timeRange, use_unified_attribution_setting: true, action_attribution_windows: opts.janelas || undefined });
  }
  let daily = [];
  if (opts.diario !== false) daily = await client.all(`${act}/insights`, { level: 'account', fields: 'spend,impressions,clicks,inline_link_clicks,actions,action_values', time_range: timeRange, time_increment: 1, use_unified_attribution_setting: true });
  let previous = null;
  if (opts.anterior) previous = await client.all(`${act}/insights`, { level: 'campaign', fields: FIELDS.insights, time_range: opts.anterior, use_unified_attribution_setting: true });
  let audiences = [];
  try { audiences = await client.all(`${act}/customaudiences`, { fields: FIELDS.audiences }); } catch (e) { audiences = { error: e.message }; }
  return {
    meta: { generated_at: new Date().toISOString(), api_version: client.version, account_id: act, period: timeRange, previous_period: opts.anterior || null, calls: client.calls, source: 'graph-api' },
    account, campaigns, adsets, ads, insights, daily, previous, audiences,
  };
}

/** Pixel/dataset: dados básicos e contagem por evento (stats), para a conferência de conversão. */
async function datasetInfo(client, datasetId) {
  let info;
  try {
    info = await client.get(datasetId, { fields: 'name,last_fired_time,is_unavailable,enable_automatic_matching,automatic_matching_fields,first_party_cookie_status,data_use_setting' });
  } catch (e) {
    if (!/código 100/.test(e.message)) throw e;
    info = await client.get(datasetId, { fields: 'name,last_fired_time' });
  }
  let stats = null;
  try { stats = await client.get(`${datasetId}/stats`, { aggregation: 'event' }); } catch (e) { stats = { error: e.message }; }
  return { info, stats };
}

module.exports = { MetaClient, snapshot, datasetInfo, normAccount, redact, usagePct, FIELDS, DEFAULT_VERSION };
