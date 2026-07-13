import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skillUrl = new URL('../skills/team-mode/SKILL.md', import.meta.url);
const limitation = 'Auggie에서는 병렬 작업 분할만 지원하며 지속 팀, 메시징, 재개, 스레드는 지원하지 않습니다.';

const readSkill = () => readFileSync(skillUrl, 'utf8');

const frontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert(match, 'team-mode must have YAML frontmatter');
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.match(/^([a-z]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^"|"$/g, '')]),
  );
};

test('team-mode identifies the Auggie-only capability before any broader description', () => {
  const source = readSkill();
  const metadata = frontmatter(source);
  assert.deepEqual(Object.keys(metadata).sort(), ['description', 'name']);
  assert.equal(metadata.name, 'team-mode');
  assert(metadata.description.startsWith(limitation));

  const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
  const firstProse = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  assert.equal(firstProse, limitation);
});

test('team-mode defines only bounded one-shot parallel decomposition', () => {
  const source = readSkill();
  for (const required of [
    'bounded independent subtasks',
    'available Auggie subagent or delegation surface',
    'disjoint ownership',
    'terminal result',
    'parent verifies and integrates',
  ]) {
    assert.match(source, new RegExp(required, 'i'), required);
  }

  assert.match(source, /Example decomposition:/);
  assert.match(source, /Worker A owns only `src\/parser\/\*\*`/);
  assert.match(source, /Worker B owns only `test\/fixtures\/\*\*`/);
});

test('team-mode explicitly refuses unsupported durable-team behavior', () => {
  const source = readSkill();
  for (const unsupported of [
    'durable team state',
    'mailbox',
    'resume team thread',
    'create, title, or archive threads',
    'cross-turn member identity',
    'worktree merge',
  ]) {
    assert.match(source, new RegExp(unsupported, 'i'), unsupported);
  }

  assert.doesNotMatch(source, /MultiAgentV2|codex_app|create_thread|send_message/i);
  assert.doesNotMatch(source, /\.omo\/teams|\.asterline\/(?:teams|team-mode)|scripts\//i);
});

test('resume requests receive a truthful refusal and a safe alternative', () => {
  const source = readSkill();
  assert.match(
    source,
    /If the user asks to `resume team thread`, say it is unavailable in Auggie and offer a new one-shot decomposition from the current context\./,
  );
});
