/**
 * Perfis de cliente: os que vêm com a skill (presets/perfis.json) e os do usuário (~/.neuro-ads-manager/perfis/<id>.json),
 * que têm prioridade. Um perfil nunca guarda IDs de conta, pixel, página, tokens ou dados pessoais: só as
 * variáveis de ambiente onde esses valores estão.
 */
const fs = require('fs');
const path = require('path');
const { PRESETS_DIR, USER_HOME, CliError, readJson } = require('./util');

const USER_DIR = path.join(USER_HOME, 'perfis');
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;
/** Campos que parecem ID ou segredo: recusados ao gravar um perfil. */
const FORBIDDEN_VALUE = [/\bact_\d{6,}\b/, /\bEAA[A-Za-z0-9]{20,}/, /\b\d{14,}\b/, /\b[\w.+-]+@[\w-]+\.[\w.]+\b/];

function builtins() {
  const data = readJson(path.join(PRESETS_DIR, 'perfis.json'));
  return data.perfis || {};
}

function userProfiles() {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(USER_DIR).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of files) {
    try { const p = JSON.parse(fs.readFileSync(path.join(USER_DIR, f), 'utf8')); out[p.id || f.replace(/\.json$/, '')] = { ...p, _origem: 'usuario' }; } catch { /* ignora arquivo inválido */ }
  }
  return out;
}

function deepMerge(base, over) {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(out[k], v);
  return out;
}

/** Perfil resolvido: `base` (outro perfil) por baixo, depois o próprio perfil. */
function resolve(id, all = list()) {
  const p = all[id];
  if (!p) throw new CliError(`Perfil não encontrado: ${id}. Veja: neuro-ads-manager perfil listar`, 2);
  if (p.base && p.base !== id && all[p.base]) return deepMerge(resolve(p.base, all), { ...p, base: p.base });
  return p;
}

function list() {
  const b = builtins();
  const out = {};
  for (const [k, v] of Object.entries(b)) out[k] = { ...v, id: k, _origem: 'skill' };
  for (const [k, v] of Object.entries(userProfiles())) out[k] = { ...v, id: k };
  return out;
}

function validate(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['o perfil precisa ser um objeto JSON'];
  if (!ID_RE.test(p.id || '')) errors.push('id: use minúsculas, números, _ ou - (2 a 41 caracteres)');
  if (!p.nome) errors.push('nome: obrigatório');
  if (!p.segmento) errors.push('segmento: obrigatório');
  if (p.compliance && !Array.isArray(p.compliance.regras)) errors.push('compliance.regras: lista de ids de conjuntos de regras (ex.: ["oab", "lgpd"])');
  const text = JSON.stringify(p);
  for (const re of FORBIDDEN_VALUE) if (re.test(text)) errors.push(`valor que parece ID de conta, token, telefone/ID longo ou e-mail (${re}); guarde o nome da variável de ambiente, não o valor`);
  return errors;
}

function save(p) {
  const errors = validate(p);
  if (errors.length) throw new CliError('Perfil recusado:\n  - ' + errors.join('\n  - '), 2);
  fs.mkdirSync(USER_DIR, { recursive: true });
  const { _origem, ...clean } = p;
  const file = path.join(USER_DIR, `${p.id}.json`);
  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + '\n');
  return file;
}

function remove(id) {
  const file = path.join(USER_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new CliError(`Só perfis do usuário podem ser removidos (${file} não existe).`, 2);
  fs.unlinkSync(file);
  return file;
}

module.exports = { list, resolve, validate, save, remove, builtins, USER_DIR, deepMerge };
