import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const component = join(root, 'components', 'rules');
const cli = join(component, 'dist', 'cli.js');

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'asterline-rules-v4171-'));
  const data = mkdtempSync(join(tmpdir(), 'asterline-rules-data-'));
  mkdirSync(join(workspace, '.asterline', 'rules'), { recursive: true });
  mkdirSync(join(workspace, 'src'), { recursive: true });
  writeFileSync(join(workspace, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(workspace, 'CONTEXT.md'), 'Keep static context exact.\n');
  writeFileSync(join(workspace, 'src', 'app.ts'), 'export const app = true;\n');
  writeFileSync(
    join(workspace, '.asterline', 'rules', 'typescript.md'),
    '---\ndescription: TypeScript\nglobs: ["**/*.ts"]\n---\n\nUse strict TypeScript.\n',
  );
  return { workspace, data };
}

function run(subcommand, payload, environment = {}) {
  return spawnSync(process.execPath, [cli, 'hook', subcommand], {
    cwd: payload.workspace_roots?.[0] ?? root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PLUGIN_DATA: environment.PLUGIN_DATA,
      ASTERLINE_RULES_ENABLED_SOURCES: 'CONTEXT.md,.asterline/rules',
    },
    input: `${JSON.stringify(payload)}\n`,
    timeout: 10_000,
  });
}

test('Given the shipped component, when metadata is inspected, then it is a self-contained Auggie v4.17.1 runtime', () => {
  const manifest = JSON.parse(readFileSync(join(component, 'hooks', 'hooks.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(join(component, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '4.17.1');
  assert.deepEqual(Object.keys(manifest.hooks).sort(), ['PostToolUse', 'SessionStart']);
  assert.doesNotMatch(JSON.stringify(manifest), /matcher|statusMessage|UserPromptSubmit|PostCompact/);
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.packageManager, undefined);
  assert.equal(packageJson.scripts.bench, undefined);
  assert.equal(existsSync(join(component, 'scripts', 'bench-asterline-rules.mjs')), false);
});

test('Given an Auggie SessionStart, when the actual bundle runs, then static rules are injected once', (t) => {
  const { workspace, data } = fixture();
  t.after(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const payload = {
    hook_event_name: 'SessionStart',
    conversation_id: 'conversation-1',
    workspace_roots: [workspace],
    source: 'startup',
  };
  const first = run('session-start', payload, { PLUGIN_DATA: data });
  const second = run('session-start', payload, { PLUGIN_DATA: data });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Keep static context exact/);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, '');
});

test('Given successful and failed Auggie edits, when PostToolUse runs, then only success injects matching rules', (t) => {
  const { workspace, data } = fixture();
  t.after(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const base = {
    hook_event_name: 'PostToolUse',
    conversation_id: 'conversation-2',
    workspace_roots: [workspace],
    is_mcp_tool: false,
    tool_name: 'apply_patch',
    tool_input: { input: '*** Begin Patch\n*** End Patch' },
    file_changes: [{ path: 'src/app.ts' }],
  };
  const failed = run('post-tool-use', { ...base, tool_output: null, tool_error: 'write failed' }, { PLUGIN_DATA: data });
  const succeeded = run('post-tool-use', { ...base, tool_output: 'saved', tool_error: null }, { PLUGIN_DATA: data });
  assert.equal(failed.status, 0, failed.stderr);
  assert.equal(failed.stdout, '');
  assert.equal(succeeded.status, 0, succeeded.stderr);
  assert.match(succeeded.stdout, /Use strict TypeScript/);
});

test('Given each Auggie edit tool, when the actual hook runs, then its affected TypeScript path is matched', (t) => {
  const cases = [
    ['apply_patch', { input: '*** Begin Patch\n*** End Patch' }],
    ['str-replace-editor', { command: 'str_replace', path: 'src/app.ts', old_str: 'false', new_str: 'true' }],
    ['save-file', { path: 'src/app.ts', file_content: 'export const app = true;\n' }],
  ];
  for (const [toolName, toolInput] of cases) {
    const { workspace, data } = fixture();
    t.after(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
    const result = run('post-tool-use', {
      hook_event_name: 'PostToolUse', conversation_id: `conversation-${toolName}`, workspace_roots: [workspace], is_mcp_tool: false,
      tool_name: toolName, tool_input: toolInput, file_changes: [{ path: 'src/app.ts' }], tool_output: 'completed', tool_error: null,
    }, { PLUGIN_DATA: data });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Use strict TypeScript/, toolName);
  }
});

test('Given an explicit model family, when SessionStart runs, then the matching bundled variant is selected', (t) => {
  const { workspace, data } = fixture();
  const secondData = mkdtempSync(join(tmpdir(), 'asterline-rules-model-data-'));
  t.after(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(secondData, { recursive: true, force: true }); });
  const payload = { hook_event_name: 'SessionStart', conversation_id: 'model-1', workspace_roots: [workspace] };
  const runModel = (model, pluginData) => spawnSync(process.execPath, [cli, 'hook', 'session-start'], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, PLUGIN_DATA: pluginData, ASTERLINE_RULES_ENABLED_SOURCES: 'plugin-bundled', ASTERLINE_RULES_MODEL: model },
    input: `${JSON.stringify(payload)}\n`,
    timeout: 10_000,
  });
  const gpt55 = runModel('gpt-5.5', data);
  const gpt56 = runModel('gpt-5.6-codex', secondData);
  assert.equal(gpt55.status, 0, gpt55.stderr);
  assert.equal(gpt56.status, 0, gpt56.stderr);
  assert.match(gpt55.stdout, /warm but spare/);
  assert.doesNotMatch(gpt55.stdout, /Batch EVERY independent read/);
  assert.match(gpt56.stdout, /Batch EVERY independent read/);
});

test('Given malformed, traversing, and symlinked inputs, when hooks run, then boundaries fail open without disclosure', (t) => {
  const { workspace, data } = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'asterline-rules-secret-'));
  t.after(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  writeFileSync(join(outside, 'secret.md'), 'DO NOT DISCLOSE THIS SECRET\n');
  symlinkSync(join(outside, 'secret.md'), join(workspace, '.asterline', 'rules', 'escaped.md'));
  const malformed = spawnSync(process.execPath, [cli, 'hook', 'session-start'], { encoding: 'utf8', input: '{', timeout: 10_000 });
  const traversal = run('post-tool-use', {
    hook_event_name: 'PostToolUse', conversation_id: 'conversation-3', workspace_roots: [workspace], is_mcp_tool: false,
    tool_name: 'save-file', tool_input: { path: '../secret.md', file_content: 'x' }, file_changes: [{ path: '../secret.md' }],
    tool_output: 'saved', tool_error: null,
  }, { PLUGIN_DATA: data });
  const start = run('session-start', { hook_event_name: 'SessionStart', conversation_id: 'conversation-3', workspace_roots: [workspace], source: 'startup' }, { PLUGIN_DATA: data });
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.equal(malformed.stdout, '');
  assert.equal(traversal.status, 0, traversal.stderr);
  assert.equal(traversal.stdout, '');
  assert.doesNotMatch(start.stdout, /DO NOT DISCLOSE THIS SECRET/);
});
