#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleComponent, replaceDirectory } from '../../../scripts/bundle-component.mjs';

const runtimeRoot = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(runtimeRoot, '../../..');
const defaultRecipe = join(runtimeRoot, 'lsp-mcp.build.json');
const defaultOutput = join(pluginRoot, 'mcp', 'lsp');

class LspBuildError extends Error {}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const parseArgs = (args) => {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--source', '--output', '--recipe'].includes(option) || value === undefined || values.has(option)) {
      throw new LspBuildError(`unknown, duplicate, or incomplete option ${JSON.stringify(option)}`);
    }
    values.set(option, value);
  }
  const source = values.get('--source');
  if (source === undefined) throw new LspBuildError('--source is required');
  return { help: false, source: resolve(source), output: resolve(values.get('--output') ?? defaultOutput), recipe: resolve(values.get('--recipe') ?? defaultRecipe) };
};

const findExecutable = (name) => {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return resolve(candidate);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
  }
  throw new LspBuildError(`${name} is not available on PATH`);
};

const gitValue = (root, args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new LspBuildError(result.error?.message ?? result.stderr.trim());
  return result.stdout.trim();
};

const verifySource = (root, recipe) => {
  const commit = gitValue(root, ['rev-parse', 'HEAD']);
  if (commit !== recipe.upstream.commit) throw new LspBuildError(`upstream commit mismatch: ${commit}`);
  for (const source of recipe.sources) {
    const oid = gitValue(root, ['rev-parse', `HEAD:${source.path}`]);
    if (oid !== source.treeOid) throw new LspBuildError(`upstream tree mismatch for ${source.package}: ${oid}`);
  }
};

const copySources = (root, staging, recipe) => {
  for (const source of recipe.sources) {
    cpSync(join(root, source.path, 'src'), join(staging, source.path, 'src'), { recursive: true });
  }
};

const applyTransforms = (root, recipe) => {
  const digests = new Map();
  for (const transform of recipe.transforms) {
    const path = join(root, transform.file);
    const before = readFileSync(path, 'utf8');
    const count = before.split(transform.from).length - 1;
    if (count !== transform.expectedCount) {
      throw new LspBuildError(`transform count mismatch for ${transform.file}: expected ${transform.expectedCount}, received ${count}`);
    }
    if (!digests.has(transform.file)) digests.set(transform.file, { canonicalSha256: sha256(before) });
    const transformed = transform.removeThroughEof === true
      ? `${before.slice(0, before.indexOf(transform.from))}${transform.to}`
      : before.replaceAll(transform.from, transform.to);
    writeFileSync(path, transformed);
  }
  return [...digests.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, digest]) => ({
    file,
    canonicalSha256: digest.canonicalSha256,
    transformedSha256: sha256(readFileSync(join(root, file))),
  }));
};

const build = async ({ source, output, recipePath }) => {
  const recipeBytes = readFileSync(recipePath);
  const recipe = JSON.parse(recipeBytes);
  verifySource(source, recipe);
  const bun = findExecutable(recipe.toolchain.command);
  const version = spawnSync(bun, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || version.stdout.trim() !== recipe.toolchain.version) {
    throw new LspBuildError(`Bun version mismatch: expected ${recipe.toolchain.version}, received ${version.stdout.trim()}`);
  }
  const staging = mkdtempSync(join(dirname(output), '.lsp-build-'));
  const release = join(staging, 'release');
  try {
    copySources(source, staging, recipe);
    const transformedFiles = applyTransforms(staging, recipe);
    await bundleComponent({
      source: staging,
      output: join(release, 'dist'),
      config: { schemaVersion: 1, toolchain: { command: bun, version: recipe.toolchain.version }, entries: recipe.entries, aliases: recipe.aliases },
    });
    writeFileSync(join(release, 'dist', 'package.json'), `${JSON.stringify({ name: '@asterline/lsp-mcp', version: '4.17.1', type: 'module', private: true }, null, 2)}\n`);
    const outputFiles = ['cli.js', 'index.js', 'package.json', 'standalone.js'].map((file) => ({ file: `dist/${file}`, sha256: sha256(readFileSync(join(release, 'dist', file))) }));
    writeFileSync(join(release, 'transform-provenance.json'), `${JSON.stringify({ schemaVersion: 1, upstream: recipe.upstream, recipeSha256: sha256(recipeBytes), transformedFiles, outputFiles }, null, 2)}\n`);
    await replaceDirectory(release, output);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node build-lsp-mcp.mjs --source <oh-my-openagent-v4.17.1> [--output <mcp/lsp>] [--recipe <json>]\n');
    return;
  }
  await build({ source: args.source, output: args.output, recipePath: args.recipe });
  process.stdout.write(`Built Asterline LSP MCP: ${args.output}\n`);
};

main().catch((error) => {
  process.stderr.write(`LSP MCP build error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
