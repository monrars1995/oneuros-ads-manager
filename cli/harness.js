/**
 * Instala o neuro-ads-manager no Neuro Harness (DeepSeek Harness com o perfil "neuro"), do mesmo jeito que o
 * neuro-mv-edit: `dsh plugin --profile <perfil> add link:<pasta do pacote>`. O gerenciador de plugins do
 * Harness instala o pacote e, por ele ter `dsh.bundle` no package.json, acrescenta o bundle em
 * `dsh.profile.bundles` e valida o cordis.patch.yml. Com o plugin ativo, a skill, os comandos
 * `neuro-ads-*` e o comando `neuro-ads-manager` (bin/ no PATH) ficam disponíveis nas sessões.
 *
 * Padrão: liga o próprio clone (atualizar o clone atualiza o Harness). Com --copiar, copia o pacote para
 * <base>/plugins/neuro-ads-manager e liga a cópia (fica fixo até a próxima instalação).
 *
 * Base: NEURO_HARNESS_HOME, ou ~/.neuro-harness (ou ~/.neuro-mv-superagent, das instalações antigas).
 * Depois de instalar: reinicie o Harness (`neuro-harness restart`).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PKG_ROOT, CliError } = require('./util');

const NAME = 'neuro-ads-manager';

function defaultBase() {
  if (process.env.NEURO_HARNESS_HOME) return process.env.NEURO_HARNESS_HOME;
  const home = os.homedir();
  const current = path.join(home, '.neuro-harness');
  const legacy = path.join(home, '.neuro-mv-superagent');
  if (!fs.existsSync(current) && fs.existsSync(legacy)) return legacy;
  return current;
}

function paths(opts = {}) {
  const base = opts.base || defaultBase();
  const dshHome = !opts.base && process.env.DSH_HOME ? process.env.DSH_HOME : path.join(base, 'dsh');
  const profile = opts.perfil || process.env.NEURO_HARNESS_PROFILE || 'neuro';
  return {
    base,
    dshHome,
    profile,
    profileDir: path.join(dshHome, 'profiles', profile),
    copyDir: path.join(base, 'plugins', NAME),
    legacyWrapper: path.join(base, 'bin', NAME),
    dsh: opts.dsh || path.join(base, 'runtime', 'node_modules', '.bin', 'dsh'),
  };
}

const PACKAGE_FILES = ['package.json', 'LICENSE', 'README.md', 'CHANGELOG.md', 'harness', 'skills', 'commands', 'agents', 'cli', 'bin', 'docs'];

function copyPackage(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const f of PACKAGE_FILES) {
    const src = path.join(PKG_ROOT, f);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, f), { recursive: true, filter: (s) => !/\/(node_modules|\.git)(\/|$)/.test(s) && !/\.DS_Store$/.test(s) });
  }
}

function readProfileManifest(p) {
  try { return JSON.parse(fs.readFileSync(path.join(p.profileDir, 'package.json'), 'utf8')); } catch { return null; }
}

function status(opts = {}) {
  const p = paths(opts);
  const manifest = readProfileManifest(p);
  const deps = (manifest && manifest.dependencies) || {};
  const bundles = (manifest && manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];
  const spec = deps[NAME] || null;
  let source = null;
  let version = null;
  if (spec && spec.startsWith('link:')) {
    source = spec.slice(5);
    try { version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version; } catch { /* pasta sumiu */ }
  }
  return {
    ...p,
    harness: fs.existsSync(p.dsh),
    perfilExiste: !!manifest,
    dependencia: spec,
    origem: source,
    versao: version,
    bundle: bundles.includes(NAME),
  };
}

function runDsh(p, args, dryRun) {
  const cmd = [p.dsh, 'plugin', '--profile', p.profile, ...args];
  if (dryRun) return { dry: true, cmd: cmd.join(' ') };
  const r = spawnSync(p.dsh, cmd.slice(1), { stdio: 'inherit', env: { ...process.env, DSH_HOME: p.dshHome } });
  if (r.status !== 0) throw new CliError(`dsh plugin falhou (código ${r.status}). Comando: ${cmd.join(' ')}`);
  return { cmd: cmd.join(' ') };
}

function install(opts = {}) {
  const p = paths(opts);
  const steps = [];
  if (!fs.existsSync(p.dsh)) throw new CliError(`Harness não encontrado em ${p.dsh}. Suba o Neuro Harness uma vez (neuro-harness start), que instala o runtime, ou indique a base com NEURO_HARNESS_HOME.`, 2);
  if (!readProfileManifest(p)) throw new CliError(`Perfil "${p.profile}" não existe em ${p.profileDir}. Suba o Neuro Harness uma vez ou escolha o perfil com --perfil-harness.`, 2);
  let source = PKG_ROOT;
  if (opts.copiar) {
    steps.push(`copia o pacote para ${p.copyDir}`);
    if (!opts.dryRun) copyPackage(p.copyDir);
    source = p.copyDir;
  }
  steps.push(runDsh(p, ['add', `link:${source}`], opts.dryRun).cmd);
  return { steps, paths: p, source, dryRun: !!opts.dryRun };
}

function uninstall(opts = {}) {
  const p = paths(opts);
  const steps = [];
  const st = status(opts);
  if (st.dependencia && fs.existsSync(p.dsh)) steps.push(runDsh(p, ['remove', NAME], opts.dryRun).cmd);
  for (const f of [p.copyDir, p.legacyWrapper]) {
    if (fs.existsSync(f)) { steps.push(`remove ${f}`); if (!opts.dryRun) fs.rmSync(f, { recursive: true, force: true }); }
  }
  return { steps, paths: p, dryRun: !!opts.dryRun };
}

module.exports = { paths, status, install, uninstall, copyPackage, NAME };
