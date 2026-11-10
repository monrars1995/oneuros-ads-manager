/**
 * neuro-ads-manager no Neuro Harness (DeepSeek Harness 0.2.x).
 *
 * Plugin Cordis que registra, no serviço `skills` do Harness, um provedor imutável com:
 *   - a skill `neuro-ads-manager` (skills/neuro-ads-manager/SKILL.md), que o modelo carrega sozinho;
 *   - um comando por arquivo de `commands/*.md` (`neuro-ads-auditar`, `neuro-ads-planejar`, …),
 *     que o usuário chama pelo nome e o modelo não vê no catálogo;
 *   - o `bin/` do pacote no PATH enquanto o plugin estiver ativo (comando `neuro-ads-manager`).
 *
 * Mesmo desenho do `@deepseek-ai/dsh-skill-badge`: o catálogo é montado ao carregar o plugin e o corpo
 * é relido do disco a cada `get`, então editar um SKILL.md não pede reinício. Sem dependências: o
 * pacote pode ser ligado ao perfil por `link:` (pnpm) sem resolver nada do Harness.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL_DIR = path.join(ROOT, 'skills', 'neuro-ads-manager');
const COMMANDS_DIR = path.join(ROOT, 'commands');
const BIN_DIR = path.join(ROOT, 'bin');

/** Mesmo valor de BUNDLED_SKILL_RANK do `@deepseek-ai/dsh-skill` (fixado para não depender do pacote). */
const BUNDLED_RANK = 600;
const PROVIDER_NAME = 'neuro-ads-manager';
const COMMAND_PREFIX = 'neuro-ads-';

/** Frontmatter YAML simples (chave: valor numa linha, aspas opcionais). Suficiente para os arquivos do plugin. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

/** O corpo de um comando do Claude Code, adaptado ao Harness (sem `$ARGUMENTS` nem PATH do plugin). */
export function adaptCommandBody(name, body, argumentHint) {
  const intro = [
    `> Comando \`${name}\` do plugin neuro-ads-manager no Neuro Harness.`,
    `> Os argumentos são o texto que o usuário escreveu junto com o comando${argumentHint ? ` (formato: \`${argumentHint}\`)` : ''}. Sem argumentos, pergunte o que faltar.`,
    '> Siga a skill `neuro-ads-manager` (carregue-a antes). O comando `neuro-ads-manager` está no PATH das sessões enquanto o plugin estiver ativo; se não estiver, use `node ' + path.join(ROOT, 'cli', 'cli.js') + '`.',
    '',
  ].join('\n');
  return intro + body.replace(/\$ARGUMENTS/g, 'os argumentos do usuário');
}

function skillCandidate() {
  const file = path.join(SKILL_DIR, 'SKILL.md');
  const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
  return {
    name: data.name || 'neuro-ads-manager',
    description: data.description || 'Gestor de tráfego pago (neuro-ads-manager).',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    rank: BUNDLED_RANK,
    locator: file,
    path: file,
    kind: 'skill',
  };
}

function commandCandidates() {
  let files = [];
  try { files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  return files.map((f) => {
    const file = path.join(COMMANDS_DIR, f);
    const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
    const name = COMMAND_PREFIX + f.replace(/\.md$/, '');
    return {
      name,
      description: data.description || `Comando ${name} do neuro-ads-manager.`,
      invocation: { modelInvocable: false, userInvocable: true },
      provider: PROVIDER_NAME,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: SKILL_DIR },
      rank: BUNDLED_RANK,
      locator: file,
      path: file,
      kind: 'command',
      argumentHint: data['argument-hint'] || '',
    };
  });
}

function publicCandidate(c) {
  const { kind, argumentHint, ...rest } = c;
  return rest;
}

export function createProvider() {
  const candidates = [skillCandidate(), ...commandCandidates()];
  const byName = new Map(candidates.map((c) => [c.name, c]));
  return {
    name: PROVIDER_NAME,
    list: () => Promise.resolve(candidates.map(publicCandidate)),
    async get(candidate) {
      const c = byName.get(candidate && candidate.name) || candidates[0];
      const raw = await readFile(c.locator, 'utf8');
      const { body } = parseFrontmatter(raw);
      const content = c.kind === 'command' ? adaptCommandBody(c.name, body, c.argumentHint) : body;
      return {
        path: c.path,
        name: c.name,
        description: c.description,
        invocation: c.invocation,
        provider: c.provider,
        source: c.source,
        resourceBase: c.resourceBase,
        content,
      };
    },
  };
}

/** Nome do plugin no Cordis (linha `name:` do cordis.patch.yml). */
export const name = 'neuro-ads-manager';
/** Serviço exigido: o registro de skills do Harness. */
export const inject = ['skills'];

/** Põe `dir` na frente do PATH do processo; o retorno tira de novo só essa entrada. */
export function prependToPath(dir) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'PATH');
  const parts = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (parts[0] === dir) return undefined;
  process.env.PATH = [dir, ...parts].join(path.delimiter);
  return () => {
    const now = (process.env.PATH || '').split(path.delimiter);
    const at = now.indexOf(dir);
    if (at >= 0) now.splice(at, 1);
    const restored = now.filter(Boolean).join(path.delimiter);
    if (!restored && !had) delete process.env.PATH;
    else process.env.PATH = restored;
  };
}

/**
 * Registra o provedor no `ctx.skills` e, enquanto o plugin estiver ativo, põe o `bin/` do pacote no PATH
 * do Harness: o comando `neuro-ads-manager` funciona nas sessões (bash e terminal herdam o PATH).
 */
export function apply(ctx) {
  const provider = createProvider();
  ctx.skills.registerProvider(() => provider);
  if (typeof ctx.effect === 'function' && existsSync(path.join(BIN_DIR, 'neuro-ads-manager'))) {
    ctx.effect(() => prependToPath(BIN_DIR), 'neuro-ads-manager PATH');
  }
}
