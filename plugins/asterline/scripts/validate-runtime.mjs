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
  'components/telemetry/dist/cli.js',
  'components/start-work-continuation/dist/cli.js',
  'components/ultrawork/dist/cli.js',
  'components/work-loop/dist/cli.js',
  'mcp/ast_grep/dist/cli.js',
  'mcp/git_bash/dist/cli.js',
  'mcp/lsp/dist/cli.js',
  'hooks/hooks.json',
  '.mcp.json',
  'vendor/picomatch/package.json',
  'vendor/posthog-node/package.json',
  'vendor/lsp-daemon/package.json',
  'vendor/lsp-tools-mcp/package.json',
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
    if (existsSync(join(root, path))) publicFiles.push(path);
  }
  for (const name of ['hooks', 'skills']) {
    const path = `components/${component}/${name}`;
    if (existsSync(join(root, path))) publicFiles.push(...walk(path));
  }
}
const forbiddenPublicPattern = /\$omo:|\/omo:|\$lcx|lcx-|ulw-loop|ulw-plan|LazyCodex|lazycodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|\bCodex\b|\bcodex\b|CODEX|\.codex|codex-|openai\/codex|create_goal|call_omo_agent|[A-Za-z]Codex|Codex[A-Za-z]/;
const leaked = [...new Set(publicFiles)].filter((path) => forbiddenPublicPattern.test(readFileSync(join(root, path), 'utf8')));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
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
if (missing.length > 0) {
  console.error('Asterline runtime validation failed:');
  for (const path of missing) console.error('- missing ' + path);
  process.exit(1);
}
if (skills.length !== 20) {
  console.error('Asterline runtime validation failed: expected 20 skills, found ' + skills.length);
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
