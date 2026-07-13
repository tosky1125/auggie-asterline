import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(pluginRoot));
const closureRoot = join(pluginRoot, 'release', 'build-sources', 'picomatch');
const sourceLockPath = join(pluginRoot, 'release', 'build-sources.lock.json');

const walk = (root, path = root) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
  const target = join(path, entry.name);
  return entry.isDirectory() ? walk(root, target) : [relative(root, target).replaceAll('\\', '/')];
});

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: repositoryRoot,
  encoding: 'utf8',
  timeout: 30_000,
  ...options,
});

test('Given the shipped plugin, when its dependency layout is inspected, then no runtime vendor tree exists', () => {
  // Given
  const vendor = join(pluginRoot, 'vendor');

  // When
  const present = existsSync(vendor);

  // Then
  assert.equal(present, false);
});

test('Given the plugin package and validators, when dependency requirements are inspected, then vendor is not required', () => {
  // Given
  const packageManifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
  const contracts = [
    join(pluginRoot, 'scripts', 'validate-runtime.mjs'),
    join(pluginRoot, 'test', 'asterline-contract.test.mjs'),
    join(repositoryRoot, 'scripts', 'validate-marketplace.mjs'),
  ];

  // When
  const staleReferences = contracts.filter((path) => /(?:^|[/'"`])vendor\//m.test(readFileSync(path, 'utf8')));

  // Then
  assert.deepEqual(packageManifest.dependencies ?? {}, {});
  assert.deepEqual(staleReferences, []);
});

test('Given the locked picomatch build closure, when every file is hashed, then provenance and content are exact', () => {
  // Given
  const lock = JSON.parse(readFileSync(sourceLockPath, 'utf8'));
  const source = lock.sources.find((candidate) => candidate.id === 'picomatch');

  // When
  const files = walk(closureRoot).sort();
  const hashes = Object.fromEntries(files.map((path) => [path, sha256(join(closureRoot, path))]));

  // Then
  assert.equal(lock.schemaVersion, 1);
  assert.equal(source.version, '4.0.4');
  assert.equal(source.commit, 'e5474fc1a4d7991870058170407dda8a42be5334');
  assert.equal(source.tree, '28cb0172f351fab0f426075ac7136e23982f3d87');
  assert.equal(source.npmIntegrity, 'sha512-QP88BAKvMam/3NxH6vj2o21R6MjxZUAd6nlwAS/pnGvN9IVLocLHxGYIzFhg6fUQ+5th6P4dv4eW9jX3DSIj7A==');
  assert.deepEqual(hashes, source.files);
  assert.match(readFileSync(join(closureRoot, 'LICENSE'), 'utf8'), /MIT License/);
});

test('Given the rules build recipe, when it is rebuilt twice, then output is deterministic and matches the shipped bundle', async (context) => {
  // Given
  const sandbox = mkdtempSync(join(tmpdir(), 'asterline-vendor-removal-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const sandboxPlugin = join(sandbox, 'plugins', 'asterline');
  await Promise.all([
    cp(join(pluginRoot, 'components', 'rules'), join(sandboxPlugin, 'components', 'rules'), { recursive: true }),
    cp(join(pluginRoot, 'components', 'hook-bridge'), join(sandboxPlugin, 'components', 'hook-bridge'), { recursive: true }),
    cp(join(pluginRoot, 'scripts'), join(sandboxPlugin, 'scripts'), { recursive: true }),
    cp(join(pluginRoot, 'release', 'build-sources'), join(sandboxPlugin, 'release', 'build-sources'), { recursive: true }),
  ]);
  await rm(join(sandboxPlugin, 'components', 'rules', 'dist'), { recursive: true, force: true });
  const build = join(sandboxPlugin, 'components', 'rules', 'scripts', 'build.mjs');

  // When
  const first = run('node', [build]);
  assert.equal(first.status, 0, first.stderr);
  const firstHash = sha256(join(sandboxPlugin, 'components', 'rules', 'dist', 'cli.js'));
  const second = run('node', [build]);
  assert.equal(second.status, 0, second.stderr);
  const secondHash = sha256(join(sandboxPlugin, 'components', 'rules', 'dist', 'cli.js'));

  // Then
  assert.equal(firstHash, secondHash);
  assert.equal(secondHash, sha256(join(pluginRoot, 'components', 'rules', 'dist', 'cli.js')));
  assert.doesNotMatch(readFileSync(join(pluginRoot, 'components', 'rules', 'dist', 'cli.js'), 'utf8'), /release\/build-sources|vendor\/picomatch/);
});

test('Given shipped runtime entries, when audited and imported without dependencies, then they remain self-contained', async (context) => {
  // Given
  const auditConfig = join(pluginRoot, 'release', 'runtime-audit.json');
  const sandbox = mkdtempSync(join(tmpdir(), 'asterline-runtime-import-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  await mkdir(join(sandbox, 'dist'), { recursive: true });
  await Promise.all([
    cp(join(pluginRoot, 'mcp', 'lsp', 'dist', 'index.js'), join(sandbox, 'dist', 'index.js')),
    cp(join(pluginRoot, 'mcp', 'lsp', 'dist', 'package.json'), join(sandbox, 'dist', 'package.json')),
  ]);

  // When
  const imports = run('node', [join(pluginRoot, 'scripts', 'audit-runtime-imports.mjs'), '--root', pluginRoot, '--config', auditConfig]);
  const packageManagers = run('node', [join(pluginRoot, 'scripts', 'audit-package-manager-runtime.mjs'), '--root', pluginRoot, '--config', auditConfig]);
  const isolated = run('node', ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(join(sandbox, 'dist', 'index.js')).href)})`], { cwd: sandbox });

  // Then
  assert.equal(imports.status, 0, imports.stderr);
  assert.equal(packageManagers.status, 0, packageManagers.stderr);
  assert.equal(isolated.status, 0, isolated.stderr);
  assert.equal(existsSync(join(sandbox, 'node_modules')), false);
  assert.equal(existsSync(join(sandbox, 'vendor')), false);
});
