import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const assertEntrypointLoads = (path) => {
  const result = spawnSync('node', [join(root, path), 'help'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.error, undefined, path);
  assert.equal(result.signal, null, path);
  assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|Cannot find module/, path);
  assert([0, 1, 2].includes(result.status), `${path} exited ${result.status}: ${output}`);
};
const walk = (path) => {
  const output = [];
  for (const name of readdirSync(join(root, path))) {
    const rel = `${path}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) output.push(...walk(rel));
    else output.push(rel);
  }
  return output;
};
const expectedSkills = [
  "clean-ai-code",
  "code-engineer",
  "code-intel",
  "code-intel-setup",
  "comment-guard",
  "debug-trace",
  "deep-research",
  "git-flow",
  "health-check",
  "init-knowledge",
  "reshape-code",
  "review-pass",
  "rule-sync",
  "run-plan",
  "ui-polish",
  "upstream-fix",
  "upstream-report",
  "visual-check",
  "work-loop",
  "work-plan"
];

test('Asterline exposes the agreed public skill set with no aliases', () => {
  const actual = readdirSync(join(root, 'skills')).filter((name) => statSync(join(root, 'skills', name)).isDirectory()).sort();
  assert.deepEqual(actual, expectedSkills);
});

test('Auggie hook manifest uses Asterline wrappers and Auggie tool matchers', () => {
  const hooks = readJson('hooks/hooks.json').hooks;
  assert.equal(hooks.PreToolUse[0].matcher, '^launch-process$');
  assert.equal(hooks.PostToolUse[0].matcher, '^(str-replace-editor|save-file)$');
  const serialized = JSON.stringify(hooks);
  assert.match(serialized, /hooks\/bin\/comment-guard-post-tool-use\.sh/);
  assert.doesNotMatch(serialized, /create_goal|apply_patch|\^Bash\$/);
  assert.doesNotMatch(serialized, /LazyCodex|lazycodex|OMO|omo|Codex|codex/);
});

test('Runtime package and telemetry identity are Asterline branded', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.name, '@asterline/auggie-plugin');
  assert.equal(pkg.version, '4.10.0');
  assert(Object.keys(pkg.bin).every((name) => name.startsWith('asterline-')));
  const identity = readFileSync(join(root, 'components/telemetry/dist/product-identity.js'), 'utf8');
  assert.match(identity, /asterline_daily_active/);
  assert.match(identity, /CACHE_DIR_NAME = "asterline"/);
});

test('MCP and runtime component dist files are present', () => {
  const mcp = readJson('.mcp.json').mcpServers;
  assert.equal(mcp.grep_app.url, 'https://mcp.grep.app');
  assert.equal(mcp.context7.url, 'https://mcp.context7.com/mcp');
  for (const name of ['ast_grep', 'git_bash', 'lsp']) {
    assert.equal(mcp[name].command, 'node');
    assert.match(mcp[name].args[0], /^\$\{AUGMENT_PLUGIN_ROOT\}\/mcp\//);
  }
  for (const path of ['components/rules/dist/cli.js', 'components/comment-checker/dist/cli.js', 'components/lsp/dist/cli.js', 'components/work-loop/dist/cli.js']) {
    assert.equal(statSync(join(root, path)).isFile(), true);
  }
});

test('Runtime package bin and MCP entrypoints load successfully', () => {
  const pkg = readJson('package.json');
  const mcp = readJson('.mcp.json').mcpServers;
  for (const target of Object.values(pkg.bin)) assertEntrypointLoads(target.replace(/^\.\//, ''));
  for (const name of ['ast_grep', 'git_bash', 'lsp']) {
    assertEntrypointLoads(mcp[name].args[0].replace(/^\$\{AUGMENT_PLUGIN_ROOT\}\//, ''));
  }
});

test('Vendored runtime dependencies are present', () => {
  for (const path of [
    'vendor/picomatch/package.json',
    'vendor/posthog-node/package.json',
    'vendor/@posthog/core/package.json',
    'vendor/lsp-daemon/package.json',
    'vendor/lsp-tools-mcp/package.json'
  ]) {
    assert.equal(statSync(join(root, path)).isFile(), true);
  }
});

test('Public shipped surfaces contain no Codex-era identity tokens', () => {
  const pkg = readJson('package.json');
  const mcp = readJson('.mcp.json').mcpServers;
  const files = [
    '.augment-plugin/plugin.json',
    '.mcp.json',
    'hooks/hooks.json',
    'package.json',
    ...walk('hooks/bin'),
    ...walk('skills'),
    ...walk('components/comment-checker/dist'),
    ...walk('components/git-bash/dist'),
    ...walk('components/lsp/dist'),
    ...walk('components/rules/dist'),
    ...walk('components/telemetry/dist'),
    ...walk('components/start-work-continuation/dist'),
    ...walk('components/ultrawork/dist'),
    ...walk('components/work-loop/dist'),
    ...walk('mcp/ast_grep/dist'),
    ...walk('mcp/git_bash/dist'),
    ...walk('mcp/lsp/dist'),
  ];
  for (const component of readdirSync(join(root, 'components'))) {
    for (const name of ['README.md', 'NOTICE', 'package.json', 'directive.md']) {
      const path = `components/${component}/${name}`;
      try {
        statSync(join(root, path));
        files.push(path);
      } catch {}
    }
    for (const name of ['hooks', 'skills']) {
      const path = `components/${component}/${name}`;
      try {
        if (statSync(join(root, path)).isDirectory()) files.push(...walk(path));
      } catch {}
    }
  }
  for (const target of Object.values(pkg.bin)) files.push(target.replace(/^\.\//, ''));
  for (const name of ['ast_grep', 'git_bash', 'lsp']) {
    files.push(mcp[name].args[0].replace(/^\$\{AUGMENT_PLUGIN_ROOT\}\//, ''));
  }

  const forbidden = /\$omo:|\/omo:|\$lcx|lcx-|ulw-loop|ulw-plan|LazyCodex|lazycodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|\bCodex\b|\bcodex\b|CODEX|\.codex|codex-|openai\/codex|create_goal|call_omo_agent|[A-Za-z]Codex|Codex[A-Za-z]/;
  for (const file of [...new Set(files)]) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(text, forbidden, file);
  }
});
