import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url);
const repositoryRoot = new URL('../../..', import.meta.url);
const readJson = (root, path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const readText = (root, path) => readFileSync(new URL(path, root), 'utf8');

test('Given the published Asterline surfaces, when inspected, then they pin release 4.19.4', () => {
  // Given
  const marketplace = readJson(repositoryRoot, '.augment-plugin/marketplace.json');
  const plugin = readJson(pluginRoot, '.augment-plugin/plugin.json');
  const pkg = readJson(pluginRoot, 'package.json');
  const readme = readText(repositoryRoot, 'README.md');

  // When
  const publishedVersions = [
    marketplace.version,
    marketplace.plugins?.[0]?.version,
    plugin.version,
    pkg.version,
  ];

  // Then
  assert.deepEqual(publishedVersions, ['4.19.4', '4.19.4', '4.19.4', '4.19.4']);
  assert.match(readme, /upstream 4\.19\.4\b/);
  assert.doesNotMatch(readme, /4\.10\.0/);
});

test('Given the upstream provenance, when inspected, then it pins the 4.19.4 source commit', () => {
  // Given
  const provenance = readText(pluginRoot, 'UPSTREAM-PROVENANCE.md');

  // When
  const expectedCommit = 'fb48ddc4bc8be02a0cfe0a509a30cf3543edf72a';
  const expectedCanonicalCommit = 'b072d279110bdda2c6ac2525d0d24dc54d16148a';

  // Then
  assert.match(provenance, /source repository at version 4\.19\.4\b/);
  assert.match(provenance, new RegExp(`Generated distribution:[\\s\\S]*${expectedCommit}\\b`));
  assert.match(provenance, new RegExp(`Canonical source:[\\s\\S]*${expectedCanonicalCommit}\\b`));
  assert.match(provenance, /ast_grep[\s\S]*v4\.10\.0[\s\S]*245fd8f45e37fe9b412ae57c1fb7cfbd672328b7/);
});

test('Given the packaged plugin metadata, when inspected, then telemetry is not advertised or executable', () => {
  // Given
  const plugin = readJson(pluginRoot, '.augment-plugin/plugin.json');
  const pkg = readJson(pluginRoot, 'package.json');

  // When
  const marketingCopy = JSON.stringify(plugin.interface);

  // Then
  assert.equal(pkg.bin['asterline-telemetry'], undefined);
  assert.equal(pkg.dependencies?.['posthog-node'], undefined);
  assert.doesNotMatch(marketingCopy, /telemetry/i);
});
