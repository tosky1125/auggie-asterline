import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const skillRoot = join(pluginRoot, 'skills', 'session-history');
const finder = join(skillRoot, 'scripts', 'find-agent-sessions.py');
const expectedFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/all-platforms.md',
  'references/claude.md',
  'references/codex.md',
  'references/opencode.md',
  'references/senpi.md',
  'scripts/agent_sessions/__init__.py',
  'scripts/agent_sessions/claude.py',
  'scripts/agent_sessions/cli.py',
  'scripts/agent_sessions/codex.py',
  'scripts/agent_sessions/file_scanners.py',
  'scripts/agent_sessions/jsonio.py',
  'scripts/agent_sessions/kiro_scanner.py',
  'scripts/agent_sessions/opencode.py',
  'scripts/agent_sessions/scanners.py',
  'scripts/agent_sessions/sqlite_optional_scanners.py',
  'scripts/agent_sessions/sqlite_scanners.py',
  'scripts/agent_sessions/timeparse.py',
  'scripts/agent_sessions/transcript.py',
  'scripts/agent_sessions/types.py',
  'scripts/find-agent-sessions.py',
];
const expectedPlatforms = [
  'codex', 'claude', 'senpi', 'opencode', 'openclaw', 'droid', 'amp', 'gemini', 'kimi', 'qwen',
  'codebuff', 'roo-code', 'kilo-code', 'cline', 'kodu', 'cursor-cli', 'aider', 'kilo-cli', 'hermes',
  'goose', 'crush', 'zed', 'kiro',
];

function filesBelow(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

function runFinder(home, args, env = {}) {
  const result = spawnSync('python3', [finder, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CODEX_HOME: '', OPENCODE_HOME: '', PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1', ...env },
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function createSqlite(path, script) {
  mkdirSync(dirname(path), { recursive: true });
  execFileSync('python3', ['-c', script, path], { stdio: 'pipe' });
}

test('Given the v4.17.1 shipped skill, when inventory is inspected, then all 22 adapted files exist', () => {
  assert.deepEqual(filesBelow(skillRoot), expectedFiles);
  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  const metadata = readFileSync(join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
  assert.match(skill, /^---\nname: session-history\n/);
  assert.doesNotMatch(skill + metadata, /coding-agent-sessions|\$coding-agent-sessions|\(OmO\)/);
  assert.match(metadata, /\$session-history/);
  for (const reference of ['all-platforms.md', 'claude.md', 'codex.md', 'opencode.md', 'senpi.md']) {
    assert.equal(skill.includes(`references/${reference}`), true);
    assert.equal(filesBelow(join(skillRoot, 'references')).includes(reference), true);
  }
});

test('Given the finder registry, when imported, then exactly 23 backends are registered', () => {
  const source = readFileSync(join(skillRoot, 'scripts', 'agent_sessions', 'scanners.py'), 'utf8');
  const names = [...source.matchAll(/^    "([a-z-]+)":/gm)].map((match) => match[1]);
  assert.deepEqual(names, expectedPlatforms);
});

test('Given no agent stores, when all backends are listed, then they are skipped without errors', () => {
  const home = mkdtempSync(join(tmpdir(), 'asterline-session-empty-'));
  try {
    const payload = runFinder(home, ['list', '--limit', '50', '--workers', '8']);
    assert.deepEqual(payload, { count: 0, results: [] });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Given Codex, Claude, and OpenCode stores, when filtering, then matching sessions are returned', () => {
  const home = mkdtempSync(join(tmpdir(), 'asterline-session-fixtures-'));
  try {
    const codex = join(home, 'codex');
    const codexDb = join(codex, 'state_1.sqlite');
    createSqlite(codexDb, String.raw`
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("create table threads (id text, rollout_path text, cwd text, created_at integer, updated_at integer, model_provider text, model text, first_user_message text, tokens_used integer, source text, agent_nickname text, agent_role text)")
db.execute("create table thread_spawn_edges (child_thread_id text, parent_thread_id text)")
db.execute("insert into threads values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ('codex-1', '', '/work/alpha', 1893456000, 1893456060, 'openai', 'gpt-5', 'needle codex', 42, '{}', None, None))
db.commit()
`);

    const claudeDir = join(home, '.claude', 'transcripts');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'claude-1.jsonl'), `${JSON.stringify({ type: 'user', sessionId: 'claude-1', cwd: '/work/beta', timestamp: '2030-01-02T00:00:00Z', message: { role: 'user', model: 'sonnet', content: 'needle claude' } })}\n`);

    const openCode = join(home, '.local', 'share', 'opencode');
    const openCodeDb = join(openCode, 'opencode.db');
    createSqlite(openCodeDb, String.raw`
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("create table session (id text, title text, directory text, time_created integer, time_updated integer, cost real, tokens_input integer, tokens_output integer, tokens_reasoning integer, tokens_cache_read integer, tokens_cache_write integer, model text, parent_id text, agent text, time_archived integer)")
db.execute("insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ('oc-1', 'needle opencode', '/work/gamma', 1893542400000, 1893542460000, 0.1, 1, 2, 3, 4, 5, '{\"providerID\":\"local\",\"id\":\"qwen\"}', None, None, None))
db.commit()
`);

    const codexResult = runFinder(home, ['find', 'needle', '--platform', 'codex', '--root', codex, '--cwd', 'alpha', '--model', 'gpt-5', '--from', '2030-01-01', '--to', '2030-01-02']);
    assert.equal(codexResult.results[0].id, 'codex-1');
    const codexRead = runFinder(home, ['read', 'codex-1', '--platform', 'codex', '--root', codex]);
    assert.equal(codexRead.results[0].prompts.first_user_message, 'needle codex');
    const claudeResult = runFinder(home, ['find', 'needle', '--platform', 'claude', '--cwd', 'beta', '--model', 'sonnet', '--from', '2030-01', '--to', '2030-02']);
    assert.equal(claudeResult.results[0].id, 'claude-1');
    const openCodeResult = runFinder(home, ['find', 'needle', '--platform', 'opencode', '--cwd', 'gamma', '--model', 'qwen']);
    assert.equal(openCodeResult.results[0].id, 'oc-1');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Given malformed stores and an undiscovered file, when searching and reading, then no path escape is exposed', () => {
  const home = mkdtempSync(join(tmpdir(), 'asterline-session-privacy-'));
  try {
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(join(home, '.codex', 'state_bad.sqlite'), 'not sqlite');
    const privateFile = join(home, 'private-session.jsonl');
    writeFileSync(privateFile, '{"type":"user","content":"private secret"}\n');
    const search = runFinder(home, ['find', 'private secret', '--platform', 'codex']);
    assert.equal(search.count, 0);
    const read = runFinder(home, ['read', privateFile, '--platform', 'codex']);
    assert.equal(read.count, 0);
    assert.doesNotMatch(JSON.stringify({ search: search.results, read: read.results }), /private secret/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Given the CLI entrypoint, when help is requested, then supported commands and filters are documented', () => {
  const result = spawnSync('python3', [finder, '--help'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /list\|find\|search\|read\|get/);
  for (const option of ['--platform', '--root', '--from', '--to', '--cwd', '--model', '--workers', '--include-subagents']) {
    assert.match(result.stdout, new RegExp(option));
  }
});
