import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, rename, rm } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

import { extractNativeArchive, NativeArchiveError } from "./native-archive.mjs"
import { probeExecutable } from "./native-probe.mjs"

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
const SHA256 = /^[0-9a-f]{64}$/, SLUG = /^(darwin|linux|win32)-(arm64|x64)$/

export class NativeManifestError extends Error {
  constructor(message) {
    super(message)
    this.name = "NativeManifestError"
  }
}

function record(value, path, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new NativeManifestError(`${path} must be an object`)
  const allowed = fields.map((field) => field.replace(/\?$/, ""))
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new NativeManifestError(`${path} has unknown field ${key}`)
  for (const field of fields) if (!field.endsWith("?") && !(field in value)) throw new NativeManifestError(`${path} is missing ${field}`)
  return value
}

function text(value, path, pattern) {
  if (typeof value !== "string" || value.length === 0 || (pattern !== undefined && !pattern.test(value))) {
    throw new NativeManifestError(`${path} is invalid`)
  }
  return value
}

function httpsUrl(value, path) {
  const raw = text(value, path)
  let parsed
  try { parsed = new URL(raw) } catch (error) {
    if (error instanceof TypeError) throw new NativeManifestError(`${path} must be an HTTPS URL`)
    throw error
  }
  if (parsed.protocol !== "https:") throw new NativeManifestError(`${path} must be an HTTPS URL`)
  return raw
}

function safeRelativePath(value, path) {
  const raw = text(value, path)
  if (raw.includes("\\") || raw.includes("\0") || isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) throw new NativeManifestError(`${path} is unsafe`)
  const parts = raw.split("/")
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new NativeManifestError(`${path} is unsafe`)
  return raw
}

function parseAsset(value, path) {
  const raw = record(value, path, ["archive", "executable", "sha256", "url"])
  if (!["tar.gz", "tgz", "zip"].includes(raw.archive)) throw new NativeManifestError(`${path}.archive is invalid`)
  safeRelativePath(raw.executable, `${path}.executable`)
  text(raw.sha256, `${path}.sha256`, SHA256)
  httpsUrl(raw.url, `${path}.url`)
  return raw
}

function parseComponent(value, index) {
  const path = `components[${index}]`
  const raw = record(value, path, ["id", "version", "license", "source", "probe", "assets"])
  text(raw.id, `${path}.id`, /^[a-z0-9][a-z0-9-]*$/)
  text(raw.version, `${path}.version`)
  const license = record(raw.license, `${path}.license`, ["spdx", "provenance"])
  text(license.spdx, `${path}.license.spdx`)
  httpsUrl(license.provenance, `${path}.license.provenance`)
  const source = record(raw.source, `${path}.source`, ["repository", "revision"])
  httpsUrl(source.repository, `${path}.source.repository`)
  text(source.revision, `${path}.source.revision`, /^[0-9a-f]{40}$/)
  const probe = record(raw.probe, `${path}.probe`, ["args", "expectedExit", "expectedStdout", "timeoutMs"])
  if (!Array.isArray(probe.args) || probe.args.length > 8 || probe.args.some((arg) => typeof arg !== "string")) throw new NativeManifestError(`${path}.probe.args is invalid`)
  if (!Number.isInteger(probe.expectedExit) || probe.expectedExit < 0 || probe.expectedExit > 255) throw new NativeManifestError(`${path}.probe.expectedExit is invalid`)
  text(probe.expectedStdout, `${path}.probe.expectedStdout`)
  if (!Number.isInteger(probe.timeoutMs) || probe.timeoutMs < 100 || probe.timeoutMs > 30_000) throw new NativeManifestError(`${path}.probe.timeoutMs is invalid`)
  if (raw.assets === null || typeof raw.assets !== "object" || Array.isArray(raw.assets)) throw new NativeManifestError(`${path}.assets must be an object`)
  const assets = raw.assets
  const entries = Object.entries(assets)
  if (entries.length === 0) throw new NativeManifestError(`${path}.assets must not be empty`)
  for (const [slug, asset] of entries) {
    text(slug, `${path}.assets key`, SLUG)
    parseAsset(asset, `${path}.assets.${slug}`)
  }
  return raw
}

export function validateNativeSbom(value) {
  const raw = record(value, "manifest", ["$schema?", "schemaVersion", "components"])
  if (raw.schemaVersion !== 1) throw new NativeManifestError("manifest.schemaVersion must be 1")
  if (!Array.isArray(raw.components) || raw.components.length === 0) throw new NativeManifestError("manifest.components must not be empty")
  const ids = new Set()
  for (const [index, component] of raw.components.entries()) {
    const parsed = parseComponent(component, index)
    if (ids.has(parsed.id)) throw new NativeManifestError(`manifest has duplicate component ${parsed.id}`)
    ids.add(parsed.id)
  }
  return value
}

