import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const componentRoot = join(pluginRoot, 'components', 'lsp');
const hookModule = join(componentRoot, 'dist', 'asterline-hook.js');
const cli = join(componentRoot, 'dist', 'cli.js');
const executableOnPath = (name) => (process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, name)).find(existsSync);
const realLspServer = executableOnPath('basedpyright-langserver');

const filesBelow = (root) => {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files;
};

const stopDaemon = async (daemonRoot) => {
  const pidFile = filesBelow(daemonRoot).find((path) => path.endsWith('daemon.pid'));
  if (pidFile === undefined) return;
  const pid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
  if (Number.isSafeInteger(pid)) process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 100 && existsSync(pidFile); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const payload = (overrides = {}) => ({
  conversation_id: 'conversation-1',
  workspace_roots: ['/workspace'],
  is_mcp_tool: false,
  hook_event_name: 'PostToolUse',
  tool_name: 'save-file',
  tool_input: { path: 'src/app.ts', file_content: 'export const answer: number = "wrong";\n' },
  tool_output: 'Saved src/app.ts',
  tool_error: null,
  ...overrides,
});

test('Given exact successful Auggie edit payloads, when the hook runs, then only affected files receive diagnostics', async () => {
  // Given
  const { runLspPostToolUseHook } = await import(hookModule);
  const calls = [];
  const diagnostics = async (filePath) => {
    calls.push(filePath);
    return 'error[typescript] (2322) at 1:14: Type string is not assignable to number';
  };
  const inputs = [
    payload(),
    payload({
      tool_name: 'str-replace-editor',
      tool_input: { command: 'str_replace', path: 'src/other.ts', old_str: 'old', new_str: 'next' },
      file_changes: [{ path: 'src/other.ts' }, { path: 'src/generated.ts' }],
    }),
    payload({
      tool_name: 'apply_patch',
      tool_input: { input: '*** Begin Patch\n*** Update File: src/patched.ts\n@@\n-old\n+next\n*** End Patch' },
    }),
  ];

  // When
  const outputs = [];
  for (const input of inputs) outputs.push(await runLspPostToolUseHook(input, diagnostics));

  // Then
  assert.deepEqual(calls, ['src/app.ts', 'src/other.ts', 'src/generated.ts', 'src/patched.ts']);
  assert.ok(outputs.every((output) => output.includes('hookEventName')));
  assert.match(outputs[1], /src\/generated\.ts/);
});

test('Given failed cancelled unknown or malformed Auggie payloads, when the hook runs, then it fails open without claiming diagnostics', async () => {
  // Given
  const { runLspPostToolUseHook } = await import(hookModule);
  const calls = [];
  const diagnostics = async (filePath) => {
    calls.push(filePath);
    return 'error[typescript] (1) at 1:1: should not run';
  };
  const inputs = [
    payload({ tool_error: 'Permission denied', tool_output: '' }),
    payload({ tool_error: 'Tool execution cancelled by user', tool_output: '' }),
    payload({ tool_output: { status: 'deferred' } }),
    { hook_event_name: 'PostToolUse', tool_name: 'Save-File' },
  ];

  // When
  const outputs = [];
  for (const input of inputs) outputs.push(await runLspPostToolUseHook(input, diagnostics));

  // Then
  assert.deepEqual(calls, []);
  assert.deepEqual(outputs, ['', '', '', '']);
});

test('Given the installed component contract, when inspected, then it exposes only supported PostToolUse wiring and no package runtime dependency', () => {
  // Given
  const hooks = JSON.parse(readFileSync(join(componentRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const packageJson = JSON.parse(readFileSync(join(componentRoot, 'package.json'), 'utf8'));

  // When
  const hookNames = Object.keys(hooks);
  const commandHook = hooks.PostToolUse[0].hooks[0];

  // Then
  assert.deepEqual(hookNames, ['PostToolUse']);
  assert.equal(Object.hasOwn(hooks.PostToolUse[0], 'matcher'), false);
  assert.equal(commandHook.command, 'node "${PLUGIN_ROOT}/components/lsp/dist/cli.js" hook post-tool-use');
  assert.equal(Object.hasOwn(commandHook, 'statusMessage'), false);
  assert.deepEqual(packageJson.dependencies, undefined);
  assert.equal(Object.hasOwn(packageJson, 'packageManager'), false);
  assert.ok(Object.keys(packageJson.scripts).every((name) => !/^pre|^post/.test(name)));
});

test('Given an isolated HOME and exact Auggie stdin, when committed CLI diagnoses a missing server, then it exits cleanly without hook noise', async (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-lsp-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ASTERLINE_HOME: join(root, '.asterline'),
    ASTERLINE_LSP_DAEMON_DIR: join(root, 'daemon'),
    HOME: root,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: process.env.PATH ?? dirname(process.execPath),
    TZ: 'UTC',
  };
  const input = JSON.stringify(payload({
    tool_input: { path: join(root, 'unknown.zzz'), file_content: 'unsupported\n' },
  }));

  // When
  const result = spawnSync(process.execPath, [cli, 'hook', 'post-tool-use'], {
    encoding: 'utf8',
    env,
    input,
    timeout: 20_000,
  });
  await stopDaemon(env.ASTERLINE_LSP_DAEMON_DIR);

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(root, 'node_modules')), false);
  assert.deepEqual(
    filesBelow(env.ASTERLINE_LSP_DAEMON_DIR).filter((path) => /daemon\.(?:pid|sock|endpoint|lock)$/.test(path)),
    [],
  );
});

test('Given a real configured language server when one exists, when exact successful Auggie stdin reaches committed dist, then diagnostics are emitted', { skip: realLspServer === undefined }, async (t) => {
  // Given
  const root = mkdtempSync(join(tmpdir(), 'asterline-lsp-hook-real-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const source = join(project, 'fixture.py');
  mkdirSync(project, { recursive: true });
  writeFileSync(source, 'answer: int = "not-an-integer"\n');
  const daemonRoot = join(root, 'daemon');
  const env = {
    ASTERLINE_HOME: join(root, '.asterline'),
    ASTERLINE_LSP_DAEMON_DIR: daemonRoot,
    HOME: root,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: process.env.PATH ?? dirname(process.execPath),
    TZ: 'UTC',
  };
  const input = JSON.stringify(payload({
    tool_input: { path: source, file_content: readFileSync(source, 'utf8') },
  }));

  // When
  const result = spawnSync(process.execPath, [cli, 'hook', 'post-tool-use'], {
    cwd: project,
    encoding: 'utf8',
    env,
    input,
    timeout: 30_000,
  });
  await stopDaemon(daemonRoot);

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /fixture\.py|not.*assignable|diagnostic/i);
  assert.deepEqual(filesBelow(daemonRoot).filter((path) => /daemon\.(?:pid|sock|endpoint|lock)$/.test(path)), []);
});
