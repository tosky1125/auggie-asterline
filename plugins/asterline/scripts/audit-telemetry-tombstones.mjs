#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

class AuditInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditInputError';
  }
}

const help = `Usage: node audit-telemetry-tombstones.mjs --root <plugin-root> [--config <json>]

Reject telemetry components, bins, hooks, and PostHog code/config from shipped
runtime payload. Config may provide {"paths":["components","vendor"]}.`;

const parseArgs = (argv) => {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  let root;
  let config;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') root = argv[++index];
    else if (argv[index] === '--config') config = argv[++index];
    else throw new AuditInputError(`unknown argument: ${argv[index]}`);
  }
  if (!root) throw new AuditInputError('--root is required');
  return { root: resolve(root), config: config && resolve(config) };
};

const loadConfig = (path) => {
  if (!existsSync(path)) throw new AuditInputError(`config does not exist: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new AuditInputError(`config is invalid JSON: ${path}: ${error.message}`);
    throw error;
  }
};

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const scannable = (path) => /(?:^|\/)(?:[^/]+\.(?:js|mjs|cjs|json|sh|yaml|yml)|[^/.]+)$/.test(path);

const walk = (root, rel, output, violations) => {
  const path = resolve(root, rel);
  if (!inside(resolve(root), path)) {
    violations.push(`${rel}:1: configured shipped path escapes audit root`);
    return;
  }
  if (!existsSync(path)) {
    violations.push(`${rel}:1: configured shipped path is missing`);
    return;
  }
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    const target = realpathSync(path);
    if (!inside(realpathSync(root), target)) violations.push(`${rel}:1: shipped symlink escapes audit root`);
    return;
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) walk(root, join(rel, name), output, violations);
  } else if (info.isFile() && scannable(rel)) output.push(rel);
};

const defaults = (root) => {
  const paths = ['package.json', '.mcp.json', 'hooks/hooks.json', 'hooks/bin', 'vendor'];
  if (existsSync(join(root, 'components'))) {
    for (const name of readdirSync(join(root, 'components'))) {
      for (const child of ['dist', 'package.json']) if (existsSync(join(root, 'components', name, child))) paths.push(join('components', name, child));
    }
  }
  if (existsSync(join(root, 'mcp'))) {
    for (const name of readdirSync(join(root, 'mcp'))) if (existsSync(join(root, 'mcp', name, 'dist'))) paths.push(join('mcp', name, 'dist'));
  }
  return paths.filter((path) => existsSync(join(root, path)));
};

const exactDisable = /^\s*(?:(?:export\s+)?const\s+)?CODEGRAPH_TELEMETRY\s*=\s*['"]?0['"]?\s*;?\s*$/;
const checks = [
  ['PostHog import', /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"](?:posthog-node|@posthog\/[^'"]+)['"]/i],
  ['PostHog host', /https?:\/\/[^\s'"`]*posthog(?:\.com|\.net)\b/i],
  ['PostHog key', /\bphc_[A-Za-z0-9_-]+\b/],
  ['PostHog event', /\b(?:asterline|codegraph)_(?:daily_active|session|command|tool|event)[A-Za-z0-9_-]*\b/i],
  ['telemetry code', /\b(?:posthog|telemetry|analytics)(?:[-_.A-Z][A-Za-z0-9_.-]*)?\b/i],
];

const audit = (root, paths) => {
  const files = [];
  const violations = [];
  for (const rel of paths) walk(root, rel, files, violations);
  for (const rel of paths) {
    if (/(?:^|[/_.-])telemetry(?:$|[/_.-])/i.test(rel)) violations.push(`${rel}:1: telemetry path is shipped`);
  }
  for (const rel of files) {
    if (/(?:^|[/_.-])telemetry(?:$|[/_.-])/i.test(rel) && !violations.some((item) => item.startsWith(`${rel}:`))) {
      violations.push(`${rel}:1: telemetry path is shipped`);
    }
    const source = readFileSync(join(root, rel), 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (exactDisable.test(line)) continue;
      const match = checks.find(([, pattern]) => pattern.test(line));
      if (match) violations.push(`${rel}:${index + 1}: ${match[0]} is forbidden`);
    }
  }
  return [...new Set(violations)];
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) throw new AuditInputError(`root is not a directory: ${args.root}`);
  const config = args.config ? loadConfig(args.config) : {};
  const paths = config.paths ?? defaults(args.root);
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((path) => typeof path !== 'string')) throw new AuditInputError('no valid shipped paths supplied or discovered');
  const violations = audit(args.root, paths);
  if (violations.length > 0) {
    console.error('Telemetry tombstone audit failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else console.log(`Telemetry tombstone audit passed: paths=${paths.length}`);
};

try {
  main();
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error;
  console.error(`Telemetry tombstone audit input error: ${error.message}`);
  process.exitCode = 2;
}
