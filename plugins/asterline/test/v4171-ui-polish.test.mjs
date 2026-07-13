import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const skillRoot = join(pluginRoot, 'skills', 'ui-polish');
const expectedPathDigest = '49fec9ff12c60b43834f032f974149f00c6855c089ded96a5e7d0a2826dc02e0';
const internalPythonModules = [
  'references/ui-ux-db/scripts/design_system_parts/__init__.py',
  'references/ui-ux-db/scripts/design_system_parts/ascii.py',
  'references/ui-ux-db/scripts/design_system_parts/generator.py',
  'references/ui-ux-db/scripts/design_system_parts/markdown.py',
  'references/ui-ux-db/scripts/design_system_parts/master.py',
  'references/ui-ux-db/scripts/design_system_parts/pages.py',
  'references/ui-ux-db/scripts/design_system_parts/persistence.py',
];

const walkFiles = (root, current = root) => {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, path));
    else files.push(relative(root, path));
  }
  return files.sort();
};

const run = (command, args) => spawnSync(command, args, {
  cwd: pluginRoot,
  encoding: 'utf8',
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  timeout: 20_000,
});

test('ui-polish preserves every v4.17.1 generated path plus an explicit internal allowlist', () => {
  const files = walkFiles(skillRoot);
  const internal = files.filter((file) => internalPythonModules.includes(file));
  const upstream = files.filter((file) => !internalPythonModules.includes(file));
  const digest = createHash('sha256').update(`${upstream.join('\n')}\n`).digest('hex');
  assert.deepEqual(internal, internalPythonModules);
  assert.equal(upstream.length, 171);
  assert.equal(digest, expectedPathDigest);
});

test('ui-polish keeps every shipped Python module at or below 250 pure lines', () => {
  for (const file of walkFiles(skillRoot).filter((path) => path.endsWith('.py'))) {
    const body = readFileSync(join(skillRoot, file), 'utf8');
    const pureLines = body.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    }).length;
    assert(pureLines <= 250, `${file}: ${pureLines} pure lines`);
  }
});

