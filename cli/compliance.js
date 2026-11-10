/**
 * Verificação de compliance de copy e roteiro: aplica os conjuntos de regras de presets/compliance.json
 * (OAB, ECA/LGPD, saúde, financeiro, políticas da Meta) a um texto e devolve os achados por linha.
 *
 * É um filtro de primeira passada: acha termos e padrões de risco. Não substitui a revisão humana nem a do
 * subagente `revisor-compliance`, que avalia o contexto (ex.: "resultado" informativo × promessa de resultado).
 */
const path = require('path');
const { PRESETS_DIR, readJson, CliError } = require('./util');

let cache;
function rulesets() {
  if (!cache) cache = readJson(path.join(PRESETS_DIR, 'compliance.json')).conjuntos || {};
  return cache;
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Padrão sem acentos, mas sem mudar a caixa (\\S, \\D e \\W mudariam de sentido em minúsculas). */
const foldPattern = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

function compile(rule) {
  const flags = rule.flags || 'giu';
  return new RegExp(rule.padrao, flags.includes('g') ? flags : flags + 'g');
}

/**
 * @param {string} text  copy, roteiro ou legenda
 * @param {string[]} ids conjuntos de regras (ex.: ['oab', 'meta_politicas'])
 * @returns {{ achados: object[], obrigatorios: object[], resumo: object }}
 */
function check(text, ids) {
  const all = rulesets();
  const unknown = ids.filter((id) => !all[id]);
  if (unknown.length) throw new CliError(`Conjunto de regras desconhecido: ${unknown.join(', ')}. Disponíveis: ${Object.keys(all).join(', ')}`, 2);
  const lines = String(text).split(/\r?\n/);
  const folded = lines.map(fold);
  const achados = [];
  const obrigatorios = [];
  for (const id of ids) {
    const set = all[id];
    for (const rule of set.regras || []) {
      const re = compile({ ...rule, padrao: foldPattern(rule.padrao) });
      folded.forEach((ln, i) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(ln))) {
          achados.push({ conjunto: id, regra: rule.id, severidade: rule.severidade || 'alto', linha: i + 1, trecho: lines[i].slice(m.index, m.index + m[0].length), mensagem: rule.mensagem, sugestao: rule.sugestao || '', base: rule.base || set.base_legal || '' });
          if (m[0].length === 0) re.lastIndex++;
        }
      });
    }
    for (const req of set.obrigatorios || []) {
      const re = new RegExp(foldPattern(req.padrao), 'iu');
      if (!re.test(fold(text))) obrigatorios.push({ conjunto: id, regra: req.id, severidade: req.severidade || 'medio', mensagem: req.mensagem, base: req.base || set.base_legal || '' });
    }
  }
  const order = { critico: 0, alto: 1, medio: 2, baixo: 3 };
  achados.sort((a, b) => (order[a.severidade] ?? 9) - (order[b.severidade] ?? 9) || a.linha - b.linha);
  const resumo = { critico: 0, alto: 0, medio: 0, baixo: 0 };
  for (const a of [...achados, ...obrigatorios]) resumo[a.severidade] = (resumo[a.severidade] || 0) + 1;
  return { achados, obrigatorios, resumo, conjuntos: ids };
}

function format(result) {
  const out = [];
  const icon = { critico: '⛔', alto: '🔴', medio: '🟠', baixo: '🟡' };
  if (!result.achados.length && !result.obrigatorios.length) {
    out.push(`✅ Nenhum termo de risco encontrado (${result.conjuntos.join(', ')}). Ainda vale a revisão de contexto.`);
    return out.join('\n');
  }
  const bases = new Map();
  for (const a of result.achados) {
    out.push(`${icon[a.severidade] || '•'} L${a.linha} [${a.conjunto}/${a.regra}]${a.trecho ? ` "${a.trecho}"` : ''}: ${a.mensagem}${a.sugestao ? `\n     ↳ ${a.sugestao}` : ''}`);
    if (a.base) bases.set(a.conjunto, a.base);
  }
  for (const o of result.obrigatorios) { out.push(`${icon[o.severidade] || '•'} [${o.conjunto}/${o.regra}] falta: ${o.mensagem}`); if (o.base) bases.set(o.conjunto, o.base); }
  if (bases.size) { out.push('\nBase:'); for (const [k, b] of bases) out.push(`  ${k}: ${b}`); }
  const r = result.resumo;
  out.push(`\nResumo: ${r.critico} crítico(s), ${r.alto} alto(s), ${r.medio} médio(s), ${r.baixo} baixo(s).`);
  return out.join('\n');
}

/**
 * Limites de tamanho da copy (ex.: título ≤ 40, primeira linha ≤ 125, corpo ≤ 2.200), vindos do conjunto de
 * regras (`limites_copy`) ou do perfil (`criativos.limites_copy`). Acrescenta os achados ao resultado.
 */
function lengthChecks(result, text, { titulo, limites } = {}) {
  const lim = { ...(limites || {}) };
  for (const id of result.conjuntos) Object.assign(lim, { ...(rulesets()[id].limites_copy || {}), ...(limites || {}) });
  const add = (regra, msg) => { result.achados.push({ conjunto: 'tamanho', regra, severidade: 'medio', linha: 1, trecho: '', mensagem: msg, sugestao: '', base: 'limites de copy do perfil' }); result.resumo.medio++; };
  const body = String(text).trim();
  const first = body.split(/\r?\n/)[0] || '';
  if (lim.titulo && titulo && [...titulo].length > lim.titulo) add('titulo', `Título com ${[...titulo].length} caracteres (máximo ${lim.titulo}).`);
  if (lim.primeira_linha && [...first].length > lim.primeira_linha) add('primeira_linha', `Primeira linha com ${[...first].length} caracteres (máximo ${lim.primeira_linha}; o resto fica atrás do "ver mais").`);
  if (lim.corpo && [...body].length > lim.corpo) add('corpo', `Texto com ${[...body].length} caracteres (máximo ${lim.corpo}).`);
  return result;
}

/** Código de saída: 1 se houver crítico ou alto. */
const exitCode = (result) => (result.resumo.critico || result.resumo.alto ? 1 : 0);

module.exports = { rulesets, check, format, exitCode, lengthChecks };
