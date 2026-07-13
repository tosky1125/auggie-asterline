import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const runtimeRoot = join(pluginRoot, 'components', 'lsp', 'runtime');
const shippedRoot = join(pluginRoot, 'mcp', 'lsp');
const distRoot = join(shippedRoot, 'dist');
const canonicalCommit = 'ed0241d1af225d38de55fdbcf0baa0abc9a1465a';
const expectedPackages = ['lsp-core', 'lsp-daemon', 'lsp-tools-mcp', 'mcp-stdio-core'];
const executableOnPath = (name) => (process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, name)).find(existsSync);
const realLspServer = executableOnPath('basedpyright-langserver');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'asterline-lsp-mcp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

const parseLines = (stdout) => stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const isolatedRuntime = (t) => {
  const root = fixture(t);
  const runtime = join(root, 'runtime');
  cpSync(distRoot, runtime, { recursive: true });
  return { root, runtime, cli: join(runtime, 'cli.js') };
};

const runtimeEnv = (root) => ({
  ASTERLINE_HOME: join(root, 'home', '.asterline'),
  ASTERLINE_LSP_DAEMON_DIR: join(root, 'daemon'),
  HOME: join(root, 'home'),
  LANG: 'C',
  LC_ALL: 'C',
  PATH: process.env.PATH ?? dirname(process.execPath),
  TZ: 'UTC',
});

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

test('Given the pinned v4.17.1 sources, when inspecting the release recipe, then every LSP package and Asterline substitution is explicit', () => {
  // Given
  const recipe = JSON.parse(readFileSync(join(runtimeRoot, 'lsp-mcp.build.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(join(shippedRoot, 'transform-provenance.json'), 'utf8'));

  // When
  const packageNames = recipe.sources.map(({ package: packageName }) => packageName).sort();

  // Then
  assert.equal(recipe.upstream.commit, canonicalCommit);
  assert.deepEqual(packageNames, expectedPackages);
  assert.equal(recipe.toolchain.version, '1.3.14');
  assert.equal(provenance.recipeSha256, sha256(readFileSync(join(runtimeRoot, 'lsp-mcp.build.json'))));
  assert.equal(provenance.upstream.commit, canonicalCommit);
  assert.ok(recipe.transforms.length >= 10);
  assert.ok(provenance.transformedFiles.every(({ canonicalSha256, transformedSha256 }) => canonicalSha256.length === 64 && transformedSha256.length === 64));
  for (const output of provenance.outputFiles) assert.equal(output.sha256, sha256(readFileSync(join(shippedRoot, output.file))), output.file);
});

test('Given only the committed dist, when loading help and MCP lifecycle requests, then it is self-contained and malformed input is rejected', (t) => {
  // Given
  const { root, cli } = isolatedRuntime(t);
  const env = runtimeEnv(root);
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ].map((message) => JSON.stringify(message)).join('\n') + '\n{bad json\n';

  // When
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', env, timeout: 5_000 });
  const exchange = spawnSync(process.execPath, [cli, 'mcp'], { encoding: 'utf8', env, input, timeout: 10_000 });
  const responses = parseLines(exchange.stdout);

  // Then
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /asterline-lsp-daemon.*mcp.*daemon/i);
  assert.equal(exchange.status, 0, exchange.stderr);
  assert.equal(responses[0].result.serverInfo.name, 'lsp');
  assert.deepEqual(responses[1].result.tools.map(({ name }) => name), [
    'status', 'diagnostics', 'goto_definition', 'find_references', 'symbols', 'prepare_rename', 'rename', 'install_decision',
  ]);
  assert.equal(responses[2].error.code, -32700);
  assert.equal(existsSync(join(root, 'node_modules')), false);
});

test('Given an isolated HOME with no matching server, when status and diagnostics run, then failures are truthful and the daemon shuts down cleanly', async (t) => {
  // Given
  const { root, cli } = isolatedRuntime(t);
  const env = runtimeEnv(root);
  const source = join(root, 'unknown.zzz');
  writeFileSync(source, 'not a configured language\n');
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'status', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'diagnostics', arguments: { filePath: source } } },
  ].map((message) => `${JSON.stringify(message)}\n`).join('');

  // When
  const exchange = spawnSync(process.execPath, [cli, 'mcp'], { encoding: 'utf8', env, input, timeout: 20_000 });
  const responses = parseLines(exchange.stdout);
  await stopDaemon(env.ASTERLINE_LSP_DAEMON_DIR);

  // Then
  assert.equal(exchange.status, 0, exchange.stderr);
  assert.equal(responses.length, 2);
  assert.equal(responses[0].result.isError, false);
  assert.equal(responses[1].result.isError, false);
  assert.match(responses[1].result.content[0].text, /no.*server|not.*configured|unsupported/i);
  assert.equal(responses[1].result.details.errorKind, 'missing_dependency');
  assert.match(responses[1].result.content[0].text, /\.asterline\/lsp-client\.json/);
  assert.deepEqual(filesBelow(env.ASTERLINE_LSP_DAEMON_DIR).filter((path) => /daemon\.(?:pid|sock|endpoint|lock)$/.test(path)), []);
});

test('Given a real configured language server when one exists, when diagnostics run, then the MCP reaches that server', { skip: realLspServer === undefined }, async (t) => {
  // Given
  const { root, cli } = isolatedRuntime(t);
  const env = runtimeEnv(root);
  const project = join(root, 'project');
  const source = join(project, 'fixture.py');
  mkdirSync(project, { recursive: true });
  writeFileSync(source, 'answer: int = "not-an-integer"\n');

  // When
  const request = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'diagnostics', arguments: { filePath: source } } })}\n`;
  const exchange = spawnSync(process.execPath, [cli, 'mcp'], { cwd: project, encoding: 'utf8', env, input: request, timeout: 20_000 });
  await stopDaemon(env.ASTERLINE_LSP_DAEMON_DIR);

  // Then
  assert.equal(exchange.status, 0, exchange.stderr);
  const result = parseLines(exchange.stdout)[0].result;
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /fixture\.py|not.*assignable|diagnostic/i);
});
