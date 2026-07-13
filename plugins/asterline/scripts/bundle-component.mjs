#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage:
  node bundle-component.mjs --source <materialized-root> --output <directory> --config <file>

Bundles explicitly declared TypeScript/JavaScript entrypoints with an exact Bun toolchain.
Bare imports must be mapped by config aliases. The staged Node.js output is audited before
the destination is replaced; this command never installs, fetches, or executes source code.
`;

class BundleError extends Error {}
class InputError extends BundleError {}
class BuildError extends BundleError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InputError(`${label} contains unsupported key ${JSON.stringify(key)}`);
  }
};
const stringValue = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new InputError(`${label} must be a non-empty string`);
  return value;
};
const relativePath = (value, label) => {
  const path = stringValue(value, label);
  const unsafe = path.split('/').some((part) => part === '' || part === '.' || part === '..');
  if (path.includes('\0') || path.includes('\\') || posix.isAbsolute(path) || posix.normalize(path) !== path || unsafe) {
    throw new InputError(`${label} must be a normalized relative POSIX path`);
  }
  return path;
};
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const exists = (path) => lstat(path).then(() => true, (error) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

const parseConfig = (value) => {
  if (!isRecord(value)) throw new InputError('config must be a JSON object');
  assertKeys(value, new Set(['schemaVersion', 'toolchain', 'entries', 'aliases']), 'config');
  if (value.schemaVersion !== 1) throw new InputError('config.schemaVersion must equal 1');
  if (!isRecord(value.toolchain)) throw new InputError('config.toolchain must be an object');
  assertKeys(value.toolchain, new Set(['command', 'version']), 'config.toolchain');
  const command = stringValue(value.toolchain.command, 'config.toolchain.command');
  if (!isAbsolute(command) || basename(command) !== 'bun') throw new InputError('config.toolchain.command must be an absolute Bun executable path');
  const toolchain = { command, version: stringValue(value.toolchain.version, 'config.toolchain.version') };
  if (!Array.isArray(value.entries) || value.entries.length === 0) throw new InputError('config.entries must be non-empty');
  const outputs = new Set();
  const entries = value.entries.map((entry, index) => {
    const label = `config.entries[${index}]`;
    if (!isRecord(entry)) throw new InputError(`${label} must be an object`);
    assertKeys(entry, new Set(['source', 'output', 'executable']), label);
    const source = relativePath(entry.source, `${label}.source`);
    const output = relativePath(entry.output, `${label}.output`);
    if (!/\.(?:cjs|mjs|js)$/.test(output)) throw new InputError(`${label}.output must end in .js, .mjs, or .cjs`);
    if (outputs.has(output)) throw new InputError(`duplicate output path: ${output}`);
    outputs.add(output);
    if (entry.executable !== undefined && typeof entry.executable !== 'boolean') throw new InputError(`${label}.executable must be boolean`);
    return { source, output, executable: entry.executable === true };
  });
  const aliasesValue = value.aliases ?? [];
  if (!Array.isArray(aliasesValue)) throw new InputError('config.aliases must be an array');
  const specifiers = new Set();
  const aliases = aliasesValue.map((alias, index) => {
    const label = `config.aliases[${index}]`;
    if (!isRecord(alias)) throw new InputError(`${label} must be an object`);
    assertKeys(alias, new Set(['specifier', 'source']), label);
    const specifier = stringValue(alias.specifier, `${label}.specifier`);
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:') || specifiers.has(specifier)) {
      throw new InputError(`${label}.specifier must be a unique bare import`);
    }
    specifiers.add(specifier);
    return { specifier, source: relativePath(alias.source, `${label}.source`) };
  });
  return { schemaVersion: 1, toolchain, entries, aliases };
};

const parseArgs = (args) => {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--source', '--output', '--config'].includes(option) || value === undefined || values.has(option)) {
      throw new InputError(`unknown, duplicate, or incomplete option ${JSON.stringify(option)}`);
    }
    values.set(option, value);
  }
  return {
    help: false,
    source: stringValue(values.get('--source'), '--source'),
    output: stringValue(values.get('--output'), '--output'),
    config: stringValue(values.get('--config'), '--config'),
  };
};

const readConfig = async (path) => {
  let value;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError(`config is invalid JSON: ${error.message}`);
    throw error;
  }
  return parseConfig(value);
};

const resolveInputs = async (sourceRoot, config) => {
  const root = await realpath(sourceRoot).catch(() => { throw new InputError(`source root is missing: ${sourceRoot}`); });
  if (!(await stat(root)).isDirectory()) throw new InputError(`source root is not a directory: ${sourceRoot}`);
  const resolveSource = async (path, label, directoryAllowed = false) => {
    const candidate = resolve(root, ...path.split('/'));
    const resolved = await realpath(candidate).catch(() => { throw new InputError(`missing source for ${label}: ${path}`); });
    const info = await stat(resolved);
    if (!inside(root, resolved) || (!info.isFile() && !(directoryAllowed && info.isDirectory()))) {
      throw new InputError(`${label} must resolve inside source root: ${path}`);
    }
    return { sourcePath: resolved, directory: info.isDirectory() };
  };
  const entries = await Promise.all(config.entries.map(async (entry) => ({ ...entry, ...await resolveSource(entry.source, 'entry') })));
  const aliases = await Promise.all(config.aliases.map(async (alias) => ({ ...alias, ...await resolveSource(alias.source, 'alias', true) })));
  return { root, entries, aliases };
};

const safeEnvironment = (home) => ({ HOME: home, LANG: 'C', LC_ALL: 'C', PATH: dirname(process.execPath), TZ: 'UTC' });

export const replaceDirectory = async (staging, destination) => {
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  if (!(await exists(target))) return rename(staging, target);
  const backup = join(dirname(target), `.${basename(target)}.old-${process.pid}-${randomUUID()}`);
  await rename(target, backup);
  try {
    await rename(staging, target);
  } catch (error) {
    await rename(backup, target);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
};

export const bundleComponent = async ({ source, output, config }) => {
  const parsed = parseConfig(config);
  const inputs = await resolveInputs(source, parsed);
  const version = spawnSync(parsed.toolchain.command, ['--version'], { encoding: 'utf8', env: safeEnvironment(inputs.root) });
  if (version.error || version.status !== 0) throw new BuildError(`Bun version probe failed: ${version.error?.message ?? version.stderr.trim()}`);
  if (version.stdout.trim() !== parsed.toolchain.version) {
    throw new BuildError(`Bun version mismatch: expected ${parsed.toolchain.version}, received ${version.stdout.trim()}`);
  }
  const target = resolve(output);
  const staging = join(dirname(target), `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`);
  const jobPath = `${staging}.job.json`;
  const auditPath = `${staging}.audit.json`;
  try {
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await writeFile(jobPath, JSON.stringify({ root: inputs.root, staging, entries: inputs.entries, aliases: inputs.aliases }));
    const worker = spawnSync(parsed.toolchain.command, [fileURLToPath(import.meta.url), '--bundle-worker', jobPath], {
      encoding: 'utf8',
      env: safeEnvironment(staging),
      maxBuffer: 32 * 1024 * 1024,
    });
    if (worker.error || worker.status !== 0) throw new BuildError(`Bun build failed: ${worker.error?.message ?? worker.stderr.trim()}`);
    for (const entry of inputs.entries) if (entry.executable) await chmod(join(staging, ...entry.output.split('/')), 0o755);
    const surfaces = inputs.entries.map(({ output: entryOutput }) => entryOutput);
    await writeFile(auditPath, JSON.stringify({ entries: surfaces, files: surfaces }));
    for (const script of ['audit-runtime-imports.mjs', 'audit-package-manager-runtime.mjs']) {
      const auditor = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), script), '--root', staging, '--config', auditPath], {
        encoding: 'utf8', env: safeEnvironment(staging),
      });
      if (auditor.error || auditor.status !== 0) throw new BuildError(`emitted runtime audit failed (${script}): ${auditor.error?.message ?? auditor.stderr.trim()}`);
    }
    await replaceDirectory(staging, target);
    return { entries: inputs.entries.length, output: target };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(jobPath, { force: true });
    await rm(auditPath, { force: true });
  }
};

const runWorker = async (jobPath) => {
  const bun = globalThis.Bun;
  if (!bun || typeof bun.build !== 'function') throw new BuildError('bundle worker requires Bun');
  const job = JSON.parse(await readFile(jobPath, 'utf8'));
  const aliases = [...job.aliases].sort((left, right) => right.specifier.length - left.specifier.length);
  const plugin = {
    name: 'asterline-declared-imports',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
        if (path.startsWith('.') || path.startsWith('/')) {
          const candidate = path.startsWith('/') ? path : resolve(dirname(importer), path);
          if (!inside(job.root, candidate)) throw new BuildError(`source import escapes materialized root: ${path}`);
          return undefined;
        }
        if (path.startsWith('node:')) return undefined;
        const alias = aliases.find((candidate) => path === candidate.specifier || (candidate.directory && path.startsWith(`${candidate.specifier}/`)));
        if (alias === undefined) throw new BuildError(`undeclared bare import: ${path}`);
        const base = path === alias.specifier ? alias.sourcePath : join(alias.sourcePath, path.slice(alias.specifier.length + 1));
        const replacement = [`${base}.ts`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.js'), base].find(existsSync);
        if (replacement === undefined || (!alias.directory && path !== alias.specifier)) throw new BuildError(`missing declared alias source: ${path}`);
        return { path: replacement };
      });
    },
  };
  for (const entry of job.entries) {
    const destination = join(job.staging, ...entry.output.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    const result = await bun.build({
      entrypoints: [entry.sourcePath],
      outdir: dirname(destination),
      naming: basename(destination),
      target: 'node',
      format: entry.output.endsWith('.cjs') ? 'cjs' : 'esm',
      packages: 'bundle',
      splitting: false,
      sourcemap: 'none',
      minify: { whitespace: true, identifiers: false, syntax: false },
      plugins: [plugin],
    });
    if (!result.success) throw new BuildError(result.logs.map((log) => log.message).join('\n'));
  }
};

const main = async () => {
  if (process.argv[2] === '--bundle-worker') return runWorker(stringValue(process.argv[3], '--bundle-worker job'));
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  const result = await bundleComponent({ source: args.source, output: args.output, config: await readConfig(args.config) });
  process.stdout.write(`Bundled component: entries=${result.entries} output=${result.output}\n`);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (!(error instanceof BundleError)) throw error;
    process.stderr.write(`Bundle error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