test('ui-polish owns its public identity and truthful Auggie routing', () => {
  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  const agent = readFileSync(join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
  assert.match(skill, /^---\nname: ui-polish\n/m);
  assert.match(skill, /Auggie/);
  assert.match(skill, /browser capability|browser tooling|browser integration/i);
  assert.match(skill, /not available|when available|if available/i);
  assert.doesNotMatch(skill, /`agent-browser` skill|\/(?:visual-qa|review-work)\b/);
  assert.match(agent, /display_name:\s*["']?Asterline UI Polish/i);
  assert.doesNotMatch(agent, /\(OmO\)|frontend/i);
});

test('ui-polish preserves databases, helpers, licenses, and local links', () => {
  const files = walkFiles(skillRoot);
  for (const required of [
    'ATTRIBUTION.md',
    'LICENSE-Apache-2.0.txt',
    'references/design/_INDEX.md',
    'references/designpowers/vendor/LICENSE',
    'references/ui-ux-db/data/colors.csv',
    'references/ui-ux-db/data/ui-reasoning.csv',
    'references/ui-ux-db/scripts/search.py',
    'scripts/perfection/lighthouse-audit.py',
  ]) assert(files.includes(required), required);

  const attribution = readFileSync(join(skillRoot, 'ATTRIBUTION.md'), 'utf8');
  assert.match(attribution, /Asterline packaging note/i);
  assert.match(attribution, /commits the materialized files/i);
  assert.match(attribution, /`skills\/ui-polish\/\*\*`/);
  assert.match(attribution, /remaining provenance text.*upstream generation/i);

  for (const file of files.filter((path) => path.endsWith('.md'))) {
    const body = readFileSync(join(skillRoot, file), 'utf8');
    const links = body.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g);
    for (const [, rawTarget] of links) {
      const target = rawTarget.trim().replace(/^<|>$/g, '').split('#', 1)[0].split('?', 1)[0];
      if (!target || /^(?:https?:|mailto:|data:|\/|\$|\{|<)/.test(target) || target.includes('*')) continue;
      const decoded = decodeURIComponent(target);
      assert.equal(statSync(resolve(dirname(join(skillRoot, file)), decoded)).isFile(), true, `${file} -> ${rawTarget}`);
    }
  }
});

test('ui-polish Python helpers compile and answer a real dashboard palette query', () => {
  for (const file of walkFiles(skillRoot).filter((path) => path.endsWith('.py'))) {
    const result = run('python3', [
      '-c',
      'import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text(encoding="utf-8"), str(p), "exec")',
      join(skillRoot, file),
    ]);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }

  const query = run('python3', [
    join(skillRoot, 'references/ui-ux-db/scripts/search.py'),
    'analytics dashboard palette',
    '--domain',
    'color',
    '--json',
  ]);
  assert.equal(query.status, 0, query.stderr);
  const result = JSON.parse(query.stdout);
  assert.equal(result.domain, 'color');
  assert(result.count > 0);
  assert(result.results.some((entry) => Object.values(entry).some((value) => /#(?:[0-9a-f]{3}){1,2}\b/i.test(String(value)))));
});

test('ui-polish generates and persists a master plus page override through the public CLI', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'asterline-ui-polish-'));
  try {
    const generated = run('python3', [
      join(skillRoot, 'references/ui-ux-db/scripts/search.py'),
      'saas analytics dashboard',
      '--design-system',
      '--project-name',
      'Ops Desk',
      '--format',
      'markdown',
      '--persist',
      '--page',
      'dashboard',
      '--output-dir',
      outputDir,
    ]);
    assert.equal(generated.status, 0, generated.stderr);
    assert.match(generated.stdout, /## Design System: Ops Desk/);

    const master = readFileSync(join(outputDir, 'design-system/ops-desk/MASTER.md'), 'utf8');
    const page = readFileSync(join(outputDir, 'design-system/ops-desk/pages/dashboard.md'), 'utf8');
    assert.match(master, /^# Design System Master File/m);
    assert.match(master, /\*\*Project:\*\* Ops Desk/);
    assert.match(master, /rules \*\*override\*\* this Master file/i);
    assert.match(page, /^# Dashboard Page Overrides/m);
    assert.match(page, /override.*Master file/i);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('ui-polish keeps direct-script and public module imports compatible', () => {
  const scripts = join(skillRoot, 'references/ui-ux-db/scripts');
  const direct = run('python3', [
    join(scripts, 'design_system.py'),
    'saas dashboard',
    '--project-name',
    'Module Check',
    '--format',
    'markdown',
  ]);
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /## Design System: Module Check/);

  const imported = run('python3', [
    '-c',
    'import sys; sys.path.insert(0, sys.argv[1]); from design_system import DesignSystemGenerator, format_ascii_box, format_markdown, generate_design_system, persist_design_system; print(generate_design_system("saas dashboard", "Import Check", "markdown"))',
    scripts,
  ]);
  assert.equal(imported.status, 0, imported.stderr);
  assert.match(imported.stdout, /## Design System: Import Check/);
});

test('ui-polish audit preflight stays local and executable scripts never auto-install', () => {
  const auditPath = join(skillRoot, 'scripts/perfection/lighthouse-audit.py');
  const audit = readFileSync(auditPath, 'utf8');
  assert.doesNotMatch(audit, /subprocess\.run\(\s*\[\s*["'](?:npm|npx|pnpm|yarn|bunx|pip|uv)["'][\s\S]{0,160}["'](?:install|add)["']/);
  assert.doesNotMatch(audit, /def _install_node_deps/);

  const preflight = run('python3', [auditPath, '--check-environment']);
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.match(preflight.stdout, /browser audit environment/i);
  assert.match(preflight.stdout, /no packages were installed/i);
});
