#!/usr/bin/env node

// src/cli.ts
import { realpathSync } from "node:fs";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/download.ts
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
var DownloadError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DownloadError";
    this.code = code;
  }
};
var ChecksumMismatchError = class extends DownloadError {
  expectedSha256;
  actualSha256;
  constructor(options) {
    super(
      "checksum-mismatch",
      `Checksum mismatch for ${options.url}: expected sha256 ${options.expectedSha256} but downloaded sha256 ${options.actualSha256}; deleted the partial download.`
    );
    this.name = "ChecksumMismatchError";
    this.expectedSha256 = options.expectedSha256;
    this.actualSha256 = options.actualSha256;
  }
};
var UnsupportedPlatformError = class extends DownloadError {
  manifestName;
  platformKey;
  constructor(options) {
    super(
      "unsupported-platform",
      `Manifest "${options.manifestName}" has no asset for unsupported platform "${options.platformKey}" (available: ${options.availablePlatforms.join(", ")}).`
    );
    this.name = "UnsupportedPlatformError";
    this.manifestName = options.manifestName;
    this.platformKey = options.platformKey;
  }
};
var PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];
function proxyLimitationNote(env) {
  const configuredKey = PROXY_ENV_KEYS.find((key) => (env[key] ?? "").trim().length > 0);
  if (configuredKey === void 0) return "";
  return ` Note: ${configuredKey} is set, but the bootstrap downloader does not tunnel through HTTP(S) proxies in v1; the download was attempted directly.`;
}
function describeFailure(error) {
  return error instanceof Error ? error.message : String(error);
}
async function writeBodyToFile(body, tempPath) {
  const hash = createHash("sha256");
  if (body === null) {
    await pipeline(Readable.from([]), createWriteStream(tempPath));
    return hash.digest("hex");
  }
  await pipeline(
    Readable.fromWeb(body),
    async function* hashChunks(source) {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        yield buffer;
      }
    },
    createWriteStream(tempPath)
  );
  return hash.digest("hex");
}
async function downloadChecksummedAsset(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const expectedSha256 = options.sha256.toLowerCase();
  await mkdir(dirname(options.destination), { recursive: true });
  const tempPath = `${options.destination}.${randomUUID().slice(0, 8)}.partial`;
  let response;
  try {
    response = await fetchImpl(options.url);
  } catch (error) {
    throw new DownloadError(
      "download-failed",
      `Download failed for ${options.url}: ${describeFailure(error)}.${proxyLimitationNote(env)}`
    );
  }
  if (!response.ok) {
    throw new DownloadError(
      "download-failed",
      `Download failed for ${options.url}: HTTP ${response.status}.${proxyLimitationNote(env)}`
    );
  }
  let actualSha256;
  try {
    actualSha256 = await writeBodyToFile(response.body, tempPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw new DownloadError(
      "download-failed",
      `Download failed for ${options.url} while writing the response body: ${describeFailure(error)}.${proxyLimitationNote(env)}`
    );
  }
  if (actualSha256 !== expectedSha256) {
    await rm(tempPath, { force: true });
    throw new ChecksumMismatchError({ actualSha256, expectedSha256, url: options.url });
  }
  await rename(tempPath, options.destination);
  return options.destination;
}
function resolveDefaultManifestsDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "manifests");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseManifestAsset(value, manifestName, platformKey) {
  if (!isRecord(value) || typeof value["url"] !== "string" || typeof value["sha256"] !== "string") {
    throw new Error(`Manifest "${manifestName}" platform "${platformKey}" must pin both url and sha256 strings.`);
  }
  return { sha256: value["sha256"], url: value["url"] };
}
function parseAssetManifest(raw, manifestName) {
  const data = JSON.parse(raw);
  if (!isRecord(data) || typeof data["name"] !== "string" || typeof data["version"] !== "string" || !isRecord(data["platforms"])) {
    throw new Error(`Manifest "${manifestName}" must declare name, version, and a platforms object.`);
  }
  const platforms = {};
  for (const [platformKey, asset] of Object.entries(data["platforms"])) {
    platforms[platformKey] = parseManifestAsset(asset, manifestName, platformKey);
  }
  return { name: data["name"], platforms, version: data["version"] };
}
async function loadAssetManifest(manifestName, manifestsDir) {
  const directory = manifestsDir ?? resolveDefaultManifestsDir();
  const raw = await readFile(join(directory, `${manifestName}.json`), "utf8");
  return parseAssetManifest(raw, manifestName);
}
async function downloadFromManifest(options) {
  const manifest = await loadAssetManifest(options.manifestName, options.manifestsDir);
  const asset = manifest.platforms[options.platformKey];
  if (asset === void 0) {
    throw new UnsupportedPlatformError({
      availablePlatforms: Object.keys(manifest.platforms),
      manifestName: options.manifestName,
      platformKey: options.platformKey
    });
  }
  const destination = join(options.destinationDir, basename(new URL(asset.url).pathname));
  return downloadChecksummedAsset({
    destination,
    sha256: asset.sha256,
    url: asset.url,
    ...options.fetchImpl === void 0 ? {} : { fetchImpl: options.fetchImpl },
    ...options.env === void 0 ? {} : { env: options.env }
  });
}

