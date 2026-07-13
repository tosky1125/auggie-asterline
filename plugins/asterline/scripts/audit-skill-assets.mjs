#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

class AuditInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditInputError';
  }
}

const help = `Usage: node audit-skill-assets.mjs --root <plugin-root> [--config <json>]

Validate skill directory/frontmatter names, local Markdown references, symlink
containment, and optional exact {"inventory":[...],"counts":{skills,files,markdown}}.
Config may also set "skillsDir" (default: "skills").`;

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

const walk = (rootReal, path, files, violations) => {
  const rel = relative(rootReal, path);
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    const target = realpathSync(path);
    if (!inside(rootReal, target)) violations.push(`${rel}:1: symlink escapes skill root: ${target}`);
    files.push(path);
    return;
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) walk(rootReal, join(path, name), files, violations);
  } else if (info.isFile()) files.push(path);
};

const frontmatterName = (source) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;
  const line = match[1].split(/\r?\n/).find((item) => /^name\s*:/.test(item));
  return line?.replace(/^name\s*:\s*/, '').trim().replace(/^['"]|['"]$/g, '');
};

const linkTargets = (source) => {
  const targets = [];
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  const withoutFences = source.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1/g, blank);
  const prose = withoutFences.replace(/`[^`\n]+`/g, blank);
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^'"]*['"])?\s*\)/g)) {
    targets.push({ value: match[1] ?? match[2], index: match.index, asset: false });
  }
  for (const match of prose.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm)) {
    targets.push({ value: match[1] ?? match[2], index: match.index, asset: false });
  }
  for (const match of withoutFences.matchAll(/(?:^|[\s'"`(])((?:\.\/)?(?:scripts|references|assets|agents)\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])/gm)) {
    targets.push({ value: match[1], index: match.index + match[0].indexOf(match[1]), asset: true });
  }
  return targets;
};

const validateReference = (skillsRoot, file, source, target, index, asset, violations) => {
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) return;
  const line = source.slice(0, index).split('\n').length;
  const skillName = relative(skillsRoot, file).split(/[\\/]/, 1)[0];
  const skillRoot = join(skillsRoot, skillName);
  if (isAbsolute(target)) {
    violations.push(`${relative(skillsRoot, file)}:${line}: local Markdown link must be relative: ${target}`);
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    violations.push(`${relative(skillsRoot, file)}:${line}: invalid encoded relative link: ${target}`);
    return;
  }
  if (decoded === '') return;
  const destination = asset ? resolve(skillRoot, decoded.replace(/^\.\//, '')) : resolve(dirname(file), decoded);
  if (!inside(skillRoot, destination)) {
    violations.push(`${relative(skillsRoot, file)}:${line}: relative link escapes skill root: ${target}`);
  } else if (!existsSync(destination)) {
    violations.push(`${relative(skillsRoot, file)}:${line}: missing relative link: ${target}`);
  } else if (!inside(skillRoot, realpathSync(destination))) {
    violations.push(`${relative(skillsRoot, destination)}:${line}: symlink escapes skill root: ${target}`);
  }
};

const audit = (root, config) => {
  const skillsPath = resolve(root, config.skillsDir ?? 'skills');
  if (!existsSync(skillsPath) || !statSync(skillsPath).isDirectory()) throw new AuditInputError(`skills directory is missing: ${skillsPath}`);
  const skillsRoot = realpathSync(skillsPath);
  if (!inside(realpathSync(root), skillsRoot)) throw new AuditInputError(`skills directory escapes root: ${skillsPath}`);
  const names = readdirSync(skillsRoot).filter((name) => lstatSync(join(skillsRoot, name)).isDirectory()).sort();
  const files = [];
  const violations = [];
  for (const name of names) walk(skillsRoot, join(skillsRoot, name), files, violations);
  for (const name of names) {
    const skillFile = join(skillsRoot, name, 'SKILL.md');
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) {
      violations.push(`${name}/SKILL.md:1: required skill contract is missing`);
      continue;
    }
    const source = readFileSync(skillFile, 'utf8');
    const declared = frontmatterName(source);
    if (declared !== name) violations.push(`${name}/SKILL.md:1: frontmatter name must equal directory ${name}; found ${declared ?? 'none'}`);
  }
  for (const file of files.filter((path) => /\.md$/i.test(path))) {
    const source = readFileSync(file, 'utf8');
    for (const target of linkTargets(source)) validateReference(skillsRoot, file, source, target.value, target.index, target.asset, violations);
  }
  if (config.inventory !== undefined) {
    if (!Array.isArray(config.inventory) || config.inventory.some((name) => typeof name !== 'string')) throw new AuditInputError('inventory must be an array of skill names');
    const expected = [...config.inventory].sort();
    if (JSON.stringify(expected) !== JSON.stringify(names)) violations.push(`skills:1: inventory mismatch; expected ${expected.join(',')}; found ${names.join(',')}`);
  }
  const actualCounts = { skills: names.length, files: files.length, markdown: files.filter((path) => /\.md$/i.test(path)).length };
  if (config.counts !== undefined) {
    for (const key of ['skills', 'files', 'markdown']) {
      if (!Number.isInteger(config.counts[key])) throw new AuditInputError(`counts.${key} must be an integer`);
      if (config.counts[key] !== actualCounts[key]) violations.push(`skills:1: corpus count ${key} expected ${config.counts[key]}, found ${actualCounts[key]}`);
    }
  }
  return { violations: [...new Set(violations)], counts: actualCounts };
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) throw new AuditInputError(`root is not a directory: ${args.root}`);
  const config = args.config ? loadConfig(args.config) : {};
  const result = audit(args.root, config);
  if (result.violations.length > 0) {
    console.error('Skill asset audit failed:');
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else console.log(`Skill asset audit passed: skills=${result.counts.skills} files=${result.counts.files} markdown=${result.counts.markdown}`);
};

try {
  main();
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error;
  console.error(`Skill asset audit input error: ${error.message}`);
  process.exitCode = 2;
}
