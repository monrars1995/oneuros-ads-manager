/**
 * Conversão offline e CAPI: normaliza e faz o hash (SHA-256) dos dados de contato, confere o arquivo
 * e monta o payload da Conversions API da Meta. O dado pessoal cru nunca vai para a saída.
 *
 * Regras de normalização (Meta, "Customer information parameters"):
 *   em  minúsculas, sem espaços                         → hash
 *   ph  só dígitos, com DDI (55 para o Brasil)          → hash
 *   fn/ln minúsculas, sem pontuação, UTF-8              → hash
 *   ct  minúsculas, sem espaços nem pontuação           → hash
 *   st  sigla de 2 letras, minúsculas (sp)              → hash
 *   zp  só dígitos/letras, sem espaço nem traço          → hash
 *   country  ISO 3166-1 alfa-2, minúsculas (br)         → hash
 *   db  AAAAMMDD  · ge  f | m                           → hash
 *   external_id  sem espaços                            → hash
 *   lead_id, ctwa_clid, fbc, fbp, client_ip_address, client_user_agent → sem hash
 */
const crypto = require('crypto');
const { CliError, parseCsv, toCsv, toNumber } = require('./util');

const HASHED = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'db', 'ge', 'external_id'];
const PLAIN = ['lead_id', 'ctwa_clid', 'fbc', 'fbp', 'client_ip_address', 'client_user_agent'];
const EVENT_FIELDS = ['event_name', 'event_time', 'event_id', 'action_source', 'value', 'currency', 'order_id', 'content_name', 'lead_event_source'];
const MATCH_KEYS = ['em', 'ph', 'external_id', 'lead_id', 'ctwa_clid', 'fbc', 'fbp'];

/** Nomes de coluna aceitos (pt-BR e en) → chave da Meta. */
const ALIASES = {
  em: ['em', 'email', 'e-mail', 'e_mail', 'mail'],
  ph: ['ph', 'phone', 'telefone', 'celular', 'whatsapp', 'fone', 'tel', 'telefone_celular'],
  fn: ['fn', 'first_name', 'primeiro_nome', 'nome_proprio'],
  ln: ['ln', 'last_name', 'sobrenome', 'ultimo_nome'],
  full_name: ['nome', 'nome_completo', 'name', 'full_name', 'cliente', 'lead'],
  ct: ['ct', 'city', 'cidade', 'municipio'],
  st: ['st', 'state', 'estado', 'uf'],
  zp: ['zp', 'zip', 'cep', 'postal_code'],
  country: ['country', 'pais', 'país'],
  db: ['db', 'birthdate', 'data_nascimento', 'nascimento', 'dob'],
  ge: ['ge', 'gender', 'genero', 'gênero', 'sexo'],
  external_id: ['external_id', 'id_cliente', 'id_externo', 'cliente_id', 'crm_id', 'contact_id'],
  lead_id: ['lead_id', 'leadgen_id', 'id_lead_meta'],
  ctwa_clid: ['ctwa_clid'],
  fbc: ['fbc', '_fbc'],
  fbp: ['fbp', '_fbp'],
  client_ip_address: ['client_ip_address', 'ip'],
  client_user_agent: ['client_user_agent', 'user_agent'],
  event_name: ['event_name', 'evento', 'event', 'etapa', 'status'],
  event_time: ['event_time', 'data', 'data_conversao', 'data_evento', 'timestamp', 'datahora', 'data_hora', 'created_at', 'date'],
  event_id: ['event_id', 'id_evento', 'id', 'id_conversao'],
  action_source: ['action_source', 'origem'],
  value: ['value', 'valor', 'receita', 'valor_venda', 'honorarios', 'ticket'],
  currency: ['currency', 'moeda'],
  order_id: ['order_id', 'pedido', 'id_pedido', 'contrato', 'matricula'],
  content_name: ['content_name', 'produto', 'servico', 'serviço', 'curso', 'area'],
  lead_event_source: ['lead_event_source', 'crm'],
};

const ACTION_SOURCES = ['website', 'app', 'phone_call', 'chat', 'email', 'physical_store', 'system_generated', 'business_messaging', 'other'];

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const isHash = (s) => /^[a-f0-9]{64}$/.test(String(s || ''));

function stripPunct(s) {
  return s.replace(/[\p{P}\p{S}]/gu, '');
}

