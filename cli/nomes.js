/**
 * Nomenclatura de campanhas, conjuntos e anúncios. O modelo vem do perfil (`nomenclatura`) ou do padrão
 * de presets/nomenclatura.json. Placeholders `{campo}`; valores aceitos por campo em `valores`.
 */
const path = require('path');
const { PRESETS_DIR, readJson, CliError } = require('./util');

function defaults() {
  return readJson(path.join(PRESETS_DIR, 'nomenclatura.json'));
}

function modelFor(profile) {
  const d = defaults();
  const n = (profile && profile.nomenclatura) || {};
  return {
    separador: n.separador || d.separador,
    campanha: n.campanha || d.campanha,
    conjunto: n.conjunto || d.conjunto,
    anuncio: n.anuncio || d.anuncio,
    valores: { ...d.valores, ...(n.valores || {}) },
  };
}

const LEVELS = { campanha: 'campanha', campaign: 'campanha', conjunto: 'conjunto', adset: 'conjunto', anuncio: 'anuncio', 'anúncio': 'anuncio', ad: 'anuncio' };

function level(l) {
  const v = LEVELS[String(l || '').toLowerCase()];
  if (!v) throw new CliError(`Nível inválido: ${l} (campanha | conjunto | anuncio)`, 2);
  return v;
}

const slug = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9+.-]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();

/** Gera o nome a partir dos campos. Campos ausentes viram erro. */
function build(model, lvl, fields) {
  const tpl = model[level(lvl)];
  const missing = [];
  const name = tpl.replace(/\{([a-z_]+)\}/g, (_, k) => {
    const v = fields[k];
    if (v === undefined || v === '') { missing.push(k); return `{${k}}`; }
    return slug(v);
  });
  if (missing.length) throw new CliError(`Faltam campos para o nome do ${level(lvl)}: ${missing.join(', ')} (modelo: ${tpl})`, 2);
  return name;
}

/** Regex de validação a partir do modelo. */
function pattern(model, lvl) {
  const tpl = model[level(lvl)];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = '';
  let last = 0;
  const fields = [];
  tpl.replace(/\{([a-z_]+)\}/g, (m, k, idx) => {
    re += esc(tpl.slice(last, idx));
    const allowed = model.valores[k];
    re += allowed && allowed.length ? `(${allowed.map((v) => esc(slug(v))).join('|')})` : '([^' + esc(model.separador) + ']+)';
    fields.push(k);
    last = idx + m.length;
    return m;
  });
  re += esc(tpl.slice(last));
  return { re: new RegExp('^' + re + '$', 'i'), fields, tpl };
}

function check(model, lvl, name) {
  const p = pattern(model, lvl);
  const m = p.re.exec(String(name).trim());
  if (!m) return { ok: false, modelo: p.tpl };
  return { ok: true, modelo: p.tpl, campos: Object.fromEntries(p.fields.map((f, i) => [f, m[i + 1]])) };
}

module.exports = { modelFor, build, check, pattern, level, slug };
