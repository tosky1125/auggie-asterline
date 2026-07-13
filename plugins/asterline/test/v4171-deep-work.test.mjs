import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const skillRoot = join(pluginRoot, 'skills', 'deep-work');
const generatedPaths = ['SKILL.md', 'agents/openai.yaml'];
const internalPaths = ['ATTRIBUTION.md'];

const filesBelow = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
};

const read = (path) => readFileSync(join(skillRoot, path), 'utf8');

test('Given generated v4.17.1 ultrawork assets, when deep-work is materialized, then every source path and only the approved attribution file ship', () => {
  assert.equal(existsSync(skillRoot), true);
  assert.deepEqual(filesBelow(skillRoot), [...generatedPaths, ...internalPaths].sort());
});

test('Given the public skill contract, when Auggie discovers deep-work, then metadata names the Asterline surface', () => {
  const skill = read('SKILL.md');
  const metadata = read('agents/openai.yaml');
  assert.match(skill, /^---\nname: deep-work\n/);
  assert.match(skill, /description: .*Asterline.*Auggie/);
  assert.match(metadata, /display_name: "Asterline Deep Work"/);
  assert.match(metadata, /\$deep-work/);
  assert.doesNotMatch(`${skill}\n${metadata}`, /\$ultrawork|\$ulw-plan|\$start-work|\$review-work/);
});

test('Given Auggie execution limits, when the workflow delegates, then it permits only one-shot parallel decomposition', () => {
  const skill = read('SKILL.md');
  for (const decision of [
    'bounded independent subtasks',
    'one-shot parallel decomposition',
    'disjoint ownership',
    'terminal result',
    'parent verifies',
  ]) assert.match(skill, new RegExp(decision, 'i'), decision);
  assert.match(skill, /persistent team, messaging, resume, and thread support are unavailable/i);
  assert.doesNotMatch(skill, /multi_agent_v[12]|spawn_agent|send_message|followup_task|wait_agent|agent_type|mailbox|\.codex\/agents/i);
});

test('Given current Asterline skill names, when deep-work routes specialist workflows, then no upstream public aliases remain', () => {
  const skill = read('SKILL.md');
  for (const name of ['work-plan', 'run-plan', 'review-pass', 'structure-search', 'code-intel', 'debug-trace', 'ui-polish', 'visual-check', 'team-mode']) {
    assert.match(skill, new RegExp(`\\$${name}\\b`), name);
  }
  assert.doesNotMatch(skill, /\$(?:ulw-plan|start-work|review-work|ast-grep|lsp|debugging|frontend|visual-qa|teammode)\b/);
});

test('Given the installed Asterline agent surface, when discovery and planning are delegated, then only current roles are named', () => {
  const skill = read('SKILL.md');
  for (const role of ['scout', 'archivist', 'strategist']) assert.match(skill, new RegExp(`\\\`${role}\\\``), role);
  assert.doesNotMatch(skill, /`(?:explorer|librarian|plan)`|fork_context|script\/qa\/web-terminal-visual-qa/);
  assert.doesNotMatch(skill, /download and use agent-browser/i);
});

test('Given the privacy and installation contract, when shipped prose and metadata are audited, then no telemetry or package-manager execution is prescribed', () => {
  const source = generatedPaths.map(read).join('\n');
  assert.doesNotMatch(source, /posthog|telemetry/i);
  assert.doesNotMatch(source, /(?:^|[\s`'"])(?:npm|npx|pnpm|yarn|bun|bunx)(?:\s|$)/im);
});

test('Given pinned source provenance, when attribution is audited, then both generated assets have exact upstream SHA-256 values and an MIT license reference', () => {
  const attribution = read('ATTRIBUTION.md');
  assert.match(attribution, /3d7416bff3e6c80ebf5542b4dd12f5c76298d46d/);
  assert.match(attribution, /94db32eda50276574afa32aad743a9eed0d920df778ca8180d99f49761282062/);
  assert.match(attribution, /a103818401ef495cd07718ce026c4e6d8c7a8a944c90016e226d0e85d1d6e421/);
  assert.match(attribution, /MIT License/);
});

test('Given shipped Markdown, when local links are resolved, then every target stays inside deep-work and exists', () => {
  for (const path of filesBelow(skillRoot).filter((item) => item.endsWith('.md'))) {
    const absolute = join(skillRoot, path);
    for (const match of readFileSync(absolute, 'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#', 1)[0];
      if (target === '' || /^[a-z]+:/i.test(target)) continue;
      const destination = resolve(dirname(absolute), decodeURIComponent(target));
      assert.ok(destination.startsWith(`${skillRoot}/`), `${path}: escaping link ${target}`);
      assert.ok(existsSync(destination), `${path}: missing link ${target}`);
    }
  }
});