/** Telefone em E.164 só com dígitos. Brasil por padrão: 10–11 dígitos ganham o 55; zero de tronco sai. */
function normalizePhone(raw, defaultCountry = '55') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (defaultCountry === '55') {
    if (d.length >= 11 && d.length <= 12 && d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    // celular brasileiro sem o 9 (55 + DDD + 8 dígitos começando em 6–9): mantém como veio; a Meta casa os dois formatos se você mandar os dois
  } else if (d.length <= 10 && defaultCountry) {
    d = defaultCountry + d.replace(/^0+/, '');
  }
  return d.length >= 8 ? d : '';
}

function normalizeDate(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  return /^\d{8}$/.test(s) ? s : '';
}

const NORMALIZERS = {
  em: (v) => String(v).trim().toLowerCase().replace(/\s+/g, ''),
  ph: (v, o) => normalizePhone(v, o.country),
  fn: (v) => stripPunct(String(v).trim().toLowerCase()).replace(/\s+/g, ' ').trim(),
  ln: (v) => stripPunct(String(v).trim().toLowerCase()).replace(/\s+/g, ' ').trim(),
  ct: (v) => stripPunct(String(v).toLowerCase()).replace(/\s+/g, ''),
  st: (v) => stripPunct(String(v).trim().toLowerCase()).replace(/\s+/g, '').slice(0, 2),
  zp: (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, ''),
  country: (v) => String(v).trim().toLowerCase().replace(/^brasil$|^brazil$/, 'br').slice(0, 2),
  db: (v) => normalizeDate(v),
  ge: (v) => { const s = String(v).trim().toLowerCase(); return /^(f|fem|feminino|female|mulher)/.test(s) ? 'f' : /^(m|masc|masculino|male|homem)/.test(s) ? 'm' : ''; },
  external_id: (v) => String(v).trim(),
};

/** Mapeia o cabeçalho do arquivo para as chaves da Meta. Devolve { chave: coluna }. */
function mapColumns(header) {
  const norm = (h) => h.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s-]+/g, '_');
  const byNorm = new Map(header.map((h) => [norm(h), h]));
  const map = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const col = byNorm.get(norm(n));
      if (col) { map[key] = col; break; }
    }
  }
  return map;
}