function unavailable(code, message) {
  return { status: "unavailable", code, message }
}

export function selectNativeAsset({ sbom, toolId, platform = process.platform, arch = process.arch }) {
  validateNativeSbom(sbom)
  const tool = sbom.components.find((candidate) => candidate.id === toolId)
  if (tool === undefined) return unavailable("unknown_tool", `native tool ${toolId} is not pinned`)
  const slug = `${platform}-${arch}`
  const asset = tool.assets[slug]
  if (asset === undefined) return unavailable("unsupported_platform", `${tool.id} ${tool.version} has no asset for ${slug}`)
  return { status: "selected", tool, asset, slug, platform }
}

export async function nativeAssetDoctor(options) {
  const selection = selectNativeAsset(options)
  if (selection.status === "unavailable") return selection
  const executablePath = join(options.cacheRoot, selection.tool.id, selection.tool.version, selection.slug, selection.asset.executable)
  const probe = await probeExecutable({ executablePath, probe: selection.tool.probe, platform: selection.platform })
  if (!probe.ok) return unavailable("missing_or_unhealthy", `${selection.tool.id} ${selection.tool.version} is unavailable: ${probe.error}`)
  return { status: "available", executablePath, probe }
}

function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code
}

async function acquireInstallLock(lockPath) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(lockPath)
      return () => rm(lockPath, { recursive: true, force: true })
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error
      await new Promise((resolveWait) => setTimeout(resolveWait, 25))
    }
  }
  throw new Error(`timed out waiting for native install lock ${lockPath}`)
}

async function publishStagedInstall(options) {
  await mkdir(dirname(options.finalRoot), { recursive: true })
  const release = await acquireInstallLock(`${options.finalRoot}.lock`)
  try {
    const existing = await nativeAssetDoctor(options.doctorOptions)
    if (existing.status === "available") return existing
    const backup = `${options.finalRoot}.backup-${randomUUID()}`
    let movedExisting = false
    try {
      await rename(options.finalRoot, backup)
      movedExisting = true
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error
    }
    try {
      await rename(options.stage, options.finalRoot)
      if (movedExisting) await rm(backup, { recursive: true, force: true })
      return null
    } catch (error) {
      if (movedExisting) {
        await rm(options.finalRoot, { recursive: true, force: true })
        await rename(backup, options.finalRoot)
      }
      throw error
    }
  } finally {
    await release()
  }
}

export async function provisionNativeAsset(options) {
  const selection = selectNativeAsset(options)
  if (selection.status === "unavailable") return selection
  const existing = await nativeAssetDoctor(options)
  if (existing.status === "available") return existing
  if (options.allowDownload !== true) return unavailable("download_disabled", `${selection.tool.id} download requires explicit allowDownload=true`)
  let bytes
  try {
    const activeFetch = options.fetchImpl ?? globalThis.fetch
    const response = await activeFetch(selection.asset.url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) return unavailable("download_failed", `download failed with HTTP ${response.status}`)
    const declaredLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) return unavailable("archive_too_large", "download exceeds archive limit")
    bytes = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof Error) return unavailable("download_failed", error.message)
    throw error
  }
  if (bytes.length > MAX_ARCHIVE_BYTES) return unavailable("archive_too_large", "download exceeds archive limit")
  const actual = createHash("sha256").update(bytes).digest("hex")
  if (actual !== selection.asset.sha256) return unavailable("checksum_mismatch", `checksum mismatch: expected ${selection.asset.sha256}, got ${actual}`)
  const cacheRoot = resolve(options.cacheRoot)
  const stage = join(dirname(cacheRoot), `.${basename(cacheRoot)}-native-${randomUUID()}`)
  const executablePath = join(stage, selection.asset.executable)
  try {
    await extractNativeArchive({ bytes, format: selection.asset.archive, destination: stage })
    await chmod(executablePath, 0o755)
    const probe = await probeExecutable({ executablePath, probe: selection.tool.probe, platform: selection.platform })
    if (!probe.ok) return unavailable("probe_failed", probe.error)
    const finalRoot = join(cacheRoot, selection.tool.id, selection.tool.version, selection.slug)
    const existingAfterLock = await publishStagedInstall({ stage, finalRoot, doctorOptions: { ...options, cacheRoot } })
    if (existingAfterLock !== null) return existingAfterLock
    return { status: "available", executablePath: join(finalRoot, selection.asset.executable), probe }
  } catch (error) {
    if (error instanceof NativeArchiveError) return unavailable("unsafe_archive", error.message)
    if (error instanceof Error) return unavailable("install_failed", error.message)
    throw error
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