// src/hook.ts
import { spawn } from "node:child_process";
import { stat as stat5 } from "node:fs/promises";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// ../../scripts/auto-update-state.mjs
import { appendFile, mkdir as mkdir2, open, readFile as readFile2, rm as rm2, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";
var DEFAULT_LOCK_STALE_MS = 10 * 60 * 1e3;
function resolveStatePath(env) {
  if (env.ASTERLINE_AUTO_UPDATE_STATE_PATH?.trim()) return env.ASTERLINE_AUTO_UPDATE_STATE_PATH;
  const dataRoot = env.PLUGIN_DATA?.trim() || join2(homedir(), ".local", "share", "asterline");
  return join2(dataRoot, "auto-update.json");
}
function resolveLockPath(env, statePath) {
  if (env.ASTERLINE_AUTO_UPDATE_LOCK_PATH?.trim()) return env.ASTERLINE_AUTO_UPDATE_LOCK_PATH;
  return `${statePath}.lock`;
}
async function acquireLock(lockPath, now, staleMs = DEFAULT_LOCK_STALE_MS) {
  await mkdir2(dirname2(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${now}
`);
    await handle.close();
    return {
      release: () => rm2(lockPath, { force: true })
    };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    if (!await removeStaleLock(lockPath, now, staleMs)) return null;
    return acquireLock(lockPath, now, 0);
  }
}
async function readState(statePath) {
  try {
    const raw = await readFile2(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    return {};
  }
}
async function writeState(statePath, state) {
  await mkdir2(dirname2(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}
`);
}
async function removeStaleLock(lockPath, now, staleMs) {
  if (staleMs <= 0) return false;
  try {
    const lockStat = await stat(lockPath);
    if (now - lockStat.mtimeMs < staleMs) return false;
    await rm2(lockPath, { force: true });
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
    throw error;
  }
}

// src/environment.ts
import { stat as stat2 } from "node:fs/promises";
import { readFile as readFile3 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname3, join as join3, resolve } from "node:path";
var INSTALL_SNAPSHOT_FILENAME = "asterline-install.json";
var DEFAULT_MARKETPLACE_NAME = "sisyphuslabs";
var MAX_ASTERLINE_HOME_WALK_UP_LEVELS = 6;
async function detectInstallFlowDetailed(options) {
  const marketplaceName = options.marketplaceName ?? DEFAULT_MARKETPLACE_NAME;
  const snapshotPresent = await isFile(join3(options.pluginRoot, INSTALL_SNAPSHOT_FILENAME));
  const snapshotSignal = snapshotPresent ? "npx-local" : "marketplace";
  const snapshotReason = snapshotPresent ? `${INSTALL_SNAPSHOT_FILENAME} present at plugin root (written only by the npx installer)` : `${INSTALL_SNAPSHOT_FILENAME} absent from plugin root`;
  const scan = options.configToml === void 0 ? { kind: "absent" } : scanMarketplaceSource(options.configToml, marketplaceName);
  if (scan.kind === "absent") {
    return {
      configSignal: void 0,
      configSource: void 0,
      flow: snapshotSignal,
      reason: `${snapshotReason}; no [marketplaces.${marketplaceName}] source to cross-check`,
      snapshotPresent
    };
  }
  if (scan.kind === "unparsable") {
    return {
      configSignal: "unparsable",
      configSource: void 0,
      flow: "unknown",
      reason: `${snapshotReason}; [marketplaces.${marketplaceName}] source value is unparsable`,
      snapshotPresent
    };
  }
  const configSignal = classifyMarketplaceSource(scan.source);
  if (configSignal === "unparsable") {
    return {
      configSignal,
      configSource: scan.source,
      flow: "unknown",
      reason: `${snapshotReason}; marketplace source ${JSON.stringify(scan.source)} is neither a local absolute path nor a git URL`,
      snapshotPresent
    };
  }
  if (configSignal !== snapshotSignal) {
    return {
      configSignal,
      configSource: scan.source,
      flow: "unknown",
      reason: `${snapshotReason}, but marketplace source ${JSON.stringify(scan.source)} indicates ${configSignal}; signals disagree`,
      snapshotPresent
    };
  }
  return {
    configSignal,
    configSource: scan.source,
    flow: snapshotSignal,
    reason: `${snapshotReason}; marketplace source ${JSON.stringify(scan.source)} agrees`,
    snapshotPresent
  };
}
async function detectInstallFlow(options) {
  return (await detectInstallFlowDetailed(options)).flow;
}
async function detectInstallFlowFromEnvironment(options) {
  const home = await resolveAsterlineHome({ env: options.env, pluginRoot: options.pluginRoot });
  const configToml = await readOptionalFile(join3(home.path, "config.toml"));
  return detectInstallFlowDetailed({
    pluginRoot: options.pluginRoot,
    ...configToml === void 0 ? {} : { configToml },
    ...options.marketplaceName === void 0 ? {} : { marketplaceName: options.marketplaceName }
  });
}
async function detectInstallFlowForTest(pluginRoot) {
  const home = await resolveAsterlineHome({ env: {}, pluginRoot });
  const configToml = home.source === "walk-up" ? await readOptionalFile(join3(home.path, "config.toml")) : void 0;
  return detectInstallFlow({ pluginRoot, ...configToml === void 0 ? {} : { configToml } });
}
async function resolveAsterlineHome(options) {
  const envHome = options.env["ASTERLINE_HOME"]?.trim();
  if (envHome !== void 0 && envHome.length > 0) {
    return { path: resolve(envHome), source: "env" };
  }
  if (options.pluginRoot !== void 0) {
    let current = resolve(options.pluginRoot);
    for (let level = 0; level < MAX_ASTERLINE_HOME_WALK_UP_LEVELS; level += 1) {
      const parent = dirname3(current);
      if (parent === current) break;
      current = parent;
      if (await isFile(join3(current, "config.toml"))) {
        return { path: current, source: "walk-up" };
      }
    }
  }
  return { path: join3(homedir2(), ".asterline"), source: "default" };
}
function resolveBootstrapStatePath(pluginData) {
  return join3(pluginData, "bootstrap", "state.json");
}
function resolveBootstrapLockPath(pluginData) {
  return `${resolveBootstrapStatePath(pluginData)}.lock`;
}
async function bootstrapLocks(options) {
  const now = options.now ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const statePath = resolveBootstrapStatePath(options.pluginData);
  const bootstrapLockPath = resolveBootstrapLockPath(options.pluginData);
  const autoUpdateLockPath = resolveLockPath(options.env, resolveStatePath(options.env));
  const bootstrapLock = await acquireLock(bootstrapLockPath, now, staleMs);
  if (bootstrapLock === null) return null;
  if (autoUpdateLockPath === bootstrapLockPath) {
    return { autoUpdateLockPath, bootstrapLockPath, release: () => bootstrapLock.release(), statePath };
  }
  const autoUpdateLock = await acquireLock(autoUpdateLockPath, now, staleMs);
  if (autoUpdateLock === null) {
    await bootstrapLock.release();
    return null;
  }
  return {
    autoUpdateLockPath,
    bootstrapLockPath,
    release: async () => {
      await autoUpdateLock.release();
      await bootstrapLock.release();
    },
    statePath
  };
}
function scanMarketplaceSource(configToml, marketplaceName) {
  const expectedHeaders = /* @__PURE__ */ new Set([`marketplaces.${marketplaceName}`, `marketplaces.${JSON.stringify(marketplaceName)}`]);
  let inMarketplaceSection = false;
  for (const line of configToml.split("\n")) {
    const header = parseTomlHeader(line);
    if (header !== null) {
      inMarketplaceSection = expectedHeaders.has(header);
      continue;
    }
    if (!inMarketplaceSection) continue;
    const valueText = parseSourceAssignment(line);
    if (valueText === null) continue;
    const source = parseTomlStringValue(valueText);
    return source === void 0 ? { kind: "unparsable" } : { kind: "source", source };
  }
  return { kind: "absent" };
}
function parseTomlHeader(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  if (trimmed.startsWith("[[")) return null;
  return trimmed.slice(1, -1).trim();
}
function parseSourceAssignment(line) {
  const match = /^\s*source\s*=\s*(.+)$/.exec(line);
  return match === null ? null : match[1] ?? null;
}
function parseTomlStringValue(valueText) {
  const trimmed = valueText.trim();
  if (trimmed.startsWith('"')) return parseLeadingJsonString(trimmed);
  if (trimmed.startsWith("'")) {
    const closingIndex = trimmed.indexOf("'", 1);
    return closingIndex === -1 ? void 0 : trimmed.slice(1, closingIndex);
  }
  return void 0;
}
function parseLeadingJsonString(value) {
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    const char = value[index];
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      try {
        const parsed = JSON.parse(value.slice(0, index + 1));
        return typeof parsed === "string" ? parsed : void 0;
      } catch {
        return void 0;
      }
    }
  }
  return void 0;
}
function classifyMarketplaceSource(source) {
  const trimmed = source.trim();
  if (trimmed.length === 0) return "unparsable";
  if (/^(https?|ssh|git):\/\//i.test(trimmed) || trimmed.startsWith("git@")) return "marketplace";
  if (trimmed.startsWith("/") || trimmed.startsWith("~") || trimmed.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return "npx-local";
  }
  if (trimmed.toLowerCase().endsWith(".git")) return "marketplace";
  return "unparsable";
}
async function isFile(path) {
  try {
    return (await stat2(path)).isFile();
  } catch {
    return false;
  }
}
async function readOptionalFile(path) {
  try {
    return await readFile3(path, "utf8");
  } catch {
    return void 0;
  }
}

// src/worker.ts
import { appendFile as appendFile2, mkdir as mkdir8, readFile as readFile12 } from "node:fs/promises";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname8, join as join15, resolve as resolve5 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/provision.ts
import { execFile } from "node:child_process";
import { randomUUID as randomUUID2 } from "node:crypto";
import { chmod, mkdir as mkdir3, readFile as readFile4, rename as rename2, rm as rm3, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename2, dirname as dirname5, join as join5 } from "node:path";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";

// ../../../../ast-grep-mcp/src/sg-cli-path.ts
import { createRequire } from "node:module";
import { homedir as defaultHomedir } from "node:os";
import { dirname as dirname4, join as join4 } from "node:path";
import { existsSync, statSync } from "node:fs";
var SG_PATH_ENV_KEY = "ASTERLINE_AST_GREP_SG_PATH";
var WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"];
function isValidBinary(filePath) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }
    const size = stats.size;
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith(".cmd") || lowerPath.endsWith(".bat")) {
      return size > 0;
    }
    return size > 1e4;
  } catch {
    return false;
  }
}
function executableCandidates(filePath, platform = process.platform) {
  if (platform !== "win32") return [filePath];
  const candidates = [filePath];
  const lowerPath = filePath.toLowerCase();
  if (WINDOWS_EXECUTABLE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return candidates;
  }
  for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
    candidates.push(`${filePath}${extension}`);
  }
  return candidates;
}
function findValidExecutable(filePath, platform = process.platform) {
  for (const candidate of executableCandidates(filePath, platform)) {
    if (existsSync(candidate) && isValidBinary(candidate)) {
      return candidate;
    }
  }
  return null;
}
function getPlatformPackageName(platform, arch) {
  const platformMap = {
    "darwin-arm64": "@ast-grep/cli-darwin-arm64",
    "darwin-x64": "@ast-grep/cli-darwin-x64",
    "linux-arm64": "@ast-grep/cli-linux-arm64-gnu",
    "linux-x64": "@ast-grep/cli-linux-x64-gnu",
    "win32-x64": "@ast-grep/cli-win32-x64-msvc",
    "win32-arm64": "@ast-grep/cli-win32-arm64-msvc",
    "win32-ia32": "@ast-grep/cli-win32-ia32-msvc"
  };
  return platformMap[`${platform}-${arch}`] ?? null;
}
function isModuleResolutionFailure(error) {
  return error instanceof Error && (error.message.includes("Cannot find module") || error.message.includes("Cannot find package"));
}
function defaultResolveModulePath(specifier) {
  const require2 = createRequire(import.meta.url);
  return require2.resolve(specifier);
}
function nonEmptyValue(value) {
  if (value === void 0) return void 0;
  const trimmed = value.trim();
  return trimmed.length === 0 ? void 0 : trimmed;
}
function findEnvOverrideSgPath(env, platform) {
  const overridePath = nonEmptyValue(env[SG_PATH_ENV_KEY]);
  if (overridePath === void 0) return null;
  return findValidExecutable(overridePath, platform);
}
function findRuntimeDirSgPath(env, platform, arch, homedir5) {
  const asterlineHome = nonEmptyValue(env["ASTERLINE_HOME"]) ?? join4(homedir5(), ".asterline");
  const binaryName = platform === "win32" ? "sg.exe" : "sg";
  const runtimePath = join4(asterlineHome, "runtime", "ast-grep", `${platform}-${arch}`, binaryName);
  return findValidExecutable(runtimePath, platform);
}
function findSgCliPathSync(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const homedir5 = options.homedir ?? defaultHomedir;
  const resolveModulePath = options.resolveModulePath ?? defaultResolveModulePath;
  const envOverridePath = findEnvOverrideSgPath(env, platform);
  if (envOverridePath) {
    return envOverridePath;
  }
  const runtimeDirPath = findRuntimeDirSgPath(env, platform, arch, homedir5);
  if (runtimeDirPath) {
    return runtimeDirPath;
  }
  const binaryName = "sg";
  try {
    const cliPackageJsonPath = resolveModulePath("@ast-grep/cli/package.json");
    const cliDirectory = dirname4(cliPackageJsonPath);
    const sgPath = join4(cliDirectory, binaryName);
    const validSgPath = findValidExecutable(sgPath, platform);
    if (validSgPath) {
      return validSgPath;
    }
  } catch (error) {
    if (!isModuleResolutionFailure(error)) {
      throw error;
    }
  }
  const platformPackage = getPlatformPackageName(platform, arch);
  if (platformPackage) {
    try {
      const packageJsonPath = resolveModulePath(`${platformPackage}/package.json`);
      const packageDirectory = dirname4(packageJsonPath);
      const astGrepBinaryName = "ast-grep";
      const binaryPath = join4(packageDirectory, astGrepBinaryName);
      const validBinaryPath = findValidExecutable(binaryPath, platform);
      if (validBinaryPath) {
        return validBinaryPath;
      }
    } catch (error) {
      if (!isModuleResolutionFailure(error)) {
        throw error;
      }
    }
  }
  if (platform === "darwin") {
    const homebrewPaths = ["/opt/homebrew/bin/sg", "/usr/local/bin/sg"];
    for (const path of homebrewPaths) {
      if (existsSync(path) && isValidBinary(path)) {
        return path;
      }
    }
  }
  return null;
}

