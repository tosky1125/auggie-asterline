#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleComponent, replaceDirectory } from './bundle-component.mjs';

const HELP = `Usage:
  node build-release.mjs --source <materialized-root> --output <release-dir> --config <file>

Builds declared components into a sibling staging tree and replaces the release only after
every self-contained Node.js bundle passes its runtime import audit. No network or package
manager operation is performed.
`;

class ReleaseError extends Error {}
class InputError extends ReleaseError {}
class BuildError extends ReleaseError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InputError(`${label} contains unsupported key ${JSON.stringify(key)}`);
  }
};
const stringValue = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new InputError(`${label} must be a non-empty string`);
  return value;
};
const relativePath = (value, label) => {
  const path = stringValue(value, label);
  const unsafe = path.split('/').some((part) => part === '' || part === '.' || part === '..');
  if (path.includes('\0') || path.includes('\\') || posix.isAbsolute(path) || posix.normalize(path) !== path || unsafe) {
    throw new InputError(`${label} must be a normalized relative POSIX path`);
  }
  return path;
};
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const parseArgs = (args) => {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--source', '--output', '--config'].includes(option) || value === undefined || values.has(option)) {
      throw new InputError(`unknown, duplicate, or incomplete option ${JSON.stringify(option)}`);
    }
    values.set(option, value);
  }
  return {
    help: false,
    source: stringValue(values.get('--source'), '--source'),
    output: stringValue(values.get('--output'), '--output'),
    config: stringValue(values.get('--config'), '--config'),
  };
};

const parseConfig = (value) => {
  if (!isRecord(value)) throw new InputError('config must be a JSON object');
  assertKeys(value, new Set(['schemaVersion', 'toolchain', 'components']), 'config');
  if (value.schemaVersion !== 1) throw new InputError('config.schemaVersion must equal 1');
  if (!isRecord(value.toolchain)) throw new InputError('config.toolchain must be an object');
  if (!Array.isArray(value.components) || value.components.length === 0) throw new InputError('config.components must be non-empty');
  const names = new Set();
  const outputs = [];
  const components = value.components.map((component, index) => {
    const label = `config.components[${index}]`;
    if (!isRecord(component)) throw new InputError(`${label} must be an object`);
    assertKeys(component, new Set(['name', 'source', 'output', 'entries', 'aliases']), label);
    const name = stringValue(component.name, `${label}.name`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || names.has(name)) throw new InputError(`${label}.name is invalid or duplicated`);
    names.add(name);
    const output = relativePath(component.output, `${label}.output`);
    outputs.push(output);
    return {
      name,
      source: relativePath(component.source, `${label}.source`),
      output,
      config: { schemaVersion: 1, toolchain: value.toolchain, entries: component.entries, aliases: component.aliases ?? [] },
    };
  });
  const ordered = [...outputs].sort();
  for (let index = 1; index < ordered.length; index += 1) {
    const left = ordered[index - 1];
    const right = ordered[index];
    if (left === right || right.startsWith(`${left}/`)) throw new InputError(`component outputs overlap: ${left} and ${right}`);
  }
  return components;
};

const loadConfig = async (path) => {
  let value;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError(`config is invalid JSON: ${error.message}`);
    throw error;
  }
  return parseConfig(value);
};

const buildRelease = async ({ source, output, components }) => {
  const sourceRoot = await realpath(source).catch(() => { throw new InputError(`materialized source root is missing: ${source}`); });
  if (!(await stat(sourceRoot)).isDirectory()) throw new InputError(`materialized source root is not a directory: ${source}`);
  const destination = resolve(output);
  const staging = join(dirname(destination), `.${basename(destination)}.tmp-${process.pid}-${randomUUID()}`);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    for (const component of components) {
      const componentSource = resolve(sourceRoot, ...component.source.split('/'));
      if (!inside(sourceRoot, componentSource)) throw new InputError(`component source escapes materialized root: ${component.name}`);
      await bundleComponent({
        source: componentSource,
        output: join(staging, ...component.output.split('/')),
        config: component.config,
      });
    }
    await replaceDirectory(staging, destination);
    return { components: components.length, output: destination };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof ReleaseError) throw error;
    throw new BuildError(error instanceof Error ? error.message : String(error));
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  const result = await buildRelease({ source: args.source, output: args.output, components: await loadConfig(args.config) });
  process.stdout.write(`Built release: components=${result.components} output=${result.output}\n`);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (!(error instanceof ReleaseError)) throw error;
    process.stderr.write(`Release build error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
