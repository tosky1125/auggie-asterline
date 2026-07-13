import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url);
const lockPath = new URL('release/upstream-lock.json', pluginRoot).pathname;
const materializerPath = new URL('scripts/materialize-upstream.mjs', pluginRoot).pathname;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.error, undefined, `${command}: ${result.error?.message}`);
  return result;
};

const git = (repository, args) => {
  const result = run('git', ['-C', repository, ...args]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

const createRepository = (root, { symlink = false } = {}) => {
  const repository = join(root, 'source');
  mkdirSync(join(repository, 'payload', 'nested'), { recursive: true });
  writeFileSync(join(repository, 'payload', 'alpha.txt'), 'alpha\n');
  writeFileSync(join(repository, 'payload', 'nested', 'beta.txt'), 'beta\n');
  if (symlink) symlinkSync('../alpha.txt', join(repository, 'payload', 'nested', 'link.txt'));
  git(repository, ['init', '--quiet']);
  git(repository, ['config', 'user.email', 'fixture@example.invalid']);
  git(repository, ['config', 'user.name', 'Fixture']);
  git(repository, ['add', '.']);
  git(repository, ['commit', '--quiet', '-m', 'fixture']);
  git(repository, ['tag', 'v1.0.0']);
  return repository;
};

const fixtureLock = (repository, overrides = {}) => ({
  schemaVersion: 1,
  release: '1.0.0',
  sources: [
    {
      id: 'fixture',
      tag: 'v1.0.0',
      commit: git(repository, ['rev-parse', 'HEAD']),
      paths: [
        {
          source: 'payload',
          destination: 'fixture/payload',
          type: 'tree',
          oid: git(repository, ['rev-parse', 'HEAD:payload']),
          ...overrides,
        },
      ],
    },
  ],
});

const invokeMaterializer = ({ destination, lock, repositories }) =>
  run('node', [
    materializerPath,
    '--lock',
    lock,
    '--destination',
    destination,
    ...Object.entries(repositories).flatMap(([id, repository]) => ['--repository', `${id}=${repository}`]),
  ]);

const digestTree = (root) => {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const entry = lstatSync(path);
      assert.equal(entry.isSymbolicLink(), false, path);
      if (entry.isDirectory()) visit(path);
      else {
        hash.update(relative(root, path));
        hash.update('\0');
        hash.update(readFileSync(path));
        hash.update('\0');
      }
    }
  };
  visit(root);
  return hash.digest('hex');
};

test('Given the release lock, when inspected, then every intended v4.17.1 source tree is pinned', () => {
  // Given
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

  // When
  const generated = lock.sources.find(({ id }) => id === 'lazycodex-generated');
  const canonical = lock.sources.find(({ id }) => id === 'oh-my-openagent');

  // Then
  assert.equal(lock.release, '4.17.1');
  assert.equal(generated.tag, 'v4.17.1');
  assert.equal(generated.commit, '3d7416bff3e6c80ebf5542b4dd12f5c76298d46d');
  assert.deepEqual(generated.gitlinks, {
    src: '65715d1c2c35e27ccf2195ef688b0909dddb403c',
  });
  assert.deepEqual(generated.paths, [
    {
      source: 'plugins/omo/skills',
      destination: 'generated/plugins/omo/skills',
      type: 'tree',
      oid: '7da0054dfc49e2be00060086d4cabee06253a85f',
    },
  ]);
  assert.equal(canonical.tag, 'v4.17.1');
  assert.equal(canonical.commit, 'ed0241d1af225d38de55fdbcf0baa0abc9a1465a');
  assert.deepEqual(
    canonical.paths.map(({ source }) => source),
    [
      'packages/omo-codex/plugin',
      'packages/shared-skills/skills',
      'packages/utils',
      'packages/comment-checker-core',
      'packages/rules-engine',
      'packages/lsp-core',
      'packages/lsp-daemon',
      'packages/lsp-tools-mcp',
      'packages/mcp-stdio-core',
    ],
  );
  for (const source of lock.sources) {
    for (const entry of source.paths) assert.match(entry.oid, /^[0-9a-f]{40}$/);
  }
});