// src/provision.ts
var SG_PROVISION_COMPONENT = "ast_grep";
var SG_FORCE_PROVISION_ENV_KEY = "ASTERLINE_BOOTSTRAP_FORCE_PROVISION";
var SG_MANIFEST_NAME = "ast-grep";
function sgProvisionDestination(context, arch) {
  const binaryName = context.platform === "win32" ? "sg.exe" : "sg";
  return join5(context.asterlineHome, "runtime", "ast-grep", `${context.platform}-${arch}`, binaryName);
}
async function runSgProvision(context, seams = {}) {
  const arch = seams.arch ?? process.arch;
  const destination = sgProvisionDestination(context, arch);
  if (context.env[SG_FORCE_PROVISION_ENV_KEY] !== "1") {
    const preexisting = (seams.resolvePreexistingSg ?? defaultResolvePreexistingSg)({
      arch,
      asterlineHome: context.asterlineHome,
      env: context.env,
      platform: context.platform
    });
    if (preexisting !== null) {
      await appendBootstrapLog(context.pluginData, context.now, "sg-provision", { sg: `preexisting:${preexisting}` });
      return { degraded: [] };
    }
  }
  const stagingDir = join5(dirname5(destination), `.staging-${randomUUID2().slice(0, 8)}`);
  try {
    const version = await provisionFromManifest(context, seams, { arch, destination, stagingDir });
    await appendBootstrapLog(context.pluginData, context.now, "sg-provision", {
      sg: `provisioned:${destination}`,
      version
    });
    return { degraded: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await appendBootstrapLog(context.pluginData, context.now, "sg-provision-failed", { reason });
    return { degraded: [{ component: SG_PROVISION_COMPONENT, hint: BOOTSTRAP_DOCTOR_HINT, reason }] };
  } finally {
    await rm3(stagingDir, { force: true, recursive: true });
  }
}
async function provisionFromManifest(context, seams, layout) {
  const manifest = await loadAssetManifest(SG_MANIFEST_NAME, context.flags.manifestDir);
  const platformKey = `${context.platform}-${layout.arch}`;
  const asset = manifest.platforms[platformKey];
  if (asset === void 0) {
    throw new Error(
      `ast-grep ${manifest.version} has no asset for unsupported platform "${platformKey}" (available: ${Object.keys(manifest.platforms).join(", ")}).`
    );
  }
  await mkdir3(layout.stagingDir, { recursive: true });
  const archivePath = await downloadChecksummedAsset({
    destination: join5(layout.stagingDir, basename2(new URL(asset.url).pathname)),
    env: context.env,
    sha256: asset.sha256,
    url: asset.url,
    ...seams.fetchImpl === void 0 ? {} : { fetchImpl: seams.fetchImpl }
  });
  const binaryBytes = extractStandaloneSgBinary(await readFile4(archivePath), context.platform);
  const stagedBinary = join5(layout.stagingDir, basename2(layout.destination));
  await writeFile2(stagedBinary, binaryBytes);
  await chmod(stagedBinary, 493);
  await rename2(stagedBinary, layout.destination);
  await verifyProvisionedVersion(layout.destination, manifest.version, seams);
  return manifest.version;
}
async function verifyProvisionedVersion(destination, pinnedVersion, seams) {
  let reported;
  try {
    reported = (await (seams.runVersionProbe ?? defaultVersionProbe)(destination)).trim();
  } catch (error) {
    await rm3(destination, { force: true });
    throw new Error(
      `provisioned sg at ${destination} failed its --version probe: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!reported.includes(pinnedVersion)) {
    await rm3(destination, { force: true });
    throw new Error(
      `provisioned sg at ${destination} reported "${reported}" but the manifest pins version ${pinnedVersion}; removed the binary.`
    );
  }
}
function defaultResolvePreexistingSg(options) {
  return findSgCliPathSync({
    arch: options.arch,
    env: { ...options.env, ASTERLINE_HOME: options.asterlineHome },
    platform: options.platform
  });
}
var execFileAsync = promisify(execFile);
async function defaultVersionProbe(binaryPath) {
  const { stdout } = await execFileAsync(binaryPath, ["--version"]);
  return String(stdout);
}
function extractStandaloneSgBinary(zip, platform) {
  const suffix = platform === "win32" ? ".exe" : "";
  const entries = listZipEntries(zip);
  const preferredNames = [`ast-grep${suffix}`, `sg${suffix}`];
  for (const preferred of preferredNames) {
    const entry = entries.find((candidate) => zipEntryBaseName(candidate.name) === preferred);
    if (entry !== void 0) return readZipEntryBytes(zip, entry);
  }
  throw new Error(
    `ast-grep release zip has no ${preferredNames.join(" or ")} entry (found: ${entries.map((entry) => entry.name).join(", ")}).`
  );
}
function zipEntryBaseName(entryName) {
  const segments = entryName.split("/");
  return segments[segments.length - 1] ?? entryName;
}
var EOCD_SIGNATURE = 101010256;
var CENTRAL_SIGNATURE = 33639248;
var LOCAL_SIGNATURE = 67324752;
var ZIP64_SENTINEL = 4294967295;
function listZipEntries(zip) {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let cursor = zip.readUInt32LE(eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error("zip central directory is corrupt (bad entry signature)");
    }
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    entries.push({
      compressedSize: zip.readUInt32LE(cursor + 20),
      localHeaderOffset: zip.readUInt32LE(cursor + 42),
      method: zip.readUInt16LE(cursor + 10),
      name: zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"),
      uncompressedSize: zip.readUInt32LE(cursor + 24)
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function findEndOfCentralDirectory(zip) {
  const lowestOffset = Math.max(0, zip.length - 22 - 65535);
  for (let offset = zip.length - 22; offset >= lowestOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("downloaded asset is not a zip archive (end-of-central-directory record missing)");
}
function readZipEntryBytes(zip, entry) {
  if (entry.compressedSize === ZIP64_SENTINEL || entry.uncompressedSize === ZIP64_SENTINEL || entry.localHeaderOffset === ZIP64_SENTINEL) {
    throw new Error(`zip entry ${entry.name} uses unsupported zip64 extensions`);
  }
  if (zip.readUInt32LE(entry.localHeaderOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`zip entry ${entry.name} has a corrupt local header`);
  }
  const nameLength = zip.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const raw = zip.subarray(dataStart, dataStart + entry.compressedSize);
  const bytes = decompressZipEntry(raw, entry);
  if (bytes.length !== entry.uncompressedSize) {
    throw new Error(
      `zip entry ${entry.name} inflated to ${bytes.length} bytes but the archive declares ${entry.uncompressedSize}`
    );
  }
  return bytes;
}
function decompressZipEntry(raw, entry) {
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`zip entry ${entry.name} uses unsupported compression method ${entry.method}`);
}

// src/setup.ts
import { execFile as execFile2 } from "node:child_process";
import { copyFile as copyFile2, mkdir as mkdir7, readdir as readdir3, rm as rm7, stat as stat4 } from "node:fs/promises";
import { join as join14 } from "node:path";
import { promisify as promisify2 } from "node:util";

// ../../../scripts/install/agents.mjs
import { basename as basename3, join as join6 } from "node:path";
import { copyFile, lstat, mkdir as mkdir4, readFile as readFile5, readdir, rm as rm4, writeFile as writeFile3 } from "node:fs/promises";

// ../../../scripts/install/utils.mjs
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../../../scripts/install/agents.mjs
var MANIFEST_FILE = ".installed-agents.json";
async function capturePreservedAgentReasoning({ asterlineHome }) {
  const agentsDir = join6(asterlineHome, "agents");
  if (!await exists(agentsDir)) return /* @__PURE__ */ new Map();
  const preserved = /* @__PURE__ */ new Map();
  const agentEntries = await readdir(agentsDir, { withFileTypes: true });
  for (const entry of agentEntries) {
    if (!entry.name.endsWith(".toml")) continue;
    const content = await readTextIfExists(join6(agentsDir, entry.name));
    if (content === null) continue;
    const effort = extractReasoningEffort(content);
    if (effort !== null) preserved.set(agentNameFromToml(entry.name), effort);
  }
  return preserved;
}
async function capturePreservedAgentServiceTier({ asterlineHome }) {
  const agentsDir = join6(asterlineHome, "agents");
  if (!await exists(agentsDir)) return /* @__PURE__ */ new Map();
  const preserved = /* @__PURE__ */ new Map();
  const agentEntries = await readdir(agentsDir, { withFileTypes: true });
  for (const entry of agentEntries) {
    if (!entry.name.endsWith(".toml")) continue;
    const content = await readTextIfExists(join6(agentsDir, entry.name));
    if (content === null) continue;
    preserved.set(agentNameFromToml(entry.name), extractServiceTier(content));
  }
  return preserved;
}
async function linkCachedPluginAgents({ asterlineHome, pluginRoot, preservedReasoning = /* @__PURE__ */ new Map(), preservedServiceTier = /* @__PURE__ */ new Map() }) {
  const bundledAgents = await discoverBundledAgents(pluginRoot);
  if (bundledAgents.length === 0) {
    await writeManifest(pluginRoot, []);
    return [];
  }
  const agentsDir = join6(asterlineHome, "agents");
  await mkdir4(agentsDir, { recursive: true });
  const linked = [];
  for (const agentPath of bundledAgents) {
    const agentFileName = basename3(agentPath);
    const agentName = agentNameFromToml(agentFileName);
    const linkPath = join6(agentsDir, agentFileName);
    await replaceWithCopy(linkPath, agentPath);
    await restorePreservedReasoning({ linkPath, target: agentPath, value: preservedReasoning.get(agentName) });
    await restorePreservedServiceTier({
      linkPath,
      preserved: preservedServiceTier.has(agentName),
      value: preservedServiceTier.get(agentName) ?? null
    });
    linked.push({ name: agentFileName, path: linkPath, target: agentPath });
  }
  await writeManifest(pluginRoot, linked.map((entry) => entry.path));
  return linked;
}
async function restorePreservedServiceTier({ linkPath, preserved, value }) {
  if (!preserved) return;
  const content = await readFile5(linkPath, "utf8");
  if (extractServiceTier(content) === value) return;
  const replacement = replaceServiceTier(content, value);
  if (!replacement.replaced) return;
  await writeFile3(linkPath, replacement.content);
}
async function discoverBundledAgents(pluginRoot) {
  const componentsRoot = join6(pluginRoot, "components");
  if (!await exists(componentsRoot)) return [];
  const componentEntries = await readdir(componentsRoot, { withFileTypes: true });
  const agents = [];
  for (const entry of componentEntries) {
    if (!entry.isDirectory()) continue;
    const agentsRoot = join6(componentsRoot, entry.name, "agents");
    if (!await exists(agentsRoot)) continue;
    const agentEntries = await readdir(agentsRoot, { withFileTypes: true });
    for (const file of agentEntries) {
      if (!file.isFile() || !file.name.endsWith(".toml")) continue;
      agents.push(join6(agentsRoot, file.name));
    }
  }
  agents.sort();
  return agents;
}
async function replaceWithCopy(linkPath, target) {
  await prepareReplacement(linkPath);
  await copyFile(target, linkPath);
}
async function prepareReplacement(linkPath) {
  if (!await lstatExists(linkPath)) return;
  const entryStat = await lstat(linkPath);
  if (entryStat.isDirectory() && !entryStat.isSymbolicLink()) {
    throw new Error(`${linkPath} already exists and is a directory; refusing to replace`);
  }
  await rm4(linkPath, { force: true });
}
async function writeManifest(pluginRoot, agentPaths) {
  const manifestPath = join6(pluginRoot, MANIFEST_FILE);
  const payload = { agents: [...agentPaths].sort() };
  await writeFile3(manifestPath, `${JSON.stringify(payload, null, "	")}
`);
}
async function restorePreservedReasoning({ linkPath, target, value }) {
  if (value === void 0) return;
  const content = await readFile5(target, "utf8");
  if (extractReasoningEffort(content) === value) return;
  const replacement = replaceReasoningEffort(content, value);
  if (!replacement.replaced) return;
  if (await lstatExists(linkPath)) {
    await rm4(linkPath, { force: true });
  }
  await writeFile3(linkPath, replacement.content);
}
async function readTextIfExists(path) {
  try {
    return await readFile5(path, "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return null;
    throw error;
  }
}
function extractReasoningEffort(content) {
  return extractTopLevelStringSetting(content, "model_reasoning_effort");
}
function extractServiceTier(content) {
  return extractTopLevelStringSetting(content, "service_tier");
}
function extractTopLevelStringSetting(content, key) {
  for (const line of content.split(/\n/)) {
    if (isSectionHeader(line)) return null;
    const rawValue = topLevelStringSettingRawValue(line, key);
    if (rawValue === void 0) continue;
    return JSON.parse(rawValue);
  }
  return null;
}
function replaceReasoningEffort(content, value) {
  return replaceTopLevelStringSetting(content, "model_reasoning_effort", value, { insertIfMissing: false });
}
function replaceServiceTier(content, value) {
  return replaceTopLevelStringSetting(content, "service_tier", value, { insertIfMissing: true });
}
function replaceTopLevelStringSetting(content, key, value, options) {
  let replaced = false;
  const lines = content.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSectionHeader(line)) break;
    if (topLevelStringSettingRawValue(line, key) === void 0) continue;
    if (value === null) {
      lines.splice(index, 1);
      replaced = true;
      break;
    }
    lines[index] = line.replace(/=\s*"(?:[^"\\]|\\.)*"/, `= ${JSON.stringify(value)}`);
    replaced = true;
    break;
  }
  if (!replaced && value !== null && options.insertIfMissing) {
    lines.splice(topLevelInsertionIndex(lines), 0, `${key} = ${JSON.stringify(value)}`);
    replaced = true;
  }
  return { content: lines.join("\n"), replaced };
}
function topLevelStringSettingRawValue(line, key) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (match === null) return void 0;
  const settingKey = match[1];
  const rawValue = match[2];
  if (settingKey !== key || rawValue === void 0) return void 0;
  return rawValue;
}
function topLevelInsertionIndex(lines) {
  const sectionIndex = lines.findIndex((line) => isSectionHeader(line));
  const topLevelEnd = sectionIndex === -1 ? lines.length : sectionIndex;
  let insertionIndex = topLevelEnd;
  while (insertionIndex > 0 && lines[insertionIndex - 1] === "") {
    insertionIndex -= 1;
  }
  return insertionIndex;
}
function isSectionHeader(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}
function agentNameFromToml(fileName) {
  return fileName.endsWith(".toml") ? fileName.slice(0, -".toml".length) : fileName;
}
async function lstatExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
function nodeErrorCode(error) {
  if (!(error instanceof Error) || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

// ../../../scripts/install/bin-dir.mjs
import { homedir as homedir3 } from "node:os";
import { join as join7, resolve as resolve2 } from "node:path";
function resolveAsterlineInstallerBinDir(options = {}) {
  const homeDir = resolve2(options.homeDir ?? homedir3());
  const env = options.env ?? process.env;
  const explicitBinDir = nonEmptyEnvValue(env, "ASTERLINE_LOCAL_BIN_DIR");
  if (explicitBinDir !== void 0) return explicitBinDir;
  const asterlineHome = resolve2(options.asterlineHome ?? nonEmptyEnvValue(env, "ASTERLINE_HOME") ?? join7(homeDir, ".asterline"));
  const defaultAsterlineHome = resolve2(join7(homeDir, ".asterline"));
  return asterlineHome === defaultAsterlineHome ? join7(homeDir, ".local", "bin") : join7(asterlineHome, "bin");
}
function nonEmptyEnvValue(env, key) {
  const value = env[key];
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length === 0 ? void 0 : trimmed;
}

// ../../../scripts/install/bin-links.mjs
import { chmod as chmod2, lstat as lstat3, mkdir as mkdir5, readFile as readFile7, readdir as readdir2, readlink as readlink2, rm as rm6, stat as stat3, symlink, writeFile as writeFile4 } from "node:fs/promises";
import { basename as basename4, join as join9, relative, resolve as resolve3 } from "node:path";

// ../../../scripts/install/command-shim.mjs
var COMMAND_SHIM_MARKER = ":: generated by Asterline Asterline installer";

// ../../../scripts/install/legacy-bins.mjs
import { lstat as lstat2, readFile as readFile6, readlink, rm as rm5 } from "node:fs/promises";
import { join as join8 } from "node:path";
var LEGACY_ASTERLINE_COMPONENT_BINS = [
  { name: "asterline", component: "work-loop" },
  { name: "asterline-comment-checker", component: "comment-checker" },
  { name: "asterline-lsp", component: "lsp" },
  { name: "asterline-rules", component: "rules" },
  { name: "asterline-start-work-continuation", component: "start-work-continuation" },
  { name: "asterline-telemetry", component: "telemetry" },
  { name: "asterline-ultrawork", component: "ultrawork" }
];
async function removeLegacyAsterlineComponentBins(binDir, platform) {
  for (const entry of LEGACY_ASTERLINE_COMPONENT_BINS) {
    const linkPath = join8(binDir, platform === "win32" ? `${entry.name}.cmd` : entry.name);
    await removeLegacyAsterlineComponentBin(linkPath, entry.component, platform);
  }
}
async function removeLegacyAsterlineComponentBin(linkPath, component, platform) {
  try {
    const stat6 = await lstat2(linkPath);
    if (platform !== "win32") {
      if (!stat6.isSymbolicLink()) return;
      const target = await readlink(linkPath);
      if (isManagedLegacyComponentTarget(target, component)) await rm5(linkPath, { force: true });
      return;
    }
    if (!stat6.isFile()) return;
    const content = await readFile6(linkPath, "utf8");
    if (content.includes(COMMAND_SHIM_MARKER)) await rm5(linkPath, { force: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}
function isManagedLegacyComponentTarget(target, component) {
  const parts = target.split(/[\\/]+/);
  const suffixStart = parts.length - 4;
  const suffix = parts.slice(-4);
  return suffix[0] === "components" && suffix[1] === component && suffix[2] === "dist" && suffix[3] === "cli.js" && (hasPluginCachePrefix(parts, suffixStart) || hasOmoAsterlinePluginPrefix(parts, suffixStart));
}
function hasPluginCachePrefix(parts, endExclusive) {
  for (let index = 0; index < endExclusive - 1; index += 1) {
    if (parts[index] === "plugins" && parts[index + 1] === "cache") return true;
  }
  return false;
}
function hasOmoAsterlinePluginPrefix(parts, endExclusive) {
  for (let index = 0; index <= endExclusive - 3; index += 1) {
    if (parts[index] === "packages" && parts[index + 1] === "asterline-runtime" && parts[index + 2] === "plugin") return true;
  }
  return false;
}

// ../../../scripts/install/bin-links.mjs
var RESERVED_NESTED_BIN_NAMES = /* @__PURE__ */ new Set(["asterline", "asterline", "asterline-ai", "Asterline", "Asterline"]);
var RUNTIME_WRAPPER_MARKER = "ASTERLINE_GENERATED_RUNTIME_WRAPPER";
async function linkCachedPluginBins({ binDir, pluginRoot, platform = process.platform }) {
  const binLinks = await discoverPackageBins(pluginRoot);
  await mkdir5(binDir, { recursive: true });
  await removeLegacyAsterlineComponentBins(binDir, platform);
  const linked = [];
  for (const link of binLinks) {
    const linkPath = await linkCachedPluginBin(binDir, link, platform);
    linked.push({ name: link.name, path: linkPath, target: link.target });
  }
  return linked;
}
async function linkRootRuntimeBin({ binDir, asterlineHome, repoRoot, platform = process.platform }) {
  const cliPath = join9(repoRoot, "dist", "cli", "index.js");
  if (!await isFile2(cliPath)) return null;
  const nodeCliPath = join9(repoRoot, "dist", "cli-node", "index.js");
  await mkdir5(binDir, { recursive: true });
  if (platform === "win32") {
    const linkPath2 = join9(binDir, "asterline.cmd");
    await replaceRuntimeWrapper(linkPath2, windowsRuntimeWrapper(cliPath, asterlineHome, binDir, nodeCliPath));
    return { name: "asterline", path: linkPath2, target: cliPath };
  }
  const linkPath = join9(binDir, "asterline");
  await replaceRuntimeWrapper(linkPath, posixRuntimeWrapper(cliPath, asterlineHome, binDir, nodeCliPath));
  await chmod2(linkPath, 493);
  return { name: "asterline", path: linkPath, target: cliPath };
}
async function linkCachedPluginBin(binDir, link, platform) {
  if (platform === "win32") {
    const linkPath2 = join9(binDir, `${link.name}.cmd`);
    await replaceCommandShim(linkPath2, link.target);
    return linkPath2;
  }
  const linkPath = join9(binDir, link.name);
  await replaceSymlink(linkPath, link.target);
  return linkPath;
}
async function isFile2(path) {
  try {
    return (await stat3(path)).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
async function discoverPackageBins(root) {
  const links = [];
  await collectPackageBins(root, root, links);
  return links;
}
async function collectPackageBins(directory, root, links) {
  const entries = await readdir2(directory, { withFileTypes: true });
  const packageJsonPath = join9(directory, "package.json");
  if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
    await appendPackageBinLinks(packageJsonPath, directory, root, links);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const childPath = join9(directory, entry.name);
    if (!isPathInside(childPath, root)) continue;
    await collectPackageBins(childPath, root, links);
  }
}
async function appendPackageBinLinks(packageJsonPath, packageRoot, root, links) {
  const packageJson = JSON.parse(await readFile7(packageJsonPath, "utf8"));
  if (!isRecord3(packageJson)) return;
  const bin = packageJson.bin;
  if (typeof bin === "string" && typeof packageJson.name === "string") {
    const name = basename4(packageJson.name);
    if (!isReservedNestedBinName(name, packageRoot, root)) {
      links.push(createPackageBinLink(name, bin, packageRoot));
    }
    return;
  }
  if (!isRecord3(bin)) return;
  for (const [name, target] of Object.entries(bin)) {
    if (typeof target !== "string") continue;
    if (isReservedNestedBinName(name, packageRoot, root)) continue;
    links.push(createPackageBinLink(name, target, packageRoot));
  }
}
function createPackageBinLink(name, target, packageRoot) {
  assertSafeBinName(name);
  if (target.includes("\0")) {
    throw new Error(`package bin target for ${name} contains a NUL byte`);
  }
  const resolvedTarget = resolve3(packageRoot, target);
  if (!isPathInside(resolvedTarget, packageRoot)) {
    throw new Error(`package bin target for ${name} escapes package root`);
  }
  return { name, target: resolvedTarget };
}
function assertSafeBinName(name) {
  if (name.length === 0 || name === "." || name === ".." || name.includes("\0") || name.includes("/") || name.includes("\\")) {
    throw new Error(`invalid package bin name: ${name}`);
  }
}
function isReservedNestedBinName(name, packageRoot, root) {
  return packageRoot !== root && RESERVED_NESTED_BIN_NAMES.has(name);
}
async function replaceSymlink(linkPath, targetPath) {
  if (await existingNonSymlink(linkPath)) {
    throw new Error(`${linkPath} already exists and is not a symlink`);
  }
  await rm6(linkPath, { force: true });
  await symlink(targetPath, linkPath);
}
async function replaceCommandShim(linkPath, targetPath) {
  if (await existingNonShim(linkPath)) {
    throw new Error(`${linkPath} already exists and is not a command shim`);
  }
  await writeFile4(linkPath, `@echo off\r
${COMMAND_SHIM_MARKER}\r
node "${targetPath}" %*\r
`);
}
async function replaceRuntimeWrapper(linkPath, content) {
  if (await existingNonRuntimeWrapper(linkPath)) {
    throw new Error(`${linkPath} already exists and is not a generated ASTERLINE runtime wrapper`);
  }
  await rm6(linkPath, { force: true });
  await writeFile4(linkPath, content);
}
async function existingNonRuntimeWrapper(path) {
  try {
    const stat6 = await lstat3(path);
    if (stat6.isSymbolicLink()) return false;
    if (!stat6.isFile()) return true;
    const content = await readFile7(path, "utf8");
    return !content.includes(RUNTIME_WRAPPER_MARKER);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
function posixRuntimeWrapper(cliPath, asterlineHome, binDir, nodeCliPath) {
  const workLoopBin = join9(binDir, "asterline-work-loop");
  const nodeCli = escapePosixDoubleQuoted(nodeCliPath);
  return [
    "#!/bin/sh",
    `# ${RUNTIME_WRAPPER_MARKER}`,
    `export ASTERLINE_HOME="\${ASTERLINE_HOME:-${escapePosixDoubleQuoted(asterlineHome)}}"`,
    'export ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET="${ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET:-$ASTERLINE_HOME/app-server-control/app-server-control.sock}"',
    'if [ "$1" = "work-loop" ] && [ -x "' + escapePosixDoubleQuoted(workLoopBin) + '" ]; then',
    "  shift",
    '  exec "' + escapePosixDoubleQuoted(workLoopBin) + '" "$@"',
    "fi",
    `if [ "\${ASTERLINE_RUNTIME:-}" = "node" ] && [ -f "${nodeCli}" ]; then`,
    `  exec node "${nodeCli}" "$@"`,
    "fi",
    'BUN_BINARY="${BUN_BINARY:-}"',
    'if [ -z "$BUN_BINARY" ] && command -v bun >/dev/null 2>&1; then',
    "  BUN_BINARY=bun",
    "fi",
    'if [ -z "$BUN_BINARY" ]; then',
    '  for omo_bun_candidate in "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun; do',
    '    if [ -x "$omo_bun_candidate" ]; then',
    '      BUN_BINARY="$omo_bun_candidate"',
    "      break",
    "    fi",
    "  done",
    "fi",
    'if [ -z "$BUN_BINARY" ]; then',
    `  if [ -f "${nodeCli}" ] && command -v node >/dev/null 2>&1; then`,
    `    exec node "${nodeCli}" "$@"`,
    "  fi",
    `  echo "asterline: bun runtime not found (checked PATH, ~/.bun/bin, /opt/homebrew/bin, /usr/local/bin) and the node fallback CLI is missing at ${nodeCli}; install bun from https://bun.sh, or reinstall asterline and force the fallback with ASTERLINE_RUNTIME=node" >&2`,
    "  exit 127",
    "fi",
    `exec "$BUN_BINARY" "${escapePosixDoubleQuoted(cliPath)}" "$@"`,
    ""
  ].join("\n");
}
function windowsRuntimeWrapper(cliPath, asterlineHome, binDir, nodeCliPath) {
  const workLoopBin = join9(binDir, "asterline-work-loop.cmd");
  return [
    "@echo off",
    `rem ${RUNTIME_WRAPPER_MARKER}`,
    `if not defined ASTERLINE_HOME set "ASTERLINE_HOME=${asterlineHome}"`,
    'if not defined ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET set "ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET=%ASTERLINE_HOME%\\app-server-control\\app-server-control.sock"',
    `if "%~1"=="work-loop" if exist "${workLoopBin}" (`,
    "  shift /1",
    `  "${workLoopBin}" %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    `if "%ASTERLINE_RUNTIME%"=="node" if exist "${nodeCliPath}" (`,
    `  node "${nodeCliPath}" %*`,
    "  exit /b %ERRORLEVEL%",
    ")",
    'if not defined BUN_BINARY where bun >nul 2>nul && set "BUN_BINARY=bun"',
    'if not defined BUN_BINARY if exist "%USERPROFILE%\\.bun\\bin\\bun.exe" set "BUN_BINARY=%USERPROFILE%\\.bun\\bin\\bun.exe"',
    "if not defined BUN_BINARY (",
    `  if exist "${nodeCliPath}" (`,
    `    node "${nodeCliPath}" %*`,
    "    exit /b %ERRORLEVEL%",
    "  )",
    `  echo asterline: bun runtime not found and the node fallback CLI is missing at ${nodeCliPath}; install bun from https://bun.sh or reinstall asterline and force ASTERLINE_RUNTIME=node 1>&2`,
    "  exit /b 127",
    ")",
    `"%BUN_BINARY%" "${cliPath}" %*`,
    ""
  ].join("\r\n");
}
function escapePosixDoubleQuoted(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$").replaceAll("`", "\\`");
}
async function existingNonShim(path) {
  try {
    const stat6 = await lstat3(path);
    if (!stat6.isFile()) return true;
    const content = await readFile7(path, "utf8");
    if (content.includes(COMMAND_SHIM_MARKER)) return false;
    throw new Error(`${path} already exists and is not a generated command shim`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
async function existingNonSymlink(path) {
  try {
    const stat6 = await lstat3(path);
    if (!stat6.isSymbolicLink()) return true;
    await readlink2(path);
    return false;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPathInside(candidatePath, rootPath) {
  const pathFromRoot = relative(rootPath, candidatePath);
  return pathFromRoot === "" || !pathFromRoot.startsWith("..") && !pathFromRoot.startsWith(`..\\`) && !isDriveRelative(pathFromRoot);
}
function isDriveRelative(path) {
  return /^[a-zA-Z]:/.test(path);
}

// ../../../scripts/install/config.mjs
import { mkdir as mkdir6, readFile as readFile9 } from "node:fs/promises";
import { dirname as dirname7 } from "node:path";

// ../../../scripts/install/atomic-write.mjs
import { lstat as lstat4, readlink as readlink3, realpath, rename as rename3, unlink, writeFile as writeFile5 } from "node:fs/promises";
import { basename as basename5, dirname as dirname6, isAbsolute, join as join10, resolve as resolve4 } from "node:path";
var RENAME_RETRY_DELAYS_MS = [10, 25, 50];
var RETRIABLE_RENAME_CODES = /* @__PURE__ */ new Set(["EPERM", "EBUSY"]);
function isRetriableRenameError(error) {
  if (!(error instanceof Error)) return false;
  return RETRIABLE_RENAME_CODES.has(Reflect.get(error, "code"));
}
async function writeFileAtomic(targetPath, data) {
  const writeTarget = await resolveSymlinkTarget(targetPath);
  const temporaryPath = join10(
    dirname6(writeTarget),
    `.tmp-${basename5(writeTarget)}-${process.pid}-${Date.now()}`
  );
  await writeFile5(temporaryPath, data);
  try {
    await renameWithRetry(temporaryPath, writeTarget);
  } catch (renameError) {
    await unlink(temporaryPath).catch(() => {
    });
    throw renameError;
  }
}
async function resolveSymlinkTarget(targetPath) {
  let linkStats;
  try {
    linkStats = await lstat4(targetPath);
  } catch {
    return targetPath;
  }
  if (!linkStats.isSymbolicLink()) return targetPath;
  try {
    return await realpath(targetPath);
  } catch {
    const linkValue = await readlink3(targetPath);
    return isAbsolute(linkValue) ? linkValue : resolve4(dirname6(targetPath), linkValue);
  }
}
async function renameWithRetry(fromPath, toPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename3(fromPath, toPath);
      return;
    } catch (renameError) {
      if (!isRetriableRenameError(renameError) || attempt >= RENAME_RETRY_DELAYS_MS.length) {
        throw renameError;
      }
      await delay(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}
function delay(milliseconds) {
  return new Promise((resolve6) => setTimeout(resolve6, milliseconds));
}

// ../../../scripts/install/toml-editor.mjs
function findTomlSection(config, header) {
  const headerLine = `[${header}]`;
  const lines = config.match(/[^\n]*\n?|$/g) ?? [];
  let offset = 0;
  let start = -1;
  for (const line of lines) {
    if (line.length === 0) break;
    const trimmed = line.trim();
    if (start === -1) {
      if (trimmed === headerLine) start = offset;
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return { start, end: offset, text: config.slice(start, offset) };
    }
    offset += line.length;
  }
  if (start === -1) return null;
  return { start, end: config.length, text: config.slice(start) };
}
function replaceOrInsertSetting(config, section, key, value) {
  const linePattern = new RegExp(`^${escapeRegExp(key)}\\s*=.*$`, "m");
  const replacement = linePattern.test(section.text) ? section.text.replace(linePattern, `${key} = ${value}`) : insertSetting(section.text, key, value);
  return config.slice(0, section.start) + replacement + config.slice(section.end);
}
function removeSetting(config, section, key) {
  const linePattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*(?:\\n|$)`, "m");
  const replacement = section.text.replace(linePattern, "");
  return config.slice(0, section.start) + replacement + config.slice(section.end);
}
function replaceOrInsertRootSetting(config, key, value) {
  const sectionStart = findFirstTableStart(config);
  const root = config.slice(0, sectionStart);
  const suffix = config.slice(sectionStart);
  const linePattern = new RegExp(`^${escapeRegExp(key)}\\s*=.*$`, "m");
  const replacement = linePattern.test(root) ? root.replace(linePattern, `${key} = ${value}`) : `${root.trimEnd()}${root.trimEnd().length > 0 ? "\n" : ""}${key} = ${value}
`;
  if (suffix.length === 0) return replacement;
  return `${replacement.trimEnd()}

${suffix.trimStart()}`;
}
function appendBlock(config, block) {
  const prefix = config.trimEnd();
  return `${prefix}${prefix.length > 0 ? "\n\n" : ""}${block.trimEnd()}
`;
}
function findFirstTableStart(config) {
  const match = config.match(/^[[].*$/m);
  return match?.index ?? config.length;
}
function insertSetting(sectionText, key, value) {
  const lines = sectionText.split("\n");
  lines.splice(1, 0, `${key} = ${value}`);
  return lines.join("\n");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ../../../scripts/install/multi-agent-v2-config.mjs
var ASTERLINE_MULTI_AGENT_V2_HEADER = "features.multi_agent_v2";
var ASTERLINE_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION = 1e4;
function ensureAsterlineMultiAgentV2Config(config) {
  const normalizedConfig = removeLegacyAgentsMaxThreadsSetting(removeFeatureFlagSetting(config, "multi_agent_v2"));
  const section = findTomlSection(normalizedConfig, ASTERLINE_MULTI_AGENT_V2_HEADER);
  const maxThreadsValue = ASTERLINE_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION.toString();
  if (!section) {
    return appendBlock(
      normalizedConfig,
      `[${ASTERLINE_MULTI_AGENT_V2_HEADER}]
max_concurrent_threads_per_session = ${maxThreadsValue}
hide_spawn_agent_metadata = false
`
    );
  }
  const withMaxThreads = replaceOrInsertSetting(
    normalizedConfig,
    section,
    "max_concurrent_threads_per_session",
    maxThreadsValue
  );
  const updatedSection = findTomlSection(withMaxThreads, ASTERLINE_MULTI_AGENT_V2_HEADER);
  return replaceOrInsertSetting(withMaxThreads, updatedSection, "hide_spawn_agent_metadata", "false");
}
function removeFeatureFlagSetting(config, featureName) {
  const section = findTomlSection(config, "features");
  if (!section) return config;
  return removeSetting(config, section, featureName);
}
function removeLegacyAgentsMaxThreadsSetting(config) {
  const section = findTomlSection(config, "agents");
  if (!section) return config;
  return removeSetting(config, section, "max_threads");
}

// ../../../scripts/install/model-catalog.mjs
import { readFile as readFile8 } from "node:fs/promises";
import { join as join11 } from "node:path";
var FALLBACK_ASTERLINE_MODEL_CATALOG = {
  current: {
    model: "gpt-5.5",
    modelContextWindow: 4e5,
    modelReasoningEffort: "high",
    planModeReasoningEffort: "xhigh"
  },
  managedProfiles: [
    {
      model: "gpt-5.5",
      modelContextWindow: 1e6,
      modelReasoningEffort: "high",
      planModeReasoningEffort: "xhigh"
    },
    { model: "gpt-5.5", modelContextWindow: 272e3 }
  ]
};
async function readAsterlineModelCatalog(asterlinePackageRoot) {
  try {
    const parsed = JSON.parse(await readFile8(join11(asterlinePackageRoot, "plugin", "model-catalog.json"), "utf8"));
    return parseAsterlineModelCatalog(parsed) ?? FALLBACK_ASTERLINE_MODEL_CATALOG;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return FALLBACK_ASTERLINE_MODEL_CATALOG;
  }
}
function parseAsterlineModelCatalog(value) {
  if (!isRecord4(value) || !isRecord4(value.current) || !Array.isArray(value.managedProfiles)) return null;
  const { current } = value;
  if (typeof current.model !== "string" || typeof current.model_context_window !== "number" || typeof current.model_reasoning_effort !== "string" || typeof current.plan_mode_reasoning_effort !== "string") {
    return null;
  }
  const managedProfiles = [];
  for (const profile of value.managedProfiles) {
    if (!isRecord4(profile) || !isRecord4(profile.match)) return null;
    managedProfiles.push(parseProfileMatch(profile.match));
  }
  return {
    current: {
      model: current.model,
      modelContextWindow: current.model_context_window,
      modelReasoningEffort: current.model_reasoning_effort,
      planModeReasoningEffort: current.plan_mode_reasoning_effort
    },
    managedProfiles
  };
}
function parseProfileMatch(match) {
  const profile = {};
  if (typeof match.model === "string") profile.model = match.model;
  if (typeof match.model_context_window === "number") profile.modelContextWindow = match.model_context_window;
  if (typeof match.model_reasoning_effort === "string") profile.modelReasoningEffort = match.model_reasoning_effort;
  if (typeof match.plan_mode_reasoning_effort === "string") profile.planModeReasoningEffort = match.plan_mode_reasoning_effort;
  return profile;
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../../../scripts/install/reasoning-config.mjs
var MANAGED_KEYS = ["model", "model_context_window", "model_reasoning_effort", "plan_mode_reasoning_effort"];
function ensureAsterlineReasoningConfig(config, catalog) {
  const current = readRootReasoningSettings(config);
  if (Object.keys(current).length > 0 && !matchesProfile(current, catalog.current) && !catalog.managedProfiles.some((profile) => matchesProfile(current, profile))) {
    return config;
  }
  let next = replaceOrInsertRootSetting(config, "model", JSON.stringify(catalog.current.model));
  next = replaceOrInsertRootSetting(next, "model_context_window", catalog.current.modelContextWindow.toString());
  next = replaceOrInsertRootSetting(
    next,
    "model_reasoning_effort",
    JSON.stringify(catalog.current.modelReasoningEffort)
  );
  next = replaceOrInsertRootSetting(next, "plan_mode_reasoning_effort", JSON.stringify(catalog.current.planModeReasoningEffort));
  return next;
}
function readRootReasoningSettings(config) {
  const settings = {};
  for (const line of config.split(/\n/)) {
    if (isSectionHeader2(line)) break;
    for (const key of MANAGED_KEYS) {
      if (!isRootSetting(line, key)) continue;
      const value = parseTomlScalar(line.slice(line.indexOf("=") + 1));
      if (key === "model" && typeof value === "string") settings.model = value;
      if (key === "model_context_window" && typeof value === "number") settings.modelContextWindow = value;
      if (key === "model_reasoning_effort" && typeof value === "string") settings.modelReasoningEffort = value;
      if (key === "plan_mode_reasoning_effort" && typeof value === "string") settings.planModeReasoningEffort = value;
    }
  }
  return settings;
}
function matchesProfile(current, profile) {
  for (const [key, value] of Object.entries(profile)) {
    if (current[key] !== value) return false;
  }
  return true;
}
function parseTomlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      if (error instanceof SyntaxError) return void 0;
      throw error;
    }
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : void 0;
}
function isSectionHeader2(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}
function isRootSetting(line, key) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#") || trimmed.startsWith("[")) return false;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] === key;
}

// ../../../scripts/install/permissions.mjs
var AUTONASTERLINEUS_FEATURES = ["multi_agent", "child_agents_md", "unified_exec", "goals"];
function ensureAutonomousPermissions(config) {
  let next = replaceOrInsertRootSetting(config, "approval_policy", JSON.stringify("never"));
  next = replaceOrInsertRootSetting(next, "sandbox_mode", JSON.stringify("danger-full-access"));
  next = replaceOrInsertRootSetting(next, "network_access", JSON.stringify("enabled"));
  for (const featureName of AUTONASTERLINEUS_FEATURES) {
    next = ensureFeatureEnabled(next, featureName);
  }
  next = removeWindowsSandboxSetting(next);
  next = ensureNoticeEnabled(next, "hide_full_access_warning");
  return ensureNoticeEnabled(next, "hide_world_writable_warning");
}
function removeWindowsSandboxSetting(config) {
  const section = findTomlSection(config, "windows");
  if (!section) return config;
  return removeSetting(config, section, "sandbox");
}
function ensureNoticeEnabled(config, key) {
  const section = findTomlSection(config, "notice");
  if (!section) return appendNoticeBlock(config, key);
  return replaceOrInsertSetting(config, section, key, "true");
}
function ensureFeatureEnabled(config, key) {
  const section = findTomlSection(config, "features");
  if (!section) return appendBlock(config, `[features]
${key} = true
`);
  return replaceOrInsertSetting(config, section, key, "true");
}
function appendNoticeBlock(config, key) {
  return appendBlock(config, `[notice]
${key} = true
`);
}

// ../../../scripts/install/config.mjs
var LEGACY_ASTERLINE_PLUGIN_MARKETPLACE = ["code", "yeongyu", "asterline", "plugins"].join("-");
var SISYPHUS_LEGACY_MARKETPLACES = ["asterline", LEGACY_ASTERLINE_PLUGIN_MARKETPLACE];
var MANAGED_ASTERLINE_AGENT_NAMES = [
  "asterline-work-reviewer",
  "explorer",
  "librarian",
  "metis",
  "momus",
  "plan"
];
async function updateAsterlineConfig({
  configPath,
  repoRoot,
  marketplaceName,
  marketplaceSource = defaultMarketplaceSource(repoRoot),
  preserveMarketplaceSource = false,
  pluginNames,
  platform = process.platform,
  trustedHookStates = [],
  agentConfigs = [],
  autonomousPermissions = false,
  gitBashEnabled = false
}) {
  await mkdir6(dirname7(configPath), { recursive: true });
  let config = "";
  if (await exists(configPath)) config = await readFile9(configPath, "utf8");
  for (const legacyMarketplaceName of legacyMarketplaceNames(marketplaceName)) {
    config = removeMarketplaceBlock(config, legacyMarketplaceName);
    config = removeStaleMarketplacePluginBlocks(config, legacyMarketplaceName, /* @__PURE__ */ new Set());
    config = removeStaleMarketplaceHookStateBlocks(config, legacyMarketplaceName, /* @__PURE__ */ new Set());
  }
  config = removeStaleMarketplacePluginBlocks(config, marketplaceName, new Set(pluginNames));
  config = removeStaleMarketplaceHookStateBlocks(config, marketplaceName, new Set(pluginNames));
  config = removeStaleManagedAgentBlocks(config, new Set(agentConfigs.map((agentConfig) => agentConfig.name)));
  config = ensureFeatureEnabled2(config, "plugins");
  config = ensureFeatureEnabled2(config, "plugin_hooks");
  config = ensureFeatureEnabled2(config, "multi_agent");
  config = ensureFeatureEnabled2(config, "child_agents_md");
  config = ensureAsterlineReasoningConfig(config, await readAsterlineModelCatalog(repoRoot));
  config = ensureAsterlineMultiAgentV2Config(config);
  if (autonomousPermissions === true) config = ensureAutonomousPermissions(config);
  if (preserveMarketplaceSource !== true) {
    config = ensureMarketplaceBlock(config, marketplaceName, marketplaceSource);
  }
  for (const pluginName of pluginNames) {
    config = ensurePluginEnabled(config, `${pluginName}@${marketplaceName}`);
  }
  config = ensureOmoBuiltinMcpPolicies(config, { marketplaceName, pluginNames, platform, gitBashEnabled });
  for (const state of trustedHookStates) {
    config = ensureHookTrusted(config, state.key, state.trustedHash);
  }
  for (const agentConfig of agentConfigs) {
    config = ensureAgentConfig(config, agentConfig);
  }
  await writeFileAtomic(configPath, config.trimEnd() + "\n");
}
function legacyMarketplaceNames(marketplaceName) {
  return marketplaceName === "sisyphuslabs" ? SISYPHUS_LEGACY_MARKETPLACES : [];
}
function removeMarketplaceBlock(config, marketplaceName) {
  return removeTomlSections(config, (header) => header === `marketplaces.${marketplaceName}`);
}
function defaultMarketplaceSource(repoRoot) {
  return {
    sourceType: "local",
    source: repoRoot
  };
}
function removeStaleMarketplacePluginBlocks(config, marketplaceName, keepPluginNames) {
  return removeTomlSections(config, (header) => {
    const pluginKey = parsePluginHeaderKey(header);
    if (pluginKey === null) return false;
    const suffix = `@${marketplaceName}`;
    if (!pluginKey.endsWith(suffix)) return false;
    return !keepPluginNames.has(pluginKey.slice(0, -suffix.length));
  });
}
function removeStaleMarketplaceHookStateBlocks(config, marketplaceName, keepPluginNames) {
  return removeTomlSections(config, (header) => {
    const prefix = "hooks.state.";
    if (!header.startsWith(prefix)) return false;
    const hookKey = parseJsonString(header.slice(prefix.length));
    if (hookKey === null) return false;
    const separator = hookKey.indexOf(":");
    if (separator === -1) return false;
    const pluginKey = hookKey.slice(0, separator);
    const suffix = `@${marketplaceName}`;
    if (!pluginKey.endsWith(suffix)) return false;
    return !keepPluginNames.has(pluginKey.slice(0, -suffix.length));
  });
}
function removeStaleManagedAgentBlocks(config, keepAgentNames) {
  const managedAgentNames = new Set(MANAGED_ASTERLINE_AGENT_NAMES);
  return splitTomlSections(config).filter((section) => {
    if (section.header === null) return true;
    const agentName = parseAgentHeaderName(section.header);
    if (agentName === null || !managedAgentNames.has(agentName) || keepAgentNames.has(agentName)) return true;
    return !section.text.includes(`config_file = ${JSON.stringify(`./agents/${agentName}.toml`)}`);
  }).map((section) => section.text).join("").replace(/\n{3,}/g, "\n\n");
}
function ensureFeatureEnabled2(config, featureName) {
  const section = findTomlSection(config, "features");
  if (!section) return appendBlock(config, `[features]
${featureName} = true
`);
  return replaceOrInsertSetting(config, section, featureName, "true");
}
function ensureMarketplaceBlock(config, marketplaceName, source) {
  const header = `marketplaces.${marketplaceName}`;
  const block = [
    `[${header}]`,
    `last_updated = "${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z")}"`,
    `source_type = ${JSON.stringify(source.sourceType)}`,
    `source = ${JSON.stringify(source.source)}`,
    source.ref === void 0 ? null : `ref = ${JSON.stringify(source.ref)}`,
    ""
  ].filter((line) => line !== null).join("\n");
  const section = findTomlSection(config, header);
  if (section) return config.slice(0, section.start) + block + config.slice(section.end);
  return appendBlock(config, block);
}
function ensurePluginEnabled(config, pluginKey) {
  const header = `plugins.${JSON.stringify(pluginKey)}`;
  const section = findTomlSection(config, header);
  if (!section) return appendBlock(config, `[${header}]
enabled = true
`);
  return replaceOrInsertSetting(config, section, "enabled", "true");
}
function ensurePluginMcpEnabled(config, pluginKey, serverName, enabled) {
  const header = `plugins.${JSON.stringify(pluginKey)}.mcp_servers.${serverName}`;
  const section = findTomlSection(config, header);
  const enabledValue = enabled ? "true" : "false";
  if (!section) return appendBlock(config, `[${header}]
enabled = ${enabledValue}
`);
  return replaceOrInsertSetting(config, section, "enabled", enabledValue);
}
function ensureOmoBuiltinMcpPolicies(config, { marketplaceName, pluginNames, platform, gitBashEnabled }) {
  if (marketplaceName !== "sisyphuslabs" || !pluginNames.includes("asterline")) return config;
  let nextConfig = ensurePluginMcpEnabled(config, "asterline@sisyphuslabs", "context7", true);
  nextConfig = ensurePluginMcpEnabled(nextConfig, "asterline@sisyphuslabs", "git_bash", platform === "win32" && gitBashEnabled === true);
  return nextConfig;
}
function ensureHookTrusted(config, key, trustedHash) {
  const header = `hooks.state.${JSON.stringify(key)}`;
  const section = findTomlSection(config, header);
  if (!section) return appendBlock(config, `[${header}]
trusted_hash = ${JSON.stringify(trustedHash)}
`);
  return replaceOrInsertSetting(config, section, "trusted_hash", JSON.stringify(trustedHash));
}
function ensureAgentConfig(config, agentConfig) {
  const header = `agents.${tomlKeySegment(agentConfig.name)}`;
  const section = findTomlSection(config, header);
  const configFile = JSON.stringify(agentConfig.configFile);
  if (!section) return appendBlock(config, `[${header}]
config_file = ${configFile}
`);
  return replaceOrInsertSetting(config, section, "config_file", configFile);
}
function tomlKeySegment(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}
function removeTomlSections(config, shouldRemove) {
  return splitTomlSections(config).filter((section) => section.header === null || !shouldRemove(section.header)).map((section) => section.text).join("").replace(/\n{3,}/g, "\n\n");
}
function splitTomlSections(config) {
  const lines = config.match(/[^\n]*\n?|$/g) ?? [];
  const sections = [];
  let current = { header: null, text: "" };
  for (const line of lines) {
    if (line.length === 0) break;
    const header = parseTomlHeader2(line);
    if (header !== null) {
      if (current.text.length > 0) sections.push(current);
      current = { header, text: line };
    } else {
      current.text += line;
    }
  }
  if (current.text.length > 0) sections.push(current);
  return sections;
}
function parseTomlHeader2(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  if (trimmed.startsWith("[[")) return null;
  return trimmed.slice(1, -1);
}
function parsePluginHeaderKey(header) {
  const prefix = "plugins.";
  if (!header.startsWith(prefix)) return null;
  return parseLeadingJsonString2(header.slice(prefix.length));
}
function parseAgentHeaderName(header) {
  const prefix = "agents.";
  if (!header.startsWith(prefix)) return null;
  const key = header.slice(prefix.length);
  return key.startsWith('"') ? parseLeadingJsonString2(key) : key;
}
function parseLeadingJsonString2(value) {
  if (!value.startsWith('"')) return parseJsonString(value);
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') return parseJsonString(value.slice(0, index + 1));
  }
  return null;
}
function parseJsonString(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : null;
  } catch (error) {
    if (error instanceof Error) return null;
    return null;
  }
}

// ../../../scripts/install/git-bash-mcp-env.mjs
import { readFile as readFile10, writeFile as writeFile6 } from "node:fs/promises";
import { join as join12 } from "node:path";
var GIT_BASH_ENV_KEY = "ASTERLINE_GIT_BASH_PATH";
async function stampGitBashMcpEnv({ pluginRoot, env = process.env, platform = process.platform }) {
  if (platform !== "win32") return false;
  const override = typeof env[GIT_BASH_ENV_KEY] === "string" ? env[GIT_BASH_ENV_KEY].trim() : "";
  if (override === "") return false;
  const manifestPath = join12(pluginRoot, ".mcp.json");
  if (!await exists(manifestPath)) return false;
  const parsed = JSON.parse(await readFile10(manifestPath, "utf8"));
  if (!isRecord2(parsed) || !isRecord2(parsed.mcpServers) || !isRecord2(parsed.mcpServers.git_bash)) return false;
  const server = parsed.mcpServers.git_bash;
  const serverEnv = isRecord2(server.env) ? server.env : {};
  if (serverEnv[GIT_BASH_ENV_KEY] === override) return false;
  server.env = { ...serverEnv, [GIT_BASH_ENV_KEY]: override };
  await writeFile6(manifestPath, `${JSON.stringify(parsed, null, "	")}
`);
  return true;
}

// ../../../scripts/install/git-bash.mjs
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
var GIT_BASH_ENV_KEY2 = "ASTERLINE_GIT_BASH_PATH";
var SKIP_GIT_BASH_AUTO_INSTALL_ENV_KEY = "ASTERLINE_SKIP_GIT_BASH_AUTO_INSTALL";
var PROGRAM_FILES_GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
var PROGRAM_FILES_X86_GIT_BASH = "C:\\Program Files (x86)\\Git\\bin\\bash.exe";
var WINGET_INSTALL_ARGS = ["install", "--id", "Git.Git", "-e", "--source", "winget"];
function resolveGitBash({ platform, env, exists: exists2, where }) {
  if (platform !== "win32") return { found: true, path: null, source: "not-required", checkedPaths: [] };
  const checkedPaths = [];
  const envPath = nonEmptyEnvValue2(env, GIT_BASH_ENV_KEY2);
  if (envPath !== void 0) {
    checkedPaths.push(envPath);
    if (isBashExePath(envPath) && exists2(envPath)) return { found: true, path: envPath, source: "env", checkedPaths };
    return missingGitBash(checkedPaths);
  }
  for (const candidate of [
    { path: PROGRAM_FILES_GIT_BASH, source: "program-files" },
    { path: PROGRAM_FILES_X86_GIT_BASH, source: "program-files-x86" }
  ]) {
    checkedPaths.push(candidate.path);
    if (exists2(candidate.path)) return { found: true, path: candidate.path, source: candidate.source, checkedPaths };
  }
  for (const pathCandidate of where("bash")) {
    const candidate = pathCandidate.trim();
    if (candidate.length === 0) continue;
    checkedPaths.push(candidate);
    if (isKnownNonGitBashLauncher(candidate)) continue;
    if (isBashExePath(candidate) && exists2(candidate)) return { found: true, path: candidate, source: "path", checkedPaths };
  }
  return missingGitBash(checkedPaths);
}
function resolveGitBashForCurrentProcess(options = {}) {
  return resolveGitBash({
    platform: options.platform ?? process.platform,
    env: options.env ?? process.env,
    exists: existsSync2,
    where: whereCommand
  });
}
async function prepareGitBashForInstall(options) {
  const resolveGitBashWithDefaults = options.resolveGitBash ?? (() => resolveGitBashForCurrentProcess({ platform: options.platform, env: options.env }));
  const initialResolution = resolveGitBashWithDefaults();
  if (options.platform !== "win32" || initialResolution.found) return initialResolution;
  if (options.env[SKIP_GIT_BASH_AUTO_INSTALL_ENV_KEY] === "1") return initialResolution;
  try {
    await options.runCommand("winget", WINGET_INSTALL_ARGS, { cwd: options.cwd });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return initialResolution;
  }
  return resolveGitBashWithDefaults();
}
function missingGitBash(checkedPaths) {
  return {
    found: false,
    checkedPaths,
    installHint: [
      "Git Bash is required for native Windows Asterline profile installs.",
      "Install it with: winget install --id Git.Git -e --source winget",
      `For a custom install, set ${GIT_BASH_ENV_KEY2}=C:\\path\\to\\bash.exe`,
      "Then rerun `npx asterline-ai install`."
    ].join("\n")
  };
}
function nonEmptyEnvValue2(env, key) {
  const value = env[key];
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length === 0 ? void 0 : trimmed;
}
function isBashExePath(path) {
  return path.toLowerCase().endsWith("bash.exe");
}
var NON_GIT_BASH_LAUNCHER_DIR_SEGMENTS = ["\\windows\\system32\\", "\\microsoft\\windowsapps\\"];
function isKnownNonGitBashLauncher(path) {
  const normalized = path.replaceAll("/", "\\").toLowerCase();
  return NON_GIT_BASH_LAUNCHER_DIR_SEGMENTS.some((segment) => normalized.includes(segment));
}
function whereCommand(command) {
  try {
    return execFileSync("where", [command], { encoding: "utf8" }).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  } catch (error) {
    if (error instanceof Error) return [];
    throw error;
  }
}

// ../../../scripts/install/hook-trust.mjs
import { createHash as createHash2 } from "node:crypto";
import { readFile as readFile11 } from "node:fs/promises";
import { join as join13 } from "node:path";
var EVENT_LABELS = /* @__PURE__ */ new Map([
  ["PreToolUse", "pre_tool_use"],
  ["PermissionRequest", "permission_request"],
  ["PostToolUse", "post_tool_use"],
  ["PreCompact", "pre_compact"],
  ["PostCompact", "post_compact"],
  ["SessionStart", "session_start"],
  ["UserPromptSubmit", "user_prompt_submit"],
  ["SubagentStart", "subagent_start"],
  ["SubagentStop", "subagent_stop"],
  ["Stop", "stop"]
]);
async function trustedHookStatesForPlugin({ marketplaceName, pluginName, pluginRoot }) {
  const manifestPath = join13(pluginRoot, ".augment-plugin", "plugin.json");
  if (!await exists(manifestPath)) return [];
  const manifest = JSON.parse(await readFile11(manifestPath, "utf8"));
  if (!isRecord2(manifest) || typeof manifest.hooks !== "string") return [];
  const hooksPath = join13(pluginRoot, manifest.hooks);
  if (!await exists(hooksPath)) return [];
  const parsed = JSON.parse(await readFile11(hooksPath, "utf8"));
  if (!isRecord2(parsed) || !isRecord2(parsed.hooks)) return [];
  const keySource = `${pluginName}@${marketplaceName}:${stripDotSlash(manifest.hooks)}`;
  const states = [];
  for (const [eventName, groups] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(groups)) continue;
    const eventLabel = EVENT_LABELS.get(eventName);
    if (eventLabel === void 0) continue;
    for (const [groupIndex, group] of groups.entries()) {
      if (!isRecord2(group) || !Array.isArray(group.hooks)) continue;
      for (const [handlerIndex, handler] of group.hooks.entries()) {
        if (!isRecord2(handler) || handler.type !== "command") continue;
        if (handler.async === true) continue;
        if (typeof handler.command !== "string" || handler.command.trim() === "") continue;
        const key = `${keySource}:${eventLabel}:${groupIndex}:${handlerIndex}`;
        states.push({
          key,
          trustedHash: commandHookHash(eventLabel, group.matcher, handler)
        });
      }
    }
  }
  return states;
}
function commandHookHash(eventName, matcher, handler) {
  const command = handler.command;
  const timeout = Math.max(Number(handler.timeout ?? 600), 1);
  const normalizedHandler = {
    type: "command",
    command,
    timeout,
    async: false
  };
  if (typeof handler.statusMessage === "string") normalizedHandler.statusMessage = handler.statusMessage;
  const identity = {
    event_name: eventName,
    hooks: [normalizedHandler]
  };
  if (typeof matcher === "string") identity.matcher = matcher;
  return `sha256:${createHash2("sha256").update(JSON.stringify(canonicalJson(identity))).digest("hex")}`;
}
function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isRecord2(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalJson(value[key]);
  }
  return result;
}
function stripDotSlash(value) {
  return value.startsWith("./") ? value.slice(2) : value;
}

// src/setup.ts
var SETUP_MARKETPLACE_NAME = "sisyphuslabs";
var SETUP_PLUGIN_NAME = "asterline";
var GIT_BASH_INSTALL_HINT = "winget install --id Git.Git -e --source winget";
async function runWorkerSetup(options) {
  const degraded = [];
  const gitBashEnabled = await resolveGitBashStep(options, degraded);
  const agents = await linkBundledAgentsStep(options);
  degraded.push(...agents.degraded);
  await updateConfigStep(options, { agentConfigs: agents.agentConfigs, gitBashEnabled }, degraded);
  await stampGitBashEnvStep(options, degraded);
  await linkComponentBinsStep(options, degraded);
  return { degraded };
}
async function resolveGitBashStep(options, degraded) {
  if (options.platform !== "win32") return false;
  try {
    const resolution = await prepareGitBashForInstall({
      cwd: options.pluginRoot,
      env: options.env,
      platform: options.platform,
      runCommand: options.runCommand ?? defaultRunCommand,
      ...options.resolveGitBash === void 0 ? {} : { resolveGitBash: options.resolveGitBash }
    });
    if (resolution.found) return true;
    degraded.push({
      component: "git-bash",
      hint: GIT_BASH_INSTALL_HINT,
      reason: "Git Bash was not found on this Windows machine; the asterline git_bash MCP server stays disabled"
    });
  } catch (error) {
    degraded.push({
      component: "git-bash",
      hint: GIT_BASH_INSTALL_HINT,
      reason: `Git Bash preflight failed: ${errorMessage(error)}`
    });
  }
  return false;
}
async function linkBundledAgentsStep(options) {
  const agentsTarget = join14(options.asterlineHome, "agents");
  try {
    const stageRoot = join14(options.pluginData, "bootstrap", "agents-stage");
    await stageBundledAgents(options.pluginRoot, stageRoot);
    const preservedReasoning = await capturePreservedAgentReasoning({ asterlineHome: options.asterlineHome });
    const preservedServiceTier = await capturePreservedAgentServiceTier({ asterlineHome: options.asterlineHome });
    const linked = await linkCachedPluginAgents({
      asterlineHome: options.asterlineHome,
      pluginRoot: stageRoot,
      preservedReasoning,
      preservedServiceTier
    });
    const agentConfigs = linked.map((link) => ({ configFile: `./agents/${link.name}`, name: agentNameFromToml2(link.name) })).sort((left, right) => left.name.localeCompare(right.name));
    return { agentConfigs, degraded: [] };
  } catch (error) {
    return {
      agentConfigs: [],
      degraded: [
        {
          component: "agents",
          hint: BOOTSTRAP_DOCTOR_HINT,
          reason: `failed to link bundled agents into ${agentsTarget}: ${errorMessage(error)}`
        }
      ]
    };
  }
}
async function stageBundledAgents(pluginRoot, stageRoot) {
  await rm7(stageRoot, { force: true, recursive: true });
  await mkdir7(stageRoot, { recursive: true });
  const componentsRoot = join14(pluginRoot, "components");
  for (const componentName of await directoryNames(componentsRoot)) {
    const agentsDir = join14(componentsRoot, componentName, "agents");
    const agentFiles = (await fileNames(agentsDir)).filter((name) => name.endsWith(".toml"));
    if (agentFiles.length === 0) continue;
    const stagedAgentsDir = join14(stageRoot, "components", componentName, "agents");
    await mkdir7(stagedAgentsDir, { recursive: true });
    for (const agentFile of agentFiles) {
      await copyFile2(join14(agentsDir, agentFile), join14(stagedAgentsDir, agentFile));
    }
  }
}
async function updateConfigStep(options, inputs, degraded) {
  const configPath = join14(options.asterlineHome, "config.toml");
  try {
    await assertWritableConfigIfPresent(configPath);
    const trustedHookStates = await trustedHookStatesForPlugin({
      marketplaceName: SETUP_MARKETPLACE_NAME,
      pluginName: SETUP_PLUGIN_NAME,
      pluginRoot: options.pluginRoot
    });
    await updateAsterlineConfig({
      agentConfigs: inputs.agentConfigs,
      // Hard invariant: the bootstrap worker NEVER writes permission keys
      // (approval/sandbox/network policies stay installer-flag-only).
      autonomousPermissions: false,
      configPath,
      gitBashEnabled: inputs.gitBashEnabled,
      marketplaceName: SETUP_MARKETPLACE_NAME,
      platform: options.platform,
      pluginNames: [SETUP_PLUGIN_NAME],
      preserveMarketplaceSource: true,
      // The marketplace plugin tree has no <root>/plugin/model-catalog.json,
      // so updateAsterlineConfig falls back to the catalog bundled into this
      // dist; bootstrap-setup.test.mjs guards against drift between the two.
      repoRoot: options.pluginRoot,
      trustedHookStates
    });
  } catch (error) {
    degraded.push({
      component: "config",
      hint: BOOTSTRAP_DOCTOR_HINT,
      reason: `failed to update ${configPath}: ${errorMessage(error)}`
    });
  }
}
async function assertWritableConfigIfPresent(configPath) {
  try {
    if (((await stat4(configPath)).mode & 146) === 0) throw new Error(`${configPath} has no write permission bits set`);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
}
function errorCode(error) {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
async function linkComponentBinsStep(options, degraded) {
  const binDir = resolveAsterlineInstallerBinDir({ asterlineHome: options.asterlineHome, env: options.env });
  try {
    await linkCachedPluginBins({ binDir, pluginRoot: options.pluginRoot, platform: options.platform });
  } catch (error) {
    degraded.push({
      component: "bin-links",
      hint: BOOTSTRAP_DOCTOR_HINT,
      reason: `failed to link component bins into ${binDir}: ${errorMessage(error)}`
    });
  }
  await linkRuntimeWrapperStep(options, binDir, degraded);
}
async function linkRuntimeWrapperStep(options, binDir, degraded) {
  const cliPath = join14(options.pluginRoot, "dist", "cli", "index.js");
  try {
    const linked = await linkRootRuntimeBin({
      binDir,
      asterlineHome: options.asterlineHome,
      platform: options.platform,
      repoRoot: options.pluginRoot
    });
    if (linked !== null) return;
    degraded.push({
      component: "asterline-cli",
      hint: "use npx asterline-ai for the asterline CLI",
      reason: "marketplace payload has no dist/cli"
    });
    await appendBootstrapLog(options.pluginData, options.now ?? Date.now(), "asterline-cli-degraded", {
      warning: `Warning: skipped the asterline runtime wrapper because ${cliPath} is missing; asterline sparkshell/work-loop commands will be unavailable until a package shipping dist/cli is installed`
    });
  } catch (error) {
    degraded.push({
      component: "asterline-cli",
      hint: BOOTSTRAP_DOCTOR_HINT,
      reason: `failed to link the asterline runtime wrapper into ${binDir}: ${errorMessage(error)}`
    });
  }
}
async function stampGitBashEnvStep(options, degraded) {
  try {
    await stampGitBashMcpEnv({ env: options.env, platform: options.platform, pluginRoot: options.pluginRoot });
  } catch (error) {
    degraded.push({
      component: "git-bash-env",
      hint: BOOTSTRAP_DOCTOR_HINT,
      reason: `failed to stamp ${join14(options.pluginRoot, ".mcp.json")}: ${errorMessage(error)}`
    });
  }
}
var execFileAsync2 = promisify2(execFile2);
async function defaultRunCommand(command, args, options) {
  return execFileAsync2(command, [...args], { cwd: options.cwd });
}
async function directoryNames(root) {
  return entryNames(root, (entry) => entry.isDirectory());
}
async function fileNames(root) {
  return entryNames(root, (entry) => entry.isFile());
}
async function entryNames(root, keep) {
  try {
    const entries = await readdir3(root, { withFileTypes: true });
    return entries.filter((entry) => keep(entry)).map((entry) => entry.name).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
function agentNameFromToml2(fileName) {
  return fileName.endsWith(".toml") ? fileName.slice(0, -".toml".length) : fileName;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/worker.ts
var BOOTSTRAP_DOCTOR_HINT = "npx asterline-ai doctor";
function parseWorkerFlags(argv) {
  let asterlineHome;
  let manifestDir;
  let once = false;
  let only;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--once") {
      once = true;
      continue;
    }
    if (flag === "--asterline-home") {
      asterlineHome = requireFlagValue(argv, index, flag);
      index += 1;
      continue;
    }
    if (flag === "--only") {
      only = requireFlagValue(argv, index, flag);
      index += 1;
      continue;
    }
    if (flag === "--manifest-dir") {
      manifestDir = requireFlagValue(argv, index, flag);
      index += 1;
      continue;
    }
    throw new Error(`unknown worker flag: ${flag}`);
  }
  return {
    once,
    ...asterlineHome === void 0 ? {} : { asterlineHome },
    ...manifestDir === void 0 ? {} : { manifestDir },
    ...only === void 0 ? {} : { only }
  };
}
function resolvePluginDataRoot(env) {
  const fromEnv = env["PLUGIN_DATA"]?.trim();
  if (fromEnv !== void 0 && fromEnv.length > 0) return fromEnv;
  return join15(homedir4(), ".local", "share", "asterline");
}
async function readPluginVersion(pluginRoot) {
  try {
    const parsed = JSON.parse(await readFile12(join15(pluginRoot, ".augment-plugin", "plugin.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return void 0;
    const version = parsed["version"];
    if (typeof version !== "string") return void 0;
    const trimmed = version.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  } catch {
    return void 0;
  }
}
async function readBootstrapState(statePath) {
  return parseBootstrapState(await readState(statePath));
}
function parseBootstrapState(raw) {
  const completedForVersion = typeof raw["completedForVersion"] === "string" ? raw["completedForVersion"] : void 0;
  const lastAttemptAt = typeof raw["lastAttemptAt"] === "number" ? raw["lastAttemptAt"] : void 0;
  const lastStatus = raw["lastStatus"] === "success" || raw["lastStatus"] === "degraded" ? raw["lastStatus"] : void 0;
  const degraded = parseDegradedEntries(raw["degraded"]);
  return {
    ...completedForVersion === void 0 ? {} : { completedForVersion },
    ...lastAttemptAt === void 0 ? {} : { lastAttemptAt },
    ...lastStatus === void 0 ? {} : { lastStatus },
    ...degraded === void 0 ? {} : { degraded }
  };
}
function defaultWorkerSteps(seams = {}) {
  return [
    {
      name: "setup",
      run: (context) => runWorkerSetup(context)
    },
    {
      name: "sg",
      run: (context) => runSgProvision(context, seams.sg)
    }
  ];
}
async function runBootstrapWorker(options = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const platform = options.platform ?? process.platform;
  const flags = parseWorkerFlags(options.argv ?? []);
  const steps = options.steps ?? defaultWorkerSteps();
  const pluginRoot = resolvePluginRoot(env);
  const pluginData = resolvePluginDataRoot(env);
  const statePath = resolveBootstrapStatePath(pluginData);
  const lockEnv = { ...env, PLUGIN_DATA: pluginData };
  const locks = await bootstrapLocks({ env: lockEnv, now, pluginData });
  if (locks === null) return { ran: false, reason: "locked" };
  try {
    const pluginVersion = await readPluginVersion(pluginRoot);
    const marker = await readBootstrapState(statePath);
    if (!flags.once && pluginVersion !== void 0 && marker.completedForVersion === pluginVersion) {
      await appendBootstrapLog(pluginData, now, "worker-skipped", { reason: "already-completed", version: pluginVersion });
      return { ran: false, reason: "already-completed" };
    }
    const asterlineHome = flags.asterlineHome ?? (await resolveAsterlineHome({ env, pluginRoot })).path;
    const context = { asterlineHome, env, flags, now, platform, pluginData, pluginRoot, pluginVersion };
    await appendBootstrapLog(pluginData, now, "worker-started", { version: pluginVersion ?? "unknown" });
    const degraded = [];
    if (pluginVersion === void 0) {
      degraded.push({
        component: "bootstrap",
        hint: BOOTSTRAP_DOCTOR_HINT,
        reason: `plugin version unresolved from ${join15(pluginRoot, ".augment-plugin", "plugin.json")}`
      });
    }
    for (const step of steps) {
      if (flags.only !== void 0 && step.name !== flags.only) continue;
      degraded.push(...await runStep(step, context));
    }
    const status = degraded.length === 0 ? "success" : "degraded";
    const state = {
      ...pluginVersion === void 0 ? {} : { completedForVersion: pluginVersion },
      degraded,
      lastAttemptAt: now,
      lastStatus: status
    };
    await writeState(statePath, state);
    await appendBootstrapLog(pluginData, now, "worker-finished", { degradedCount: degraded.length, status });
    return { degraded, ran: true, statePath, status };
  } finally {
    await locks.release();
  }
}
async function runStep(step, context) {
  try {
    return (await step.run(context)).degraded;
  } catch (error) {
    return [
      {
        component: step.name,
        hint: BOOTSTRAP_DOCTOR_HINT,
        reason: error instanceof Error ? error.message : String(error)
      }
    ];
  }
}
function resolvePluginRoot(env) {
  const fromEnv = env["PLUGIN_ROOT"]?.trim();
  if (fromEnv !== void 0 && fromEnv.length > 0) return fromEnv;
  return resolve5(dirname8(fileURLToPath2(import.meta.url)), "..", "..", "..");
}
async function appendBootstrapLog(pluginData, now, event, details) {
  try {
    const logPath = join15(pluginData, "bootstrap", "bootstrap.log");
    await mkdir8(dirname8(logPath), { recursive: true });
    await appendFile2(logPath, `${JSON.stringify({ timestamp: new Date(now).toISOString(), event, ...details })}
`);
  } catch {
  }
}
function parseDegradedEntries(raw) {
  if (!Array.isArray(raw)) return void 0;
  const entries = [];
  for (const candidate of raw) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const record = candidate;
    if (typeof record["component"] !== "string" || typeof record["reason"] !== "string") continue;
    entries.push({
      component: record["component"],
      reason: record["reason"],
      ...typeof record["hint"] === "string" ? { hint: record["hint"] } : {}
    });
  }
  return entries;
}
function requireFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === void 0 || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

// src/hook.ts
var BOOTSTRAP_RESTART_NOTICE = "Asterline bootstrap running in background \u2014 restart the session when it completes";
async function runSessionStartHook(options) {
  return (await executeSessionStartHook(options)).exitCode;
}
async function executeSessionStartHook(options) {
  if (options.stdin !== void 0) await drainStdin(options.stdin);
  const now = options.now ?? Date.now();
  const pluginRoot = options.env["PLUGIN_ROOT"]?.trim();
  const pluginData = options.env["PLUGIN_DATA"]?.trim();
  if (pluginRoot === void 0 || pluginRoot.length === 0 || pluginData === void 0 || pluginData.length === 0) {
    return { action: "skip-missing-env", exitCode: 0 };
  }
  const pluginVersion = await readPluginVersion(pluginRoot);
  if (pluginVersion === void 0) return { action: "skip-version-unresolved", exitCode: 0 };
  const state = await readBootstrapState(resolveBootstrapStatePath(pluginData));
  if (state.completedForVersion === pluginVersion) return { action: "skip-completed", exitCode: 0 };
  if (await isLockFresh(resolveBootstrapLockPath(pluginData), now)) return { action: "skip-locked", exitCode: 0 };
  const spawnWorker = options.spawnWorker ?? spawnDetachedWorker;
  spawnWorker({
    args: [options.workerCliPath ?? defaultWorkerCliPath(), "worker"],
    command: process.execPath,
    env: options.env
  });
  const writeNotice = options.writeNotice ?? ((line) => process.stdout.write(`${line}
`));
  writeNotice(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: BOOTSTRAP_RESTART_NOTICE
      }
    })
  );
  return { action: "spawned", exitCode: 0 };
}
function spawnDetachedWorker(invocation) {
  const child = spawn(invocation.command, [...invocation.args], {
    detached: true,
    env: invocation.env,
    stdio: "ignore"
  });
  child.unref();
}
function defaultWorkerCliPath() {
  return fileURLToPath3(import.meta.url);
}
async function isLockFresh(lockPath, now) {
  try {
    const lockStat = await stat5(lockPath);
    return now - lockStat.mtimeMs < DEFAULT_LOCK_STALE_MS;
  } catch {
    return false;
  }
}
async function drainStdin(stdin) {
  if (stdin.isTTY === true) return;
  for await (const chunk of stdin) {
    void chunk;
  }
}

// src/cli.ts
var TOP_LEVEL_HELP = "Usage:\n  asterline-bootstrap hook session-start\n  asterline-bootstrap worker [--asterline-home <dir>] [--once] [--only <step>] [--manifest-dir <dir>]\n  asterline-bootstrap download <manifest> <platform> <destination-dir>\n  asterline-bootstrap help | --help | -h\n";
async function runDownloadCommand(args) {
  const [manifestName, platformKey, destinationDir] = args;
  if (manifestName === void 0 || platformKey === void 0 || destinationDir === void 0) {
    process.stderr.write(`[asterline-bootstrap] download requires <manifest> <platform> <destination-dir>
${TOP_LEVEL_HELP}`);
    return 1;
  }
  try {
    const destination = await downloadFromManifest({ destinationDir, manifestName, platformKey });
    process.stdout.write(`OK:${destination}
`);
    return 0;
  } catch (error) {
    process.stderr.write(`[asterline-bootstrap] download failed: ${error instanceof Error ? error.message : String(error)}
`);
    return 1;
  }
}
async function runWorkerCommand(args) {
  let result;
  try {
    result = await runBootstrapWorker({ argv: args, env: process.env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/flag/.test(message)) {
      process.stderr.write(`[asterline-bootstrap] ${message}
${TOP_LEVEL_HELP}`);
      return 1;
    }
    process.stderr.write(`[asterline-bootstrap] worker error: ${message}
`);
    return 0;
  }
  process.stdout.write(
    result.ran ? `[asterline-bootstrap] worker finished: ${result.status}
` : `[asterline-bootstrap] worker skipped: ${result.reason}
`
  );
  return 0;
}
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === void 0 || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(TOP_LEVEL_HELP);
    return 0;
  }
  if (command === "hook" && argv[1] === "session-start") {
    return runSessionStartHook({ env: process.env, stdin: process.stdin });
  }
  if (command === "worker") {
    return runWorkerCommand(argv.slice(1));
  }
  if (command === "download") {
    return runDownloadCommand(argv.slice(1));
  }
  process.stderr.write(`[asterline-bootstrap] unknown command: ${argv.join(" ")}
${TOP_LEVEL_HELP}`);
  return 1;
}
function isProcessEntry() {
  const entry = process.argv[1];
  if (entry === void 0) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath4(import.meta.url));
  } catch {
    return false;
  }
}
if (isProcessEntry()) {
  main().then((code) => {
    process.exit(code);
  }).catch((error) => {
    process.stderr.write(`[asterline-bootstrap] ${error instanceof Error ? error.message : String(error)}
`);
    process.exit(0);
  });
}
export {
  BOOTSTRAP_DOCTOR_HINT,
  BOOTSTRAP_RESTART_NOTICE,
  GIT_BASH_INSTALL_HINT,
  INSTALL_SNAPSHOT_FILENAME,
  SETUP_MARKETPLACE_NAME,
  SETUP_PLUGIN_NAME,
  SG_FORCE_PROVISION_ENV_KEY,
  SG_PROVISION_COMPONENT,
  appendBootstrapLog,
  bootstrapLocks,
  defaultWorkerSteps,
  detectInstallFlow,
  detectInstallFlowDetailed,
  detectInstallFlowForTest,
  detectInstallFlowFromEnvironment,
  executeSessionStartHook,
  parseBootstrapState,
  parseWorkerFlags,
  readBootstrapState,
  readPluginVersion,
  resolveBootstrapLockPath,
  resolveBootstrapStatePath,
  resolveAsterlineHome,
  resolvePluginDataRoot,
  runBootstrapWorker,
  runSessionStartHook,
  runSgProvision,
  runWorkerSetup,
  sgProvisionDestination
};
