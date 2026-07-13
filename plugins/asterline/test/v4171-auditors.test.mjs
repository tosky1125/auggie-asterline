import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;

const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'asterline-auditor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

const put = (root, path, contents) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

const run = (script, root, config) => {
  const args = [join(pluginRoot, 'scripts', script), '--root', root];
  if (config !== undefined) {
    const configPath = join(root, 'audit-config.json');
    writeFileSync(configPath, JSON.stringify(config));
    args.push('--config', configPath);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
};

const assertFailedAt = (result, file, reason) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stderr, reason);
};

test('Given reachable modules, when dependencies are audited, then imports and requires fail closed while clean dependencies pass', (t) => {
  const clean = fixture(t);
  put(clean, 'entry.mjs', "import './local.mjs';\nimport { join } from 'node:path';\n");
  put(clean, 'local.mjs', 'export const value = 1;\n');
  put(clean, 'entry.cjs', "require('node:path');\nrequire('./local.cjs');\n");
  put(clean, 'local.cjs', "require('node:fs');\nmodule.exports = 1;\n");
  const cleanResult = run('audit-runtime-imports.mjs', clean, { entries: ['entry.mjs', 'entry.cjs'] });
  assert.equal(cleanResult.status, 0, cleanResult.stderr);

  for (const [name, source] of [
    ['static.mjs', 'import "picomatch";\n'],
    ['dynamic.mjs', "await import('picomatch');\n"],
    ['bare.cjs', "require('picomatch');\n"],
  ]) {
    const root = fixture(t);
    put(root, name, source);
    assertFailedAt(run('audit-runtime-imports.mjs', root, { entries: [name] }), name, /bare (?:import|require).*picomatch/i);
  }

  const variable = fixture(t);
  put(variable, 'variable.cjs', "const moduleName = './local.cjs';\nrequire(moduleName);\n");
  assertFailedAt(run('audit-runtime-imports.mjs', variable, { entries: ['variable.cjs'] }), 'variable.cjs', /require specifier must be a string literal/i);

  const nested = fixture(t);
  put(nested, 'entry.cjs', "require('./local.cjs');\n");
  put(nested, 'local.cjs', "require('picomatch');\n");
  assertFailedAt(run('audit-runtime-imports.mjs', nested, { entries: ['entry.cjs'] }), 'local.cjs', /bare require.*picomatch/i);

  const missing = fixture(t);
  put(missing, 'entry.cjs', "require('./missing.cjs');\n");
  assertFailedAt(run('audit-runtime-imports.mjs', missing, { entries: ['entry.cjs'] }), 'entry.cjs', /relative require is missing/i);

  const escaped = fixture(t);
  put(escaped, 'entry.cjs', "require('./escape.cjs');\n");
  symlinkSync(join(pluginRoot, 'package.json'), join(escaped, 'escape.cjs'));
  assertFailedAt(run('audit-runtime-imports.mjs', escaped, { entries: ['entry.cjs'] }), 'entry.cjs', /relative require escapes audit root/i);
});

test('Given shipped payload files, when telemetry is audited, then telemetry paths and PostHog artifacts fail while clean payload passes', (t) => {
  const clean = fixture(t);
  put(clean, 'components/rules/dist/cli.js', 'console.log("ready");\n');
  assert.equal(run('audit-telemetry-tombstones.mjs', clean, { paths: ['components'] }).status, 0);

  const cases = [
    ['components/telemetry/dist/cli.js', 'export {};\n', /telemetry path/i],
    ['components/x/dist/client.js', "import { PostHog } from 'posthog-node';\n", /posthog import/i],
    ['components/x/dist/host.js', "const host = 'https:\/\/us.i.posthog.com';\n", /posthog host/i],
    ['components/x/dist/key.js', "const key = 'phc_fixture_secret';\n", /posthog key/i],
  ];
  for (const [name, source, reason] of cases) {
    const root = fixture(t);
    put(root, name, source);
    assertFailedAt(run('audit-telemetry-tombstones.mjs', root, { paths: ['components'] }), name, reason);
  }
});

test('Given executable runtime surfaces, when package-manager use is audited, then spawn npm and npx fail while node execution passes', (t) => {
  const clean = fixture(t);
  put(clean, 'hooks/bin/run.mjs', "import { spawn } from 'node:child_process';\nspawn('node', ['cli.js']);\n");
  assert.equal(run('audit-package-manager-runtime.mjs', clean, { files: ['hooks/bin/run.mjs'] }).status, 0);

  for (const [name, source, reason] of [
    ['spawn.mjs', "spawn('/usr/bin/npm', ['run', 'build']);\n", /package-manager command.*npm/i],
    ['shell.sh', '#!/bin/sh\nnpx tool\n', /package-manager command.*npx/i],
  ]) {
    const root = fixture(t);
    put(root, name, source);
    assertFailedAt(run('audit-package-manager-runtime.mjs', root, { files: [name] }), name, reason);
  }
});

test('Given skill directories, when assets are audited, then names, links, symlinks, inventory, and counts fail closed', (t) => {
  const clean = fixture(t);
  put(clean, 'skills/alpha/SKILL.md', '---\nname: alpha\n---\nUse [the helper](scripts/run.sh).\n');
  put(clean, 'skills/alpha/scripts/run.sh', '#!/bin/sh\nexit 0\n');
  const config = {
    skillsDir: 'skills',
    inventory: ['alpha'],
    counts: { skills: 1, files: 2, markdown: 1 },
  };
  assert.equal(run('audit-skill-assets.mjs', clean, config).status, 0);

  const mismatch = fixture(t);
  put(mismatch, 'skills/alpha/SKILL.md', '---\nname: beta\n---\n');
  assertFailedAt(run('audit-skill-assets.mjs', mismatch, { skillsDir: 'skills' }), 'SKILL.md', /frontmatter name.*alpha/i);

  const missing = fixture(t);
  put(missing, 'skills/alpha/SKILL.md', '---\nname: alpha\n---\nSee [missing](references/nope.md).\n');
  assertFailedAt(run('audit-skill-assets.mjs', missing, { skillsDir: 'skills' }), 'SKILL.md', /missing relative link/i);

  const missingAsset = fixture(t);
  put(missingAsset, 'skills/alpha/SKILL.md', '---\nname: alpha\n---\nRun `scripts/nope.sh`.\n');
  assertFailedAt(run('audit-skill-assets.mjs', missingAsset, { skillsDir: 'skills' }), 'SKILL.md', /missing relative link/i);

  const wrongCorpus = fixture(t);
  put(wrongCorpus, 'skills/alpha/SKILL.md', '---\nname: alpha\n---\n');
  const wrongConfig = { skillsDir: 'skills', inventory: ['beta'], counts: { skills: 2, files: 2, markdown: 2 } };
  const wrongResult = run('audit-skill-assets.mjs', wrongCorpus, wrongConfig);
  assertFailedAt(wrongResult, 'skills', /inventory mismatch/i);
  assert.match(wrongResult.stderr, /corpus count (?:skills|files|markdown)/i);

  const escaped = fixture(t);
  put(escaped, 'outside.txt', 'secret\n');
  put(escaped, 'skills/alpha/SKILL.md', '---\nname: alpha\n---\nSee [escape](escape.txt).\n');
  symlinkSync(join(escaped, 'outside.txt'), join(escaped, 'skills/alpha/escape.txt'));
  assertFailedAt(run('audit-skill-assets.mjs', escaped, { skillsDir: 'skills' }), 'escape.txt', /symlink escapes/i);
});
