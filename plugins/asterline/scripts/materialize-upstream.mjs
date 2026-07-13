#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, posix, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';

const HELP = `Usage:
  node materialize-upstream.mjs --lock <file> --destination <dir> \\
    --repository <source-id>=<git-repository> [--repository ...]

Verifies every repository HEAD, release tag, gitlink, and locked Git object before
materializing immutable Git blobs through a sibling staging directory and atomic rename.
The destination is required; this command has no shipped-plugin default and performs no
network or package-manager operation.
`;

class MaterializationError extends Error {}
class InputError extends MaterializationError {}
class VerificationError extends MaterializationError {}
class DestinationError extends MaterializationError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InputError(`${label} contains unsupported key ${JSON.stringify(key)}`);
  }
};
const requireString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new InputError(`${label} must be a non-empty string`);
  return value;
};
const requireOid = (value, label) => {
  const oid = requireString(value, label);
  if (!/^[0-9a-f]{40}$/.test(oid)) throw new InputError(`${label} must be a lowercase 40-character Git OID`);
  return oid;
};
const requireRelativePath = (value, label) => {
  const path = requireString(value, label);
  const unsafeSegment = path.split('/').some((part) => part === '' || part === '.' || part === '..');
  if (path.includes('\0') || path.includes('\\') || posix.isAbsolute(path) || posix.normalize(path) !== path || unsafeSegment) {
    throw new InputError(`${label} must be a normalized relative POSIX path without unsafe segments`);
  }
  return path;
};
const ensureEqual = (actual, expected, message) => {
  if (actual !== expected) throw new VerificationError(message);
};

