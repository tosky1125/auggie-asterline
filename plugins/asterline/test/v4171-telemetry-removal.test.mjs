import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const auditScript = join(root, 'scripts', 'audit-telemetry-tombstones.mjs');
const auditConfig = join(root, 'config', 'telemetry-audit.json');

const runAudit = (target, config = auditConfig) => spawnSync(process.execPath, [auditScript, '--root', target, '--config', config], {
  encoding: 'utf8',
});

const fixture = (t) => {
  const path = mkdtempSync(join(tmpdir(), 'asterline-telemetry-removal-'));
  t.after(() => rmSync(path, { force: true, recursive: true }));
  return path;
};

const put = (target, path, source) => {
  const file = join(target, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
};

test('Given the shipped plugin, when privacy surfaces are inspected, then telemetry and PostHog runtime artifacts are absent', () => {
  assert.equal(existsSync(join(root, 'components', 'telemetry')), false);
  assert.equal(existsSync(join(root, 'hooks', 'bin', 'telemetry-session-start.sh')), false);
  assert.equal(existsSync(join(root, 'vendor', 'posthog-node')), false);
  assert.equal(existsSync(join(root, 'vendor', '@posthog')), false);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin?.['asterline-telemetry'], undefined);
  assert.equal(pkg.dependencies?.['posthog-node'], undefined);
});

test('Given source and built runtime surfaces, when the telemetry auditor runs, then only CodeGraph opt-out assignments are accepted', (t) => {
  const result = runAudit(root);
  assert.equal(result.status, 0, result.stderr);

  const clean = fixture(t);
  put(clean, 'runtime/source.ts', 'export const env = { CODEGRAPH_TELEMETRY: "0" };\n');
  put(clean, 'runtime/bundle.js', 'const env={CODEGRAPH_TELEMETRY:"0",DO_NOT_TRACK:"1"};\n');
  put(clean, 'audit.json', JSON.stringify({ paths: ['runtime'] }));
  const cleanResult = runAudit(clean, join(clean, 'audit.json'));
  assert.equal(cleanResult.status, 0, cleanResult.stderr);

  for (const [name, source, reason] of [
    ['enabled.js', 'const env={CODEGRAPH_TELEMETRY:"1"};\n', /telemetry code/i],
    ['import.js', 'import { PostHog } from "posthog-node";\n', /posthog import/i],
    ['host.js', 'const endpoint="https:\/\/us.i.posthog.com";\n', /posthog host/i],
    ['key.js', 'const key="phc_fixture_secret";\n', /posthog key/i],
    ['event.js', 'const event="asterline_daily_active";\n', /posthog event/i],
  ]) {
    const dirty = fixture(t);
    put(dirty, `runtime/${name}`, source);
    put(dirty, 'audit.json', JSON.stringify({ paths: ['runtime'] }));
    const dirtyResult = runAudit(dirty, join(dirty, 'audit.json'));
    assert.notEqual(dirtyResult.status, 0, dirtyResult.stdout);
    assert.match(dirtyResult.stderr, reason);
  }
});

test('Given a materialized plugin payload, when audited outside the checkout, then the archive-equivalent surface remains telemetry-free', (t) => {
  const target = fixture(t);
  const config = JSON.parse(readFileSync(auditConfig, 'utf8'));
  for (const path of config.paths) {
    const source = join(root, path);
    assert.equal(existsSync(source), true, `configured shipped path missing: ${path}`);
    cpSync(source, join(target, path), { recursive: true });
  }
  cpSync(auditConfig, join(target, 'telemetry-audit.json'));
  const result = runAudit(target, join(target, 'telemetry-audit.json'));
  assert.equal(result.status, 0, result.stderr);
});