/** Data/hora → segundos Unix. Aceita ISO, AAAA-MM-DD, DD/MM/AAAA [HH:MM] e Unix (s ou ms). */
function toUnix(raw, tzOffset = '-03:00') {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{10}$/.test(s)) return Number(s);
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  let m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4] || '12'}:${m[5] || '00'}:${m[6] || '00'}${tzOffset}`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }
  m = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m) return Math.floor(Date.parse(`${m[1]}T12:00:00${tzOffset}`) / 1000);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  const t = Date.parse(hasTz ? s : s.replace(' ', 'T') + tzOffset);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** Uma linha do arquivo → { user_data, event, problems }. */
function normalizeRow(row, map, opts = {}) {
  const o = { country: opts.phoneCountry || '55' };
  const user = {};
  const problems = [];
  const get = (k) => (map[k] ? row[map[k]] : '');

  let fn = get('fn');
  let ln = get('ln');
  if (!fn && !ln && get('full_name')) {
    const parts = String(get('full_name')).trim().split(/\s+/);
    fn = parts[0] || '';
    ln = parts.length > 1 ? parts[parts.length - 1] : '';
  }
  const raw = { em: get('em'), ph: get('ph'), fn, ln, ct: get('ct'), st: get('st'), zp: get('zp'), country: get('country') || (opts.defaultCountry ?? 'br'), db: get('db'), ge: get('ge'), external_id: get('external_id') };
  for (const k of HASHED) {
    const v = raw[k];
    if (!v) continue;
    if (isHash(v)) { user[k] = String(v).toLowerCase(); continue; }
    const n = NORMALIZERS[k](v, o);
    if (n) user[k] = sha256(n);
    else if (k === 'em' || k === 'ph') problems.push(`${k === 'em' ? 'e-mail' : 'telefone'} inválido`);
  }
  if (user.em && raw.em && !isHash(raw.em) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw.em).trim())) problems.push('e-mail com formato estranho');
  for (const k of PLAIN) { const v = get(k); if (v) user[k] = String(v).trim(); }

  const event = {};
  event.event_name = get('event_name') || opts.eventName || '';
  event.event_time = toUnix(get('event_time'), opts.tz);
  event.event_id = get('event_id') || '';
  event.action_source = (get('action_source') || opts.actionSource || 'system_generated').toLowerCase();
  const value = toNumber(get('value'));
  if (value !== null) event.value = value;
  event.currency = (get('currency') || opts.currency || 'BRL').toUpperCase();
  if (get('order_id')) event.order_id = get('order_id');
  if (get('content_name')) event.content_name = get('content_name');
  if (get('lead_event_source') || opts.leadEventSource) event.lead_event_source = get('lead_event_source') || opts.leadEventSource;

  if (!event.event_name) problems.push('sem nome de evento');
  if (!event.event_time) problems.push('data inválida ou ausente');
  if (!ACTION_SOURCES.includes(event.action_source)) problems.push(`action_source desconhecido: ${event.action_source}`);
  if (!MATCH_KEYS.some((k) => user[k])) problems.push('sem chave de correspondência (e-mail, telefone, external_id, lead_id, ctwa_clid, fbc ou fbp)');
  return { user_data: user, event, problems };
}

/** Lê o CSV e devolve linhas normalizadas e um diagnóstico agregado (sem nenhum dado pessoal). */
function analyze(text, opts = {}) {
  const { header, rows, delimiter } = parseCsv(text);
  if (!header.length) throw new CliError('Arquivo vazio.');
  const map = mapColumns(header);
  const now = Math.floor((opts.now || Date.now()) / 1000);
  const out = [];
  const cov = Object.fromEntries([...HASHED, ...PLAIN].map((k) => [k, 0]));
  const issues = {};
  const ids = new Map();
  let tooOld = 0; let tooOld62 = 0; let future = 0; let noValue = 0;
  rows.forEach((row, i) => {
    const r = normalizeRow(row, map, opts);
    for (const k of Object.keys(cov)) if (r.user_data[k]) cov[k]++;
    if (r.event.event_time) {
      const age = (now - r.event.event_time) / 86400;
      // Regra da CAPI: até 7 dias; só action_source=physical_store aceita até 62 dias. Fora disso, retém.
      if (age > 62) { tooOld62++; r.problems.push('evento com mais de 62 dias (retido)'); }
      else if (age > 7) { tooOld++; if (r.event.action_source !== 'physical_store') r.problems.push('evento com mais de 7 dias fora de physical_store (retido)'); }
      if (age < -0.01) { future++; r.problems.push('data no futuro (retido)'); }
    }
    if (r.event.value === undefined) noValue++;
    if (!r.event.event_id) {
      // event_id estável: mesmo arquivo reenviado → mesmo id → a Meta deduplica
      const basis = [r.event.event_name, r.event.event_time, r.user_data.em || '', r.user_data.ph || '', r.user_data.external_id || '', r.user_data.lead_id || '', r.event.order_id || ''].join('|');
      r.event.event_id = 'nam_' + sha256(basis).slice(0, 24);
      r.generatedId = true;
    }
    if (opts.excludeIds && opts.excludeIds.has(r.event.event_id)) r.problems.push('já enviado antes (event_id no histórico)');
    else if (ids.has(r.event.event_id)) r.problems.push('event_id repetido no arquivo');
    ids.set(r.event.event_id, (ids.get(r.event.event_id) || 0) + 1);
    for (const p of r.problems) issues[p] = (issues[p] || 0) + 1;
    r.line = i + 2;
    out.push(r);
  });
  const dup = [...ids.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0);
  const total = rows.length;
  const events = {};
  for (const r of out) events[r.event.event_name || '(sem nome)'] = (events[r.event.event_name || '(sem nome)'] || 0) + 1;
  return {
    delimiter,
    columns: map,
    unmapped: header.filter((h) => !Object.values(map).includes(h)),
    total,
    valid: out.filter((r) => !r.problems.length).length,
    coverage: Object.fromEntries(Object.entries(cov).filter(([, n]) => n > 0).map(([k, n]) => [k, { n, pct: total ? (100 * n) / total : 0 }])),
    issues,
    duplicates: dup,
    olderThan7d: tooOld,
    olderThan62d: tooOld62,
    future,
    withoutValue: noValue,
    events,
    rows: out,
  };
}

/** Diagnóstico em texto, sem PII. */
function report(a) {
  const lines = [];
  lines.push(`Linhas: ${a.total} · válidas: ${a.valid} · com problema: ${a.total - a.valid}`);
  lines.push(`Colunas reconhecidas: ${Object.entries(a.columns).map(([k, c]) => `${c}→${k}`).join(', ') || 'nenhuma'}`);
  if (a.unmapped.length) lines.push(`Colunas ignoradas: ${a.unmapped.join(', ')}`);
  lines.push(`Eventos: ${Object.entries(a.events).map(([k, n]) => `${k} (${n})`).join(', ')}`);
  lines.push('Cobertura das chaves (quanto mais, melhor o match):');
  for (const [k, v] of Object.entries(a.coverage)) lines.push(`  ${k.padEnd(18)} ${String(v.n).padStart(6)}  ${v.pct.toFixed(1)}%`);
  const warn = [];
  if (!a.coverage.em && !a.coverage.ph && !a.coverage.lead_id && !a.coverage.ctwa_clid) warn.push('Sem e-mail, telefone, lead_id nem ctwa_clid: a correspondência vai ser muito baixa.');
  if (a.coverage.ph && a.coverage.ph.pct < 80) warn.push(`Telefone em só ${a.coverage.ph.pct.toFixed(0)}% das linhas.`);
  if (a.duplicates) warn.push(`${a.duplicates} linha(s) com event_id repetido: a Meta conta uma vez só.`);
  if (a.olderThan7d) warn.push(`${a.olderThan7d} evento(s) entre 7 e 62 dias: só seguem os de action_source=physical_store; os outros ficam retidos (não troque a data nem a origem para contornar).`);
  if (a.withoutValue && a.withoutValue < a.total) warn.push(`${a.withoutValue} linha(s) sem valor: o ROAS fica subestimado.`);
  for (const [p, n] of Object.entries(a.issues)) warn.push(`${n}× ${p}`);
  if (warn.length) { lines.push('Avisos:'); for (const w of warn) lines.push(`  ⚠️  ${w}`); }
  else lines.push('Sem avisos.');
  return lines.join('\n');
}

/** CSV de saída só com hashes e campos do evento (pronto para upload ou para a CAPI). */
function hashedCsv(a) {
  const keys = [...HASHED, ...PLAIN].filter((k) => a.coverage[k]);
  const header = [...EVENT_FIELDS, ...keys];
  const rows = a.rows.filter((r) => !r.problems.length).map((r) => ({ ...r.event, ...r.user_data }));
  return toCsv(header, rows);
}

/** Payload(s) da Conversions API, em lotes de até 1000 eventos. */
function capiPayloads(a, opts = {}) {
  const events = a.rows.filter((r) => !r.problems.length).map((r) => {
    const user = {};
    for (const [k, v] of Object.entries(r.user_data)) user[k] = HASHED.includes(k) ? [v] : v;
    const custom = {};
    if (r.event.value !== undefined) { custom.value = r.event.value; custom.currency = r.event.currency; }
    if (r.event.order_id) custom.order_id = r.event.order_id;
    if (r.event.content_name) custom.content_name = r.event.content_name;
    if (r.event.action_source === 'system_generated') {
      custom.event_source = 'crm';
      if (r.event.lead_event_source) custom.lead_event_source = r.event.lead_event_source;
    }
    const ev = { event_name: r.event.event_name, event_time: r.event.event_time, event_id: r.event.event_id, action_source: r.event.action_source, user_data: user };
    if (r.event.action_source === 'business_messaging') ev.messaging_channel = opts.messagingChannel || 'whatsapp';
    if (Object.keys(custom).length) ev.custom_data = custom;
    return ev;
  });
  const size = Math.min(1000, Math.max(1, opts.batch || 1000));
  const batches = [];
  for (let i = 0; i < events.length; i += size) {
    const p = { data: events.slice(i, i + size) };
    if (opts.testEventCode) p.test_event_code = opts.testEventCode;
    batches.push(p);
  }
  return batches;
}

module.exports = { sha256, normalizePhone, normalizeRow, mapColumns, toUnix, analyze, report, hashedCsv, capiPayloads, HASHED, PLAIN, ACTION_SOURCES };