const parseLock = (text) => {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new InputError(`lock is not valid JSON: ${error.message}`);
  }
  if (!isRecord(value)) throw new InputError('lock must be a JSON object');
  assertKeys(value, new Set(['schemaVersion', 'release', 'sources']), 'lock');
  if (value.schemaVersion !== 1) throw new InputError('lock.schemaVersion must equal 1');
  const release = requireString(value.release, 'lock.release');
  if (!Array.isArray(value.sources) || value.sources.length === 0) throw new InputError('lock.sources must be non-empty');
  const ids = new Set();
  const destinations = [];
  const sources = value.sources.map((source, sourceIndex) => {
    const label = `lock.sources[${sourceIndex}]`;
    if (!isRecord(source)) throw new InputError(`${label} must be an object`);
    assertKeys(source, new Set(['id', 'tag', 'commit', 'gitlinks', 'paths']), label);
    const id = requireString(source.id, `${label}.id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id)) throw new InputError(`${label}.id is invalid or duplicated`);
    ids.add(id);
    const tag = requireString(source.tag, `${label}.tag`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(tag) || tag.includes('..')) throw new InputError(`${label}.tag is invalid`);
    const commit = requireOid(source.commit, `${label}.commit`);
    const gitlinks = source.gitlinks ?? {};
    if (!isRecord(gitlinks)) throw new InputError(`${label}.gitlinks must be an object`);
    const parsedGitlinks = Object.entries(gitlinks).map(([path, oid]) => ({
      path: requireRelativePath(path, `${label}.gitlinks path`),
      oid: requireOid(oid, `${label}.gitlinks[${JSON.stringify(path)}]`),
    }));
    if (!Array.isArray(source.paths)) throw new InputError(`${label}.paths must be an array`);
    const paths = source.paths.map((entry, pathIndex) => {
      const pathLabel = `${label}.paths[${pathIndex}]`;
      if (!isRecord(entry)) throw new InputError(`${pathLabel} must be an object`);
      assertKeys(entry, new Set(['source', 'destination', 'type', 'oid']), pathLabel);
      const sourcePath = requireRelativePath(entry.source, `${pathLabel}.source`);
      const destination = requireRelativePath(entry.destination, `${pathLabel}.destination`);
      if (entry.type !== 'tree') throw new InputError(`${pathLabel}.type must equal "tree"`);
      destinations.push(destination);
      return { source: sourcePath, destination, type: 'tree', oid: requireOid(entry.oid, `${pathLabel}.oid`) };
    });
    if (paths.length === 0 && parsedGitlinks.length === 0) throw new InputError(`${label} must lock at least one path or gitlink`);
    return { id, tag, commit, gitlinks: parsedGitlinks, paths };
  });
  const sortedDestinations = [...destinations].sort();
  for (let index = 1; index < sortedDestinations.length; index += 1) {
    const [left, right] = sortedDestinations.slice(index - 1, index + 1);
    if (left === right || right.startsWith(`${left}/`)) throw new InputError(`locked destinations overlap: ${left} and ${right}`);
  }
  return { release, sources };
};

const parseArguments = (args) => {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  let lock;
  let destination;
  const repositories = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--lock', '--destination', '--repository'].includes(option) || value === undefined) {
      throw new InputError(`unknown or incomplete option ${JSON.stringify(option)}`);
    }
    index += 1;
    if (option === '--lock') lock = lock === undefined ? value : (() => { throw new InputError('--lock may be provided once'); })();
    if (option === '--destination') destination = destination === undefined ? value : (() => { throw new InputError('--destination may be provided once'); })();
    if (option === '--repository') {
      const separator = value.indexOf('=');
      if (separator < 1 || separator === value.length - 1) throw new InputError('--repository must use <source-id>=<path>');
      const id = value.slice(0, separator);
      if (repositories.has(id)) throw new InputError(`repository ${id} was provided more than once`);
      repositories.set(id, value.slice(separator + 1));
    }
  }
  return {
    help: false,
    lock: requireString(lock, '--lock'),
    destination: requireString(destination, '--destination'),
    repositories,
  };
};

const git = (repository, args, { input, encoding = 'utf8', extraEnv = {} } = {}) => {
  const result = spawnSync('git', ['-C', repository, ...args], {
    encoding,
    input,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  });
  if (result.error) throw new VerificationError(`git ${args[0]} failed for ${repository}: ${result.error.message}`);
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
  if (result.status !== 0) throw new VerificationError(`git ${args[0]} failed for ${repository}: ${stderr.trim()}`);
  return result.stdout;
};
const decode = (buffer, label) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new VerificationError(`${label} contains a non-UTF-8 Git path`);
  }
};

const verifySource = async (source, repository) => {
  const repositoryPath = await realpath(repository).catch(() => { throw new VerificationError(`repository ${source.id} is unavailable: ${repository}`); });
  const head = git(repositoryPath, ['rev-parse', '--verify', 'HEAD']).trim();
  ensureEqual(head, source.commit, `${source.id} HEAD mismatch: expected ${source.commit}, received ${head}`);
  const taggedCommit = git(repositoryPath, ['rev-parse', '--verify', `refs/tags/${source.tag}^{commit}`]).trim();
  ensureEqual(taggedCommit, source.commit, `${source.id} tag ${source.tag} does not resolve to ${source.commit}`);
  for (const gitlink of source.gitlinks) {
    const line = git(repositoryPath, ['ls-tree', source.commit, '--', gitlink.path]).trim();
    ensureEqual(line, `160000 commit ${gitlink.oid}\t${gitlink.path}`, `${source.id} gitlink mismatch for ${gitlink.path}`);
  }
  const paths = source.paths.map((entry) => {
    const actualOid = git(repositoryPath, ['rev-parse', '--verify', `${source.commit}:${entry.source}`]).trim();
    ensureEqual(actualOid, entry.oid, `locked object mismatch for ${source.id}:${entry.source}: expected ${entry.oid}, received ${actualOid}`);
    if (git(repositoryPath, ['cat-file', '-t', entry.oid]).trim() !== 'tree') {
      throw new VerificationError(`${source.id}:${entry.source} is not a Git tree`);
    }
    const listing = git(repositoryPath, ['ls-tree', '-rz', '--full-tree', source.commit, '--', entry.source], { encoding: null });
    const files = decode(listing, `${source.id}:${entry.source}`).split('\0').filter(Boolean).map((line) => {
      const match = line.match(/^(\d{6}) (blob|commit) ([0-9a-f]{40})\t(.+)$/);
      if (!match) throw new VerificationError(`unsupported Git entry in ${source.id}:${entry.source}`);
      const [, mode, type, oid, path] = match;
      if (mode === '120000') throw new VerificationError(`symlink rejected in ${source.id}:${path}`);
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new VerificationError(`unsupported Git entry ${mode} ${type} in ${source.id}:${path}`);
      if (!path.startsWith(`${entry.source}/`)) throw new VerificationError(`path escape rejected in ${source.id}:${path}`);
      requireRelativePath(path.slice(entry.source.length + 1), `${source.id} Git path`);
      return { oid, path };
    });
    if (files.length === 0) throw new VerificationError(`locked tree ${source.id}:${entry.source} contains no files`);
    return { ...entry, files };
  });
  const blobOids = [...new Set(paths.flatMap((entry) => entry.files.map(({ oid }) => oid)))];
  if (blobOids.length > 0) {
    const checked = git(repositoryPath, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
      input: `${blobOids.join('\n')}\n`,
    }).trim().split('\n');
    for (const [index, oid] of blobOids.entries()) {
      if (checked[index] !== `${oid} blob`) throw new VerificationError(`locked blob is unavailable for ${source.id}: ${oid}`);
    }
  }
  return { ...source, repository: repositoryPath, paths };
};

const pathExists = async (path) => lstat(path).then(() => true, (error) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

const materialize = async ({ lockPath, destination, repositories }) => {
  const lock = parseLock(await readFile(lockPath, 'utf8'));
  for (const id of repositories.keys()) {
    if (!lock.sources.some((source) => source.id === id)) throw new InputError(`repository supplied for unknown source ${id}`);
  }
  const destinationPath = resolve(destination);
  if (await pathExists(destinationPath)) throw new DestinationError(`destination already exists: ${destinationPath}`);
  const verified = [];
  for (const source of lock.sources) {
    const repository = repositories.get(source.id);
    if (repository === undefined) throw new InputError(`missing --repository ${source.id}=<path>`);
    verified.push(await verifySource(source, repository));
  }

  const parent = dirname(destinationPath);
  await mkdir(parent, { recursive: true });
  const staging = join(parent, `.${basename(destinationPath)}.tmp-${process.pid}-${randomUUID()}`);
  try {
    await mkdir(staging, { mode: 0o700 });
    let fileCount = 0;
    for (const source of verified) {
      if (source.paths.length === 0) continue;
      const checkoutRoot = join(staging, '.git-objects', source.id);
      const indexPath = join(staging, `.git-index-${source.id}`);
      await mkdir(checkoutRoot, { recursive: true });
      const env = { GIT_INDEX_FILE: indexPath };
      git(source.repository, ['read-tree', source.commit], { extraEnv: env });
      const files = source.paths.flatMap((entry) => entry.files.map(({ path }) => path));
      git(source.repository, ['checkout-index', '--force', '--stdin', '-z', `--prefix=${checkoutRoot}${sep}`], {
        input: `${files.join('\0')}\0`,
        extraEnv: env,
      });
      for (const entry of source.paths) {
        const target = join(staging, ...entry.destination.split('/'));
        const resolvedTarget = resolve(target);
        if (!resolvedTarget.startsWith(`${staging}${sep}`)) throw new VerificationError(`destination path escape rejected: ${entry.destination}`);
        await mkdir(dirname(target), { recursive: true });
        await cp(join(checkoutRoot, ...entry.source.split('/')), target, { recursive: true, errorOnExist: true, force: false });
        fileCount += entry.files.length;
      }
      await rm(checkoutRoot, { recursive: true, force: true });
      await rm(indexPath, { force: true });
    }
    await rm(join(staging, '.git-objects'), { recursive: true, force: true });
    await rename(staging, destinationPath);
    return { release: lock.release, destination: destinationPath, fileCount };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  const result = await materialize({ lockPath: args.lock, destination: args.destination, repositories: args.repositories });
  process.stdout.write(`Materialized ${result.release}: files=${result.fileCount} destination=${result.destination}\n`);
};

main().catch((error) => {
  const expected = error instanceof MaterializationError;
  process.stderr.write(`${expected ? error.constructor.name : 'UnexpectedError'}: ${error.message}\n`);
  process.exitCode = 1;
});