test('Given a locked source, when materialized, then Git blobs land through an explicit destination', (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-upstream-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = createRepository(root);
  const fixtureLockPath = join(root, 'lock.json');
  const destination = join(root, 'output');
  writeFileSync(fixtureLockPath, `${JSON.stringify(fixtureLock(repository), null, 2)}\n`);

  // When
  const result = invokeMaterializer({
    destination,
    lock: fixtureLockPath,
    repositories: { fixture: repository },
  });

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(destination, 'fixture', 'payload', 'alpha.txt'), 'utf8'), 'alpha\n');
  assert.equal(readFileSync(join(destination, 'fixture', 'payload', 'nested', 'beta.txt'), 'utf8'), 'beta\n');
});

test('Given a tampered tree OID, when materialization is attempted, then it rejects before destination mutation', (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-upstream-tamper-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = createRepository(root);
  const fixtureLockPath = join(root, 'lock.json');
  const destination = join(root, 'must-not-exist');
  writeFileSync(
    fixtureLockPath,
    `${JSON.stringify(fixtureLock(repository, { oid: '0000000000000000000000000000000000000000' }), null, 2)}\n`,
  );

  // When
  const result = invokeMaterializer({
    destination,
    lock: fixtureLockPath,
    repositories: { fixture: repository },
  });

  // Then
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locked object mismatch/i);
  assert.equal(existsSync(destination), false);
  assert.deepEqual(readdirSync(root).filter((name) => name.startsWith('must-not-exist')), []);
});

test('Given a symlink inside a locked tree, when materialization is attempted, then it fails closed', (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-upstream-symlink-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = createRepository(root, { symlink: true });
  const fixtureLockPath = join(root, 'lock.json');
  const destination = join(root, 'must-not-exist');
  writeFileSync(fixtureLockPath, `${JSON.stringify(fixtureLock(repository), null, 2)}\n`);

  // When
  const result = invokeMaterializer({
    destination,
    lock: fixtureLockPath,
    repositories: { fixture: repository },
  });

  // Then
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/i);
  assert.equal(existsSync(destination), false);
});

test('Given a destination path escape, when the lock is parsed, then it fails before writing', (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-upstream-escape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = createRepository(root);
  const fixtureLockPath = join(root, 'lock.json');
  const destination = join(root, 'must-not-exist');
  writeFileSync(
    fixtureLockPath,
    `${JSON.stringify(fixtureLock(repository, { destination: '../escaped' }), null, 2)}\n`,
  );

  // When
  const result = invokeMaterializer({
    destination,
    lock: fixtureLockPath,
    repositories: { fixture: repository },
  });

  // Then
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /normalized relative POSIX path|unsafe path segment/i);
  assert.equal(existsSync(destination), false);
  assert.equal(existsSync(join(root, 'escaped')), false);
});

test('Given both exact v4.17.1 repositories, when materialized twice, then staging trees are deterministic', (t) => {
  // Given
  const lazycodex = '/tmp/lazycodex-v4.17.1-plan';
  const canonical = '/tmp/omo-v417';
  if (!existsSync(join(lazycodex, '.git')) || !existsSync(join(canonical, '.git'))) {
    t.skip('exact local upstream repositories are unavailable');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'asterline-upstream-real-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const repositories = {
    'lazycodex-generated': lazycodex,
    'oh-my-openagent': canonical,
  };

  // When
  const firstResult = invokeMaterializer({ destination: first, lock: lockPath, repositories });
  const secondResult = invokeMaterializer({ destination: second, lock: lockPath, repositories });

  // Then
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.equal(digestTree(first), digestTree(second));
  assert.equal(existsSync(join(first, 'generated', 'plugins', 'omo', 'skills', 'frontend', 'SKILL.md')), true);
  assert.equal(existsSync(join(first, 'canonical', 'packages', 'omo-codex', 'plugin', 'package.json')), true);
  assert.equal(existsSync(join(first, 'canonical', 'packages', 'rules-engine', 'src', 'index.ts')), true);
});
