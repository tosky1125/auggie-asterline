import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const skillRoot = join(pluginRoot, 'skills', 'web-access');
const upstreamFiles = [
  'ATTRIBUTION.md',
  'SKILL.md',
  'agents/openai.yaml',
  'engine/__init__.py',
  'engine/__main__.py',
  'engine/bias_check.py',
  'engine/curl_probe.py',
  'engine/executor.py',
  'engine/fetch_chain.py',
  'engine/referers.py',
  'engine/result_schema.py',
  'engine/summary.py',
  'engine/templates/package.json',
  'engine/templates/playwright_mobile_chrome.js',
  'engine/templates/playwright_real_chrome.js',
  'engine/tests/test_fetch_chain.py',
  'engine/tests/test_playwright_templates.py',
  'engine/url_transforms.py',
  'engine/validators.py',
  'engine/waf_detector.py',
  'engine/waf_profiles.yaml',
  'references/agent-reach/README.md',
  'references/agent-reach/career.md',
  'references/agent-reach/dev.md',
  'references/agent-reach/search.md',
  'references/agent-reach/social.md',
  'references/agent-reach/video.md',
  'references/agent-reach/web.md',
  'references/chrome-stealth.md',
  'references/insane-search/README.md',
  'references/insane-search/cache-archive.md',
  'references/insane-search/fallback.md',
  'references/insane-search/jina.md',
  'references/insane-search/json-api.md',
  'references/insane-search/media.md',
  'references/insane-search/metadata.md',
  'references/insane-search/naver.md',
  'references/insane-search/playwright.md',
  'references/insane-search/public-api.md',
  'references/insane-search/rss.md',
  'references/insane-search/tls-impersonate.md',
  'references/insane-search/twitter.md',
  'scripts/cookie_crypto.py',
  'scripts/cookie_domains.py',
  'scripts/cookie_paths.py',
  'scripts/extract_cookies.py',
];

const filesBelow = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
};

const pureLines = (source, path) => source.split('\n').filter((line) => {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return path.endsWith('.py') ? !trimmed.startsWith('#') : !trimmed.startsWith('//');
}).length;

test('Given the generated v4.17.1 web skill, when materialized, then its exact 46-file path set is preserved', () => {
  assert.equal(existsSync(skillRoot), true);
  assert.deepEqual(filesBelow(skillRoot), upstreamFiles.sort());
  const lock = JSON.parse(readFileSync(join(pluginRoot, 'release', 'upstream-lock.json'), 'utf8'));
  const generated = lock.sources.find((source) => source.id === 'lazycodex-generated');
  assert.equal(generated.commit, '3d7416bff3e6c80ebf5542b4dd12f5c76298d46d');
  assert.equal(generated.paths[0].oid, '7da0054dfc49e2be00060086d4cabee06253a85f');
});

test('Given the Asterline adaptation, when public routing metadata is read, then web-access naming and Auggie limits are truthful', () => {
  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  const metadata = readFileSync(join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
  assert.match(skill, /^---\nname: web-access\n/);
  assert.match(skill, /^# Web Access$/m);
  assert.match(metadata, /\$web-access/);
  assert.match(skill, /Auggie/);
  assert.doesNotMatch(skill + metadata, /\$ultimate-browsing|\(OmO\)|mcp__playwright__|Claude session/);
});

test('Given executable skill assets, when package-manager commands are audited, then none install or invoke dependencies at runtime', () => {
  const executable = filesBelow(skillRoot).filter((path) => /^(?:engine|scripts)\/.*\.(?:py|js)$/.test(path));
  const packageManager = /(?:^|[^A-Za-z0-9_-])(?:npm|npx|pnpm|yarn|bun|bunx)(?:\.cmd|\.exe)?(?=$|[\s'"`),;\]])/im;
  for (const path of executable) {
    const source = readFileSync(join(skillRoot, path), 'utf8');
    assert.doesNotMatch(source, packageManager, path);
  }
});

test('Given imported executable modules, when source size is audited, then every module stays within 250 pure lines', () => {
  for (const path of filesBelow(skillRoot).filter((item) => /\.(?:py|js)$/.test(item))) {
    const source = readFileSync(join(skillRoot, path), 'utf8');
    assert.doesNotMatch(source, /SIZE_OK/);
    assert.ok(pureLines(source, path) <= 250, `${path}: ${pureLines(source, path)} pure lines`);
  }
});

test('Given no optional Python dependencies, when the engine CLI starts, then it reports results without installing packages', () => {
  const result = spawnSync('python3', ['-m', 'engine', 'not-a-url', '--json'], {
    cwd: skillRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 10_000,
  });
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.trace[0].error, 'curl_cffi not installed');
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /installing|pip install|npm install/i);
});

test('Given the shipped skill corpus, when local Markdown links are resolved, then none are missing or escape', () => {
  for (const path of filesBelow(skillRoot).filter((item) => item.endsWith('.md'))) {
    const absolute = join(skillRoot, path);
    const source = readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#', 1)[0];
      if (target === '' || /^[a-z]+:/i.test(target)) continue;
      const destination = resolve(dirname(absolute), decodeURIComponent(target));
      assert.ok(destination.startsWith(`${skillRoot}/`), `${path}: escaping link ${target}`);
      assert.ok(existsSync(destination), `${path}: missing link ${target}`);
    }
  }
});
