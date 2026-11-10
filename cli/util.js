/**
 * Utilidades do CLI do neuro-ads-manager: caminhos, cores, leitura de argumentos, CSV e números.
 * Sem dependências externas (Node 20+).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(PKG_ROOT, 'skills', 'neuro-ads-manager');
const PRESETS_DIR = path.join(SKILL_DIR, 'presets');
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');
/** Biblioteca do usuário (perfis próprios, memória). Sobrevive às atualizações do plugin. */
const USER_HOME = process.env.NEURO_ADS_HOME || path.join(os.homedir(), '.neuro-ads-manager');

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
  reset: tty ? '\x1b[0m' : '',
  bold: tty ? '\x1b[1m' : '',
  gold: tty ? '\x1b[33m' : '',
  green: tty ? '\x1b[32m' : '',
  red: tty ? '\x1b[31m' : '',
  cyan: tty ? '\x1b[36m' : '',
  gray: tty ? '\x1b[90m' : '',
};

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/**
 * Lê `args` em { _: [posicionais], flag: valor }. `--x=y`, `--x y` e `--x` (booleano).
 * `spec.bool` lista as flags booleanas (não consomem o próximo argumento); `spec.multi` as repetíveis.
 */
function parseArgs(args, spec = {}) {
  const bool = new Set(spec.bool || []);
  const multi = new Set(spec.multi || []);
  const alias = spec.alias || {};
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (a === '--') { out._.push(...args.slice(i + 1)); break; }
    if (!a.startsWith('-') || a === '-') { out._.push(a); continue; }
    let value;
    const eq = a.indexOf('=');
    if (eq > 0) { value = a.slice(eq + 1); a = a.slice(0, eq); }
    let key = a.replace(/^--?/, '');
    if (alias[key]) key = alias[key];
    if (bool.has(key)) {
      out[key] = value === undefined ? true : !['0', 'false', 'nao', 'não', 'no'].includes(String(value).toLowerCase());
      continue;
    }
    if (value === undefined) {
      value = args[i + 1];
      if (value === undefined || (value.startsWith('--') && value.length > 2)) throw new CliError(`A opção --${key} precisa de um valor.`, 2);
      i++;
    }
    if (multi.has(key)) (out[key] = out[key] || []).push(value);
    else out[key] = value;
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw new CliError(`Arquivo não encontrado: ${file}`);
    throw new CliError(`JSON inválido em ${file}: ${e.message}`);
  }
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, content);
}

function readText(fileOrDash) {
  if (fileOrDash === '-' || fileOrDash === undefined) return fs.readFileSync(0, 'utf8');
  try { return fs.readFileSync(fileOrDash, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') throw new CliError(`Arquivo não encontrado: ${fileOrDash}`);
    throw e;
  }
}

/** Arquivos que nunca devem ser lidos pelo CLI nem pelos agentes (segredos). */
function isSecretPath(file) {
  const base = path.basename(String(file));
  return /^\.env(\..*)?$/.test(base) && base !== '.env.example'
    || /credentials/i.test(base)
    || /\.(pem|key|p12)$/i.test(base);
}

function assertNotSecret(file) {
  if (isSecretPath(file)) throw new CliError(`Recusado: ${path.basename(file)} pode conter segredos e não é lido pelo neuro-ads-manager.`, 2);
}

// ---------- CSV ----------------------------------------------------------------------------------

function detectDelimiter(firstLine) {
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** CSV com aspas, quebras dentro de aspas e delimitador detectado (`,`, `;` ou TAB). */
function parseCsv(text, delimiter) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const d = delimiter || detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  if (!rows.length) return { header: [], rows: [], delimiter: d };
  const header = rows[0].map((h) => h.trim());
  const objs = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, rows: objs, delimiter: d };
}

function toCsv(header, rows, delimiter = ',') {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.map(esc).join(delimiter), ...rows.map((r) => header.map((h) => esc(r[h])).join(delimiter))].join('\n') + '\n';
}

// ---------- números e datas ----------------------------------------------------------------------

/** Converte "1.234,56", "1234.56", "R$ 1.234" em número. Vazio → null. */
function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s%]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const brl = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const int = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('pt-BR'));
const dec = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${dec(n, d)}%`);
const div = (a, b) => (a === null || b === null || !b ? null : a / b);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** "7d", "30d", "ontem", "mes" (mês corrente), "mes-passado" ou "AAAA-MM-DD:AAAA-MM-DD". */
function resolvePeriod(spec, now = new Date()) {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = 86400000;
  if (!spec || /^\d+d$/.test(spec)) {
    const n = spec ? parseInt(spec, 10) : 7;
    return { since: isoDate(new Date(today - n * day)), until: isoDate(new Date(today - day)) };
  }
  if (spec === 'ontem') { const y = isoDate(new Date(today - day)); return { since: y, until: y }; }
  if (spec === 'mes') return { since: isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), until: isoDate(new Date(today - day)) };
  if (spec === 'mes-passado') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { since: isoDate(first), until: isoDate(last) };
  }
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(spec);
  if (m) return { since: m[1], until: m[2] };
  throw new CliError(`Período inválido: ${spec} (use 7d, 30d, ontem, mes, mes-passado ou AAAA-MM-DD:AAAA-MM-DD)`, 2);
}

/** O período imediatamente anterior, com o mesmo número de dias. */
function previousPeriod({ since, until }) {
  const day = 86400000;
  const s = Date.parse(since + 'T00:00:00Z');
  const u = Date.parse(until + 'T00:00:00Z');
  const len = Math.round((u - s) / day) + 1;
  return { since: isoDate(new Date(s - len * day)), until: isoDate(new Date(s - day)) };
}

function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

module.exports = {
  PKG_ROOT, SKILL_DIR, PRESETS_DIR, TEMPLATES_DIR, USER_HOME, C, CliError,
  parseArgs, readJson, writeFile, readText, isSecretPath, assertNotSecret,
  parseCsv, toCsv, toNumber, brl, int, dec, pct, div, isoDate, resolvePeriod, previousPeriod, stamp,
};
