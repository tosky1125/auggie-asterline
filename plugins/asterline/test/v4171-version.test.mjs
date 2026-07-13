import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pluginRoot = new URL('..', import.meta.url);
const repositoryRoot = new URL('../../..', import.meta.url);
const readJson = (root, path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const readText = (root, path) => readFileSync(new URL(path, root), 'utf8');

test('Given the published Asterline surfaces, when inspected, then they pin release 4.17.1', () => {
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
  assert.deepEqual(publishedVersions, ['4.17.1', '4.17.1', '4.17.1', '4.17.1']);
  assert.match(readme, /upstream 4\.17\.1\b/);
  assert.doesNotMatch(readme, /4\.10\.0/);
});

test('Given the upstream provenance, when inspected, then it pins the 4.17.1 source commit', () => {
  // Given
  const provenance = readText(pluginRoot, 'UPSTREAM-PROVENANCE.md');

  // When
  const expectedCommit = '3d7416bff3e6c80ebf5542b4dd12f5c76298d46d';

  // Then
  assert.match(provenance, /bundle at version 4\.17\.1\b/);
  assert.match(provenance, new RegExp(`Pinned commit: ${expectedCommit}\\b`));
  assert.doesNotMatch(provenance, /4\.10\.0|245fd8f45e37fe9b412ae57c1fb7cfbd672328b7/);
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
