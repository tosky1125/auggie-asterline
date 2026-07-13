import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const componentScript = join(pluginRoot, 'scripts', 'bundle-component.mjs');
const releaseScript = join(pluginRoot, 'scripts', 'build-release.mjs');
const bun = spawnSync('sh', ['-c', 'command -v bun'], { encoding: 'utf8' }).stdout.trim();
const bunVersion = spawnSync(bun, ['--version'], { encoding: 'utf8' }).stdout.trim();

const fixture = (t, prefix = 'asterline-release-build-') => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

const put = (root, path, contents) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

const run = (script, source, output, config) => {
  const configPath = join(dirname(output), `${basename(output)}-config.json`);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return spawnSync(process.execPath, [script, '--source', source, '--output', output, '--config', configPath], {
    encoding: 'utf8',
  });
};

const toolchain = () => ({ command: bun, version: bunVersion });
const componentConfig = (entries, aliases = []) => ({ schemaVersion: 1, toolchain: toolchain(), entries, aliases });

const digestTree = (root) => {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else {
        hash.update(relative(root, path));
        hash.update('\0');
        hash.update(readFileSync(path));
      }
    }
  };
  visit(root);
  return hash.digest('hex');
};

test('Given explicit sources and aliases, when bundled twice, then isolated Node output is deterministic and self-contained', (t) => {
  // Given
  const root = fixture(t);
  const source = join(root, 'materialized');
  put(source, 'component/src/cli.ts', `#!/usr/bin/env node\nimport { word } from 'fixture-package';\nimport { suffix } from 'fixture-package/suffix';\nif (process.argv.includes('--help')) console.log('fixture ' + word + suffix);\n`);
  put(source, 'dependencies/fixture-package/index.ts', "export const word = 'ready';\n");
  put(source, 'dependencies/fixture-package/suffix.ts', "export const suffix = '!';\n");
  const config = componentConfig(
    [{ source: 'component/src/cli.ts', output: 'bin/cli.js', executable: true }],
    [{ specifier: 'fixture-package', source: 'dependencies/fixture-package' }],
  );
  const first = join(root, 'first');
  const second = join(root, 'second');

  // When
  const firstResult = run(componentScript, source, first, config);
  const secondResult = run(componentScript, source, second, config);

  // Then
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.equal(digestTree(first), digestTree(second));
  assert.doesNotMatch(readFileSync(join(first, 'bin/cli.js'), 'utf8'), new RegExp(root.replaceAll('\\', '\\\\')));
  const isolated = join(root, 'isolated', 'cli.js');
  put(root, 'isolated/cli.js', readFileSync(join(first, 'bin/cli.js')));
  chmodSync(isolated, 0o755);
  const help = spawnSync(process.execPath, [isolated, '--help'], { encoding: 'utf8', env: { PATH: dirname(process.execPath) } });
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout.trim(), 'fixture ready!');
  assert.equal(existsSync(join(root, 'isolated', 'node_modules')), false);
});

test('Given unsafe or incomplete declarations, when parsed, then the build fails before output mutation', (t) => {
  // Given
  const root = fixture(t);
  const source = join(root, 'materialized');
  put(source, 'src/ok.ts', "console.log('ok');\n");
  const cases = [
    ['missing source', componentConfig([{ source: 'src/missing.ts', output: 'cli.js' }]), /missing source/i],
    ['duplicate output', componentConfig([{ source: 'src/ok.ts', output: 'cli.js' }, { source: 'src/ok.ts', output: 'cli.js' }]), /duplicate output/i],
    ['escaping output', componentConfig([{ source: 'src/ok.ts', output: '../escape.js' }]), /normalized relative/i],
    ['toolchain mismatch', { ...componentConfig([{ source: 'src/ok.ts', output: 'cli.js' }]), toolchain: { command: bun, version: '0.0.0' } }, /version mismatch/i],
  ];

  for (const [name, config, reason] of cases) {
    // When
    const output = join(root, name.replace(' ', '-'));
    const result = run(componentScript, source, output, config);

    // Then
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, reason, name);
    assert.equal(existsSync(output), false, name);
  }
});

test('Given undeclared or unresolved dynamic imports, when bundled, then emitted runtime escapes are rejected', (t) => {
  // Given
  const root = fixture(t);
  const source = join(root, 'materialized');
  put(root, 'outside.ts', "console.log('outside');\n");
  const cases = [
    ['bare', "import 'undeclared-package';\n", /undeclared bare import|build failed/i],
    ['dynamic', "const target = process.argv[2];\nawait import(target);\n", /specifier must be a string literal|build failed/i],
    ['package-manager', "import { spawnSync } from 'node:child_process';\nspawnSync('npm', ['install']);\n", /package-manager command.*npm/i],
    ['source-escape', "import '../../outside.ts';\n", /source import escapes materialized root/i],
  ];

  for (const [name, body, reason] of cases) {
    put(source, `${name}.ts`, body);

    // When
    const result = run(componentScript, source, join(root, `${name}-output`), componentConfig([{ source: `${name}.ts`, output: 'entry.js' }]));

    // Then
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, reason, name);
  }
});

test('Given a previous release, when a later build fails, then the previous destination remains byte-identical', (t) => {
  // Given
  const root = fixture(t);
  const source = join(root, 'materialized');
  const output = join(root, 'release');
  put(output, 'marker.txt', 'stable\n');
  const before = digestTree(output);
  put(source, 'src/broken.ts', "import 'missing-package';\n");

  // When
  const result = run(componentScript, source, output, componentConfig([{ source: 'src/broken.ts', output: 'cli.js' }]));

  // Then
  assert.notEqual(result.status, 0);
  assert.equal(digestTree(output), before);
  assert.equal(readFileSync(join(output, 'marker.txt'), 'utf8'), 'stable\n');
});

test('Given a multi-component release declaration, when built, then outputs are assembled in one atomic release', (t) => {
  // Given
  const root = fixture(t);
  const source = join(root, 'materialized');
  const output = join(root, 'release');
  put(source, 'rules/cli.ts', "console.log('rules');\n");
  put(source, 'lsp/cli.ts', "console.log('lsp');\n");
  const config = {
    schemaVersion: 1,
    toolchain: toolchain(),
    components: [
      { name: 'rules', source: 'rules', output: 'components/rules', entries: [{ source: 'cli.ts', output: 'cli.js' }] },
      { name: 'lsp', source: 'lsp', output: 'mcp/lsp', entries: [{ source: 'cli.ts', output: 'cli.js' }] },
    ],
  };

  // When
  const result = run(releaseScript, source, output, config);

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(output, 'components/rules/cli.js')), true);
  assert.equal(existsSync(join(output, 'mcp/lsp/cli.js')), true);
  assert.equal(readdirSync(dirname(output)).some((name) => name.startsWith('.release.tmp-')), false);
});
