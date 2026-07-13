#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const required = [
  'components/comment-checker/dist/cli.js',
  'components/git-bash/dist/cli.js',
  'components/lsp/dist/cli.js',
  'components/rules/dist/cli.js',
  'components/start-work-continuation/dist/cli.js',
  'components/work-loop/dist/cli.js',
  'mcp/ast_grep/dist/cli.js',
  'mcp/ast_grep/runtime/build-ast-grep.mjs',
  'mcp/ast_grep/runtime/upstream-lock.json',
  'mcp/codegraph/dist/serve.js',
  'mcp/git_bash/dist/cli.js',
  'mcp/lsp/dist/cli.js',
  'hooks/hooks.json',
  '.mcp.json',
  'release/build-sources.lock.json',
  'release/build-sources/picomatch/LICENSE',
  'release/runtime-audit.json',
];
const expectedSkills = [
  'clean-ai-code', 'code-engineer', 'code-intel', 'code-intel-setup', 'comment-guard',
  'debug-trace', 'deep-research', 'deep-work', 'git-flow', 'health-check', 'init-knowledge',
  'reshape-code', 'review-pass', 'rule-sync', 'run-plan', 'session-history', 'structure-search',
  'team-mode', 'ui-polish', 'upstream-fix', 'upstream-report', 'visual-check', 'web-access',
  'work-loop', 'work-plan',
];
const missing = required.filter((path) => !existsSync(join(root, path)));
const skills = readdirSync(join(root, 'skills')).filter((name) => existsSync(join(root, 'skills', name, 'SKILL.md'))).sort();
const walk = (path) => {
  const output = [];
  for (const name of readdirSync(join(root, path))) {
    const rel = `${path}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) output.push(...walk(rel));
    else output.push(rel);
  }
  return output;
};
const assertNodeEntrypointLoads = (path) => {
  const result = spawnSync('node', [join(root, path), 'help'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) return `${path}: failed to start: ${result.error.message}`;
  if (result.signal !== null) return `${path}: terminated by ${result.signal}`;
  if (output.includes('ERR_MODULE_NOT_FOUND') || output.includes('Cannot find module')) {
    return `${path}: module load failed`;
  }
  if (![0, 1, 2].includes(result.status ?? -1)) return `${path}: unexpected help exit ${result.status}`;
  return null;
};
const publicFiles = [
  'hooks/hooks.json',
  '.mcp.json',
  'package.json',
  ...walk('hooks/bin'),
  ...walk('skills'),
  ...walk('components/comment-checker/dist'),
  ...walk('components/git-bash/dist'),
  ...walk('components/lsp/dist'),
  ...walk('components/rules/dist'),
  ...walk('components/start-work-continuation/dist'),
  ...walk('components/work-loop/dist'),
  ...walk('mcp/ast_grep/dist'),
  ...walk('mcp/codegraph/dist'),
  ...walk('mcp/git_bash/dist'),
  ...walk('mcp/lsp/dist'),
];
for (const component of readdirSync(join(root, 'components'))) {
  for (const name of ['README.md', 'NOTICE', 'package.json', 'directive.md']) {
    const path = `components/${component}/${name}`;
    if (existsSync(join(root, path))) publicFiles.push(path);
  }
  for (const name of ['hooks', 'skills']) {
    const path = `components/${component}/${name}`;
    if (existsSync(join(root, path))) publicFiles.push(...walk(path));
  }
}
const forbiddenPublicPattern = /\$omo:|\/omo:|\$lcx|lcx-|ulw-loop|ulw-plan|LazyCodex|lazycodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|\bCodex\b|\bcodex\b|CODEX|\.codex|codex-|openai\/codex|create_goal|call_omo_agent|[A-Za-z]Codex|Codex[A-Za-z]/;
const scanExempt = (path) => path.endsWith('/ATTRIBUTION.md') || path.endsWith('/NOTICE') || path.startsWith('skills/session-history/');
const leaked = [...new Set(publicFiles)].filter((path) => !scanExempt(path) && forbiddenPublicPattern.test(readFileSync(join(root, path), 'utf8')));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (pkg.bin?.['asterline-telemetry'] !== undefined) {
  console.error('Asterline runtime validation failed: telemetry bin must not be published');
  process.exit(1);
}
if (pkg.dependencies?.['posthog-node'] !== undefined) {
  console.error('Asterline runtime validation failed: posthog-node dependency must not be published');
  process.exit(1);
}
const entrypointFailures = [];
for (const target of Object.values(pkg.bin ?? {})) {
  if (typeof target === 'string') {
    const failure = assertNodeEntrypointLoads(target.replace(/^\.\//, ''));
    if (failure !== null) entrypointFailures.push(failure);
  }
}
for (const path of ['mcp/ast_grep/dist/cli.js', 'mcp/git_bash/dist/cli.js', 'mcp/lsp/dist/cli.js']) {
  const failure = assertNodeEntrypointLoads(path);
  if (failure !== null) entrypointFailures.push(failure);
}
{
  const failure = assertNodeEntrypointLoads('mcp/codegraph/dist/serve.js');
  if (failure !== null) entrypointFailures.push(failure);
}
for (const auditor of ['audit-runtime-imports.mjs', 'audit-package-manager-runtime.mjs']) {
  const result = spawnSync('node', [join(root, 'scripts', auditor), '--root', root, '--config', join(root, 'release/runtime-audit.json')], { encoding: 'utf8' });
  if (result.status !== 0) entrypointFailures.push(`${auditor}: ${(result.stderr || result.stdout).trim()}`);
}
const hooks = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf8')).hooks;
const hookText = JSON.stringify(hooks);
const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers;
if (JSON.stringify(Object.keys(hooks).sort()) !== JSON.stringify(['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop'])) {
  console.error('Asterline runtime validation failed: unsupported hook event is registered');
  process.exit(1);
}
if (/matcher|statusMessage|UserPromptSubmit|PostCompact|SubagentStop/.test(hookText)) {
  console.error('Asterline runtime validation failed: unsupported hook property or event is registered');
  process.exit(1);
}
for (const name of ['ast_grep', 'codegraph', 'context7', 'grep_app', 'lsp']) {
  if (mcp[name] === undefined) {
    console.error(`Asterline runtime validation failed: MCP ${name} is missing`);
    process.exit(1);
  }
}
if (missing.length > 0) {
  console.error('Asterline runtime validation failed:');
  for (const path of missing) console.error('- missing ' + path);
  process.exit(1);
}
if (JSON.stringify(skills) !== JSON.stringify(expectedSkills)) {
  console.error('Asterline runtime validation failed: skill inventory mismatch: ' + skills.join(', '));
  process.exit(1);
}
if (leaked.length > 0) {
  console.error('Asterline runtime validation failed: legacy public identity tokens found:');
  for (const path of leaked) console.error('- ' + path);
  process.exit(1);
}
if (entrypointFailures.length > 0) {
  console.error('Asterline runtime validation failed: runtime entrypoints do not load:');
  for (const failure of entrypointFailures) console.error('- ' + failure);
  process.exit(1);
}
console.log('Asterline runtime validation passed');
console.log('skills=' + skills.length + ' required=' + required.length);
