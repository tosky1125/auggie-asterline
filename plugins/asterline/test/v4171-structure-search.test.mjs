import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const skillRoot = join(pluginRoot, 'skills', 'structure-search');
const helperPath = join(skillRoot, 'scripts', 'ast_grep_helper.py');

const upstreamFiles = [
  'LICENSE',
  'README.md',
  'SKILL.md',
  'SOURCE',
  'agents/openai.yaml',
  'install.ps1',
  'install.sh',
  'references/cli.md',
  'references/install.md',
  'references/patterns.md',
  'references/pitfalls.md',
  'references/recipes.md',
  'references/sgconfig.md',
  'references/yaml-rules.md',
  'scripts/ast_grep_helper.py',
  'tests/smoke.ps1',
  'tests/smoke.sh',
];

const helperModules = [
  'scripts/structure_search/__init__.py',
  'scripts/structure_search/__main__.py',
  'scripts/structure_search/commands.py',
  'scripts/structure_search/constants.py',
  'scripts/structure_search/parser.py',
  'scripts/structure_search/patterns.py',
  'scripts/structure_search/results.py',
  'scripts/structure_search/runtime.py',
];

const pureLines = (source) =>
  source
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#')).length;

const filesBelow = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name === '__pycache__') continue;
      if (path.endsWith('.pyc')) continue;
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
};

const runHelper = (args, options = {}) =>
  spawnSync('python3', [helperPath, ...args], {
    encoding: 'utf8',
    ...options,
  });

test('Given the imported v4.17.1 skill, when its corpus is inspected, then all 17 upstream paths and only allowlisted helper modules are present', () => {
  assert.deepEqual(filesBelow(skillRoot), [...upstreamFiles, ...helperModules].sort());
  for (const path of upstreamFiles) assert.ok(existsSync(join(skillRoot, path)), `missing upstream path: ${path}`);
  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: structure-search\n/m);
  assert.match(skill, /^# Structure Search$/m);
  assert.match(skill, /scripts\/ast_grep_helper\.py/);
  assert.match(skill, /Asterline/i);
  assert.match(skill, /ast_grep_search/);
  assert.match(skill, /ast_grep_replace/);
  assert.doesNotMatch(skill, /structure_search_(?:search|replace)/);
  assert.doesNotMatch(skill, /\$omo:ast-grep|\$lazycodex|plugins\/omo|OMO_AST_GREP_SG_PATH/);
  assert.match(readFileSync(join(skillRoot, 'SOURCE'), 'utf8'), /3148c69/);
});

test('Given the Python helper package, when source size is audited, then every module is at most 250 pure lines without an override', () => {
  for (const path of ['scripts/ast_grep_helper.py', ...helperModules]) {
    const source = readFileSync(join(skillRoot, path), 'utf8');
    assert.doesNotMatch(source, /noqa:\s*SIZE_OK/);
    assert.ok(pureLines(source) <= 250, `${path}: ${pureLines(source)} pure lines`);
  }
});

test('Given the complete skill corpus, when local links are resolved, then none escape or point at a missing asset', () => {
  const markdownFiles = filesBelow(skillRoot).filter((path) => path.endsWith('.md'));
  for (const path of markdownFiles) {
    const absolute = join(skillRoot, path);
    const source = readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#', 1)[0];
      if (target === '' || /^[a-z]+:/i.test(target)) continue;
      const resolved = resolve(dirname(absolute), decodeURIComponent(target));
      assert.ok(resolved.startsWith(`${resolve(skillRoot)}/`), `${path}: escaping link ${target}`);
      assert.ok(existsSync(resolved), `${path}: missing link ${target}`);
    }
  }
});

test('Given an Asterline-provided sg binary, when search and replace preview run, then the helper executes both without mutating the fixture', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'asterline-structure-search-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = join(root, 'fixture.ts');
  const log = join(root, 'sg-args.jsonl');
  const fake = join(root, 'sg');
  writeFileSync(fixture, 'console.log("hello");\n');
  writeFileSync(
    fake,
    `#!/usr/bin/env python3
import json, os, sys
with open(os.environ['SG_ARGS_LOG'], 'a', encoding='utf-8') as handle:
    handle.write(json.dumps(sys.argv[1:]) + '\\n')
if '--version' in sys.argv:
    print('ast-grep 0.43.0')
elif any(arg.startswith('--json') for arg in sys.argv):
    print(json.dumps([{'file': sys.argv[-1], 'range': {'start': {'line': 0, 'column': 0}, 'end': {'line': 0, 'column': 20}}, 'text': 'console.log("hello")', 'replacement': 'logger.info("hello")'}]))
`,
  );
  chmodSync(fake, 0o755);
  const env = { ...process.env, ASTERLINE_AST_GREP_SG_PATH: fake, SG_ARGS_LOG: log };

  const search = runHelper(['search', 'console.log($MSG)', '--lang', 'ts', fixture], { env });
  assert.equal(search.status, 0, search.stderr);
  assert.match(search.stdout, /console\.log/);
  const preview = runHelper(['replace', 'console.log($MSG)', 'logger.info($MSG)', '--lang', 'ts', fixture], { env });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /logger\.info|replacement/i);
  assert.equal(readFileSync(fixture, 'utf8'), 'console.log("hello");\n');
  const invocations = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(invocations.some((args) => args.includes('run') && args.some((arg) => arg.startsWith('--json'))));
  assert.equal(invocations.some((args) => args.includes('--update-all')), false);
});

test('Given no bundled or configured sg binary, when search runs, then it reports unavailable and never installs anything', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'asterline-structure-search-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'bin'));
  const fixture = join(root, 'fixture.ts');
  writeFileSync(fixture, 'console.log("hello");\n');
  const env = {
    ...process.env,
    ASTERLINE_AST_GREP_SG_PATH: '',
    HOME: root,
    PATH: '/usr/bin:/bin',
  };

  const result = runHelper(['search', 'console.log($MSG)', '--lang', 'ts', fixture], { env });
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /unavailable|not found/i);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /installing|npm install|pip install|cargo install/i);
  assert.deepEqual(readdirSync(join(root, 'bin')), []);
});
