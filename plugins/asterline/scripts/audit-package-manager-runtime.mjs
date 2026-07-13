#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

class AuditInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditInputError';
  }
}

const help = `Usage: node audit-package-manager-runtime.mjs --root <plugin-root> [--config <json>]

Reject npm, npx, pnpm, yarn, bun, and bunx invocations from executable hook,
MCP, package-bin, and skill-script surfaces. Config may provide {"files":[...]}.`;

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

const loadJson = (path, label) => {
  if (!existsSync(path)) throw new AuditInputError(`${label} does not exist: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new AuditInputError(`${label} is invalid JSON: ${path}: ${error.message}`);
    throw error;
  }
};

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const walkFiles = (root, rel, output, violations) => {
  const path = resolve(root, rel);
  if (!inside(resolve(root), path)) {
    violations.push(`${rel}:1: configured executable surface escapes audit root`);
    return;
  }
  if (!existsSync(path)) {
    violations.push(`${rel}:1: configured executable surface is missing`);
    return;
  }
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    if (!inside(realpathSync(root), realpathSync(path))) violations.push(`${rel}:1: executable symlink escapes audit root`);
    return;
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) walkFiles(root, join(rel, name), output, violations);
  } else if (info.isFile()) output.push(rel);
};

const defaults = (root) => {
  const files = [];
  for (const rel of ['hooks/hooks.json', '.mcp.json', 'hooks/bin']) if (existsSync(join(root, rel))) files.push(rel);
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = loadJson(packagePath, 'package manifest');
    for (const target of Object.values(pkg.bin ?? {})) if (typeof target === 'string') files.push(target.replace(/^\.\//, ''));
  }
  const mcpRoot = join(root, 'mcp');
  if (existsSync(mcpRoot)) for (const name of readdirSync(mcpRoot)) if (existsSync(join(mcpRoot, name, 'dist'))) files.push(join('mcp', name, 'dist'));
  const skillsRoot = join(root, 'skills');
  if (existsSync(skillsRoot)) {
    for (const name of readdirSync(skillsRoot)) if (existsSync(join(skillsRoot, name, 'scripts'))) files.push(join('skills', name, 'scripts'));
  }
  return [...new Set(files)];
};

const commandPattern = /(?:^|[^A-Za-z0-9_-])((?:(?:[A-Za-z]:)?[\\/][A-Za-z0-9_. -]+)*[\\/](?:npm|npx|pnpm|yarn|bun|bunx)(?:\.cmd|\.exe)?|(?:npm|npx|pnpm|yarn|bun|bunx)(?:\.cmd|\.exe)?)(?=$|[\s'"`),;\]])/i;

const audit = (root, surfaces) => {
  const files = [];
  const violations = [];
  for (const rel of surfaces) walkFiles(root, rel, files, violations);
  for (const rel of files) {
    const source = readFileSync(join(root, rel), 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(commandPattern);
      if (match) violations.push(`${rel}:${index + 1}: package-manager command is forbidden: ${match[1]}`);
    }
  }
  return violations;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) throw new AuditInputError(`root is not a directory: ${args.root}`);
  const config = args.config ? loadJson(args.config, 'config') : {};
  const files = config.files ?? defaults(args.root);
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== 'string')) throw new AuditInputError('no valid executable surfaces supplied or discovered');
  const violations = audit(args.root, files);
  if (violations.length > 0) {
    console.error('Package-manager runtime audit failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else console.log(`Package-manager runtime audit passed: surfaces=${files.length}`);
};

try {
  main();
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error;
  console.error(`Package-manager runtime audit input error: ${error.message}`);
  process.exitCode = 2;
}
