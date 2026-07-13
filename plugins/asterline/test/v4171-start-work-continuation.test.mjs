import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url).pathname;
const componentRoot = join(pluginRoot, 'components', 'start-work-continuation');
const cliPath = join(componentRoot, 'dist', 'cli.js');

const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'asterline-run-plan-continuation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

const put = (root, path, contents) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

const boulder = ({ sessionIds = ['auggie:session-1'], status = 'active', activePlan = '.asterline/plans/plan.md' } = {}) => JSON.stringify({
  schema_version: 2,
  active_work_id: 'work-1',
  works: {
    'work-1': {
      work_id: 'work-1',
      active_plan: activePlan,
      plan_name: 'release-plan',
      status,
      session_ids: sessionIds,
    },
  },
});

const payload = (cwd, event = 'Stop') => JSON.stringify({
  session_id: 'session-1',
  turn_id: 'turn-1',
  transcript_path: '',
  cwd,
  hook_event_name: event,
  model: 'gpt-5',
  permission_mode: 'default',
  stop_hook_active: false,
  last_assistant_message: 'done',
});

const run = (subcommand, input) => spawnSync(process.execPath, [cliPath, 'hook', subcommand], {
  input,
  encoding: 'utf8',
  env: { HOME: dirname(process.execPath), PATH: dirname(process.execPath) },
});

test('Given installed Auggie run-plan state, when Stop runs, then actual dist blocks with current paths and next action', (t) => {
  // Given
  const root = fixture(t);
  put(root, '.asterline/boulder.json', boulder());
  put(root, '.asterline/plans/plan.md', '## TODOs\n- [ ] Port continuation\n- [x] Pin baseline\n');
  put(root, '.asterline/run-plan/ledger.jsonl', '{"event":"started"}\n');

  // When
  const result = run('stop', payload(root));

  // Then
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /Next incomplete task: `Port continuation`/);
  assert.match(output.reason, new RegExp(join(root, '.asterline', 'run-plan', 'ledger.jsonl').replaceAll('\\', '\\\\')));
  assert.match(output.reason, /auggie:session-1/);
  assert.match(output.reason, /skills\/run-plan\/SKILL\.md/);
  assert.doesNotMatch(output.reason, /LazyCodex|omo-codex|start-work\/SKILL\.md|multi_agent_v1/);
});

test('Given completed or unrelated state, when Stop runs, then actual dist fails open', (t) => {
  // Given
  const cases = [
    ['completed', boulder({ status: 'completed' }), '## TODOs\n- [ ] Still written\n'],
    ['checked', boulder(), '## TODOs\n- [x] Complete\n'],
    ['other harness', boulder({ sessionIds: ['codex:session-1'] }), '## TODOs\n- [ ] Not ours\n'],
  ];

  for (const [name, state, plan] of cases) {
    const root = fixture(t);
    put(root, '.asterline/boulder.json', state);
    put(root, '.asterline/plans/plan.md', plan);

    // When
    const result = run('stop', payload(root));

    // Then
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stdout, '', name);
  }
});

test('Given unsupported SubagentStop, when invoked, then component does not continue subagents', (t) => {
  // Given
  const root = fixture(t);
  put(root, '.asterline/boulder.json', boulder());
  put(root, '.asterline/plans/plan.md', '## TODOs\n- [ ] Parent-only continuation\n');

  // When
  const eventResult = run('stop', payload(root, 'SubagentStop'));
  const commandResult = run('subagent-stop', payload(root, 'SubagentStop'));

  // Then
  assert.equal(eventResult.status, 0, eventResult.stderr);
  assert.equal(eventResult.stdout, '');
  assert.notEqual(commandResult.status, 0);
  assert.equal(commandResult.stdout, '');
});

test('Given state points outside the workspace, when Stop runs, then actual dist refuses path traversal', (t) => {
  // Given
  const root = fixture(t);
  const outside = fixture(t);
  put(outside, 'plan.md', '## TODOs\n- [ ] Exfiltrate outside plan\n');
  put(root, '.asterline/boulder.json', boulder({ activePlan: join('..', outside.split('/').at(-1), 'plan.md') }));

  // When
  const traversal = run('stop', payload(root));
  put(root, '.asterline/boulder.json', boulder({ activePlan: join(outside, 'plan.md') }));
  const absolute = run('stop', payload(root));

  // Then
  assert.equal(traversal.status, 0, traversal.stderr);
  assert.equal(traversal.stdout, '');
  assert.equal(absolute.status, 0, absolute.stderr);
  assert.equal(absolute.stdout, '');
});

test('Given a tracked plan symlink escapes the workspace, when Stop runs, then actual dist fails open', (t) => {
  // Given
  const root = fixture(t);
  const outside = fixture(t);
  put(outside, 'plan.md', '## TODOs\n- [ ] Follow escaped symlink\n');
  put(root, '.asterline/boulder.json', boulder());
  mkdirSync(join(root, '.asterline', 'plans'), { recursive: true });
  symlinkSync(join(outside, 'plan.md'), join(root, '.asterline', 'plans', 'plan.md'));

  // When
  const result = run('stop', payload(root));

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('Given fail-open Stop conditions, when actual dist runs, then malformed recursive missing and pressured turns stay silent', (t) => {
  // Given
  const root = fixture(t);
  put(root, '.asterline/boulder.json', boulder());
  put(root, '.asterline/plans/plan.md', '## TODOs\n- [ ] Continue later\n');
  put(root, 'transcript.jsonl', '{"error":"context_too_large"}\n');
  const parsed = JSON.parse(payload(root));
  const cases = [
    ['malformed input', '{'],
    ['recursive stop', JSON.stringify({ ...parsed, stop_hook_active: true })],
    ['context pressure', JSON.stringify({ ...parsed, transcript_path: join(root, 'transcript.jsonl') })],
    ['missing state', payload(fixture(t))],
  ];

  for (const [name, input] of cases) {
    // When
    const result = run('stop', input);

    // Then
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stdout, '', name);
  }
});

test('Given paused Auggie work, when Stop runs, then actual dist resumes the next checkbox', (t) => {
  // Given
  const root = fixture(t);
  put(root, '.asterline/boulder.json', boulder({ status: 'paused' }));
  put(root, '.asterline/plans/plan.md', '## TODOs\n- [ ] Resume paused work\n');

  // When
  const result = run('stop', payload(root));

  // Then
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Resume paused work/);
});

test('Given component-local hook metadata, when inspected, then only Auggie Stop is declared', () => {
  // Given
  const hooks = JSON.parse(readFileSync(join(componentRoot, 'hooks', 'hooks.json'), 'utf8'));

  // When
  const events = Object.keys(hooks.hooks);

  // Then
  assert.deepEqual(events, ['Stop']);
  assert.equal(JSON.stringify(hooks).includes('SubagentStop'), false);
  assert.equal(JSON.stringify(hooks).includes('statusMessage'), false);
  assert.match(JSON.stringify(hooks), /hook stop/);
});
