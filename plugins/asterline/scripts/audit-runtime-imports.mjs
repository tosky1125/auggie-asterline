#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

class AuditInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditInputError';
  }
}

const help = `Usage: node audit-runtime-imports.mjs --root <plugin-root> [--config <json>]

Audit every JavaScript module reachable from shipped entries. Config may provide
{"entries":["path/to/entry.mjs"]}; otherwise package bins, hooks, and MCP entries
are discovered. Only node: and relative import specifiers are permitted.`;

const parseArgs = (argv) => {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  let root;
  let config;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--root') root = argv[++index];
    else if (flag === '--config') config = argv[++index];
    else throw new AuditInputError(`unknown argument: ${flag}`);
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

const extractJsPaths = (text) => {
  const paths = [];
  for (const match of text.matchAll(/[A-Za-z0-9_./$"-]+\.(?:mjs|cjs|js)\b/g)) {
    let value = match[0].replaceAll('"', '');
    const marker = '/plugins/asterline/';
    if (value.includes(marker)) value = value.slice(value.indexOf(marker) + marker.length);
    if (!value.includes('$') && !isAbsolute(value)) paths.push(value.replace(/^\.\//, ''));
  }
  return paths;
};

const defaultEntries = (root) => {
  const entries = [];
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = loadJson(packagePath, 'package manifest');
    for (const target of Object.values(pkg.bin ?? {})) if (typeof target === 'string') entries.push(target.replace(/^\.\//, ''));
  }
  for (const manifest of ['.mcp.json', 'hooks/hooks.json']) {
    const path = join(root, manifest);
    if (existsSync(path)) entries.push(...extractJsPaths(readFileSync(path, 'utf8')));
  }
  const hookBin = join(root, 'hooks/bin');
  if (existsSync(hookBin)) {
    for (const name of readdirSync(hookBin)) {
      const path = join(hookBin, name);
      if (statSync(path).isFile()) entries.push(...extractJsPaths(readFileSync(path, 'utf8')));
    }
  }
  return [...new Set(entries)];
};

const codeMask = (source) => {
  const output = [...source];
  let quote;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      else output[index] = ' ';
    } else if (blockComment) {
      if (char === '*' && next === '/') {
        output[index] = ' ';
        output[++index] = ' ';
        blockComment = false;
      } else if (char !== '\n') output[index] = ' ';
    } else if (quote) {
      if (char === '\\') {
        output[index] = ' ';
        if (source[index + 1] !== '\n') output[++index] = ' ';
      } else {
        if (char === quote) quote = undefined;
        if (char !== '\n') output[index] = ' ';
      }
    } else if (char === '/' && next === '/') {
      output[index] = ' ';
      output[++index] = ' ';
      lineComment = true;
    } else if (char === '/' && next === '*') {
      output[index] = ' ';
      output[++index] = ' ';
      blockComment = true;
    } else if (char === "'" || char === '"' || char === '`') {
      output[index] = ' ';
      quote = char;
    }
  }
  return output.join('');
};

const specifiers = (source) => {
  const found = [];
  for (const token of codeMask(source).matchAll(/(?<![\w$.])(?:import|export|require)\b/g)) {
    const tail = source.slice(token.index);
    const patterns = token[0] === 'import'
      ? [/^import\s+(?!\()(?:(?:[^'";]*?)\s+from\s+)?(['"])([^'"\n]+)\1/, /^import\s*\(\s*(['"])([^'"\n]+)\1/]
      : token[0] === 'export'
        ? [/^export\s+(?:[^'";]*?\s+from\s+)(['"])([^'"\n]+)\1/]
        : [/^require\s*\(\s*(['"])([^'"\n]+)\1\s*\)/];
    const match = patterns.map((pattern) => tail.match(pattern)).find(Boolean);
    const kind = token[0] === 'require' ? 'require' : 'import';
    if (match) found.push({ kind, value: match[2], index: token.index });
    else if (/^(?:import|require)\s*\(/.test(tail)) found.push({ kind, value: undefined, index: token.index });
  }
  return found.sort((left, right) => left.index - right.index);
};

const resolveImport = (base, value) => {
  const clean = value.split(/[?#]/, 1)[0];
  const candidate = resolve(dirname(base), clean);
  const attempts = extname(candidate) ? [candidate] : [candidate, `${candidate}.js`, `${candidate}.mjs`, `${candidate}.cjs`, join(candidate, 'index.js')];
  return attempts.find((path) => existsSync(path) && statSync(path).isFile());
};

const audit = (root, entries) => {
  const rootReal = realpathSync(root);
  const pending = [...entries];
  const visited = new Set();
  const violations = [];
  while (pending.length > 0) {
    const rel = pending.shift();
    const target = resolve(root, rel);
    if (!inside(root, target) || !existsSync(target) || !statSync(target).isFile()) {
      violations.push(`${rel}:1: unreachable or missing shipped entry`);
      continue;
    }
    const file = realpathSync(target);
    if (!inside(rootReal, file)) {
      violations.push(`${rel}:1: shipped entry escapes audit root`);
      continue;
    }
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    for (const item of specifiers(source)) {
      const line = source.slice(0, item.index).split('\n').length;
      if (item.value === undefined) {
        violations.push(`${relative(root, file)}:${line}: ${item.kind} specifier must be a string literal`);
        continue;
      }
      if (item.value.startsWith('node:')) continue;
      if (!item.value.startsWith('./') && !item.value.startsWith('../')) {
        violations.push(`${relative(root, file)}:${line}: bare ${item.kind} is forbidden: ${item.value}`);
        continue;
      }
      const imported = resolveImport(file, item.value);
      if (!imported) {
        violations.push(`${relative(root, file)}:${line}: relative ${item.kind} is missing: ${item.value}`);
        continue;
      }
      const importedReal = realpathSync(imported);
      if (!inside(rootReal, importedReal)) violations.push(`${relative(root, file)}:${line}: relative ${item.kind} escapes audit root: ${item.value}`);
      else if (/\.(?:mjs|cjs|js)$/.test(importedReal)) pending.push(relative(root, importedReal));
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
  const entries = config.entries ?? defaultEntries(args.root);
  if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => typeof entry !== 'string')) {
    throw new AuditInputError('no valid shipped JavaScript entries were supplied or discovered');
  }
  const violations = audit(args.root, entries);
  if (violations.length > 0) {
    console.error('Runtime import audit failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else console.log(`Runtime import audit passed: entries=${entries.length}`);
};

try {
  main();
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error;
  console.error(`Runtime import audit input error: ${error.message}`);
  process.exitCode = 2;
}
