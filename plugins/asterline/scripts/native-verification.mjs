import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { chmod, lstat, mkdir, realpath } from "node:fs/promises"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path"

const COMMAND_SHIMS = new Set([".bat", ".cmd"])

function unavailable(code, message) {
  return { status: "unavailable", code, message }
}

function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code
}

function contained(root, candidate) {
  const displacement = relative(root, candidate)
  return displacement === "" || (!displacement.startsWith(`..${sep}`) && displacement !== ".." && !isAbsolute(displacement))
}

async function sha256File(path) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

export async function verifyNativeExecutable(options) {
  const cacheRoot = resolve(options.cacheRoot)
  const executablePath = resolve(options.executablePath)
  if (!contained(cacheRoot, executablePath)) return unavailable("unsafe_cache_path", `native executable escapes cache root: ${executablePath}`)
  if (options.platform === "win32" && COMMAND_SHIMS.has(extname(executablePath).toLowerCase())) {
    return unavailable("unsafe_command_shim", `Windows command shim execution is disabled: ${executablePath}`)
  }
  try {
    const rootInfo = await lstat(cacheRoot)
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) return unavailable("unsafe_cache_path", `native cache root is not a real directory: ${cacheRoot}`)
    let cursor = cacheRoot
    for (const segment of relative(cacheRoot, executablePath).split(sep)) {
      cursor = resolve(cursor, segment)
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) return unavailable("unsafe_cache_path", `native cache path contains a symbolic link: ${cursor}`)
    }
    const rootRealpath = await realpath(cacheRoot)
    const executableRealpath = await realpath(executablePath)
    if (!contained(rootRealpath, executableRealpath)) return unavailable("unsafe_cache_path", `native executable realpath escapes cache root: ${executableRealpath}`)
    const info = await lstat(executablePath)
    if (!info.isFile()) return unavailable("unsafe_cache_path", `native executable is not a regular file: ${executablePath}`)
    const actualSha256 = await sha256File(executablePath)
    if (actualSha256 !== options.expectedSha256) {
      return unavailable("integrity_mismatch", `native executable checksum mismatch: expected ${options.expectedSha256}, got ${actualSha256}`)
    }
    return { status: "verified", executablePath }
  } catch (error) {
    if (hasCode(error, "ENOENT")) return unavailable("missing_or_unhealthy", `native executable is missing: ${executablePath}`)
    if (error instanceof Error) return unavailable("verification_failed", error.message)
    throw error
  }
}

export async function hardenNativeDirectories(cacheRoot, finalRoot) {
  const root = resolve(cacheRoot)
  const final = resolve(finalRoot)
  if (!contained(root, final)) throw new Error(`native install path escapes cache root: ${final}`)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`native cache root is not a real directory: ${root}`)
  await chmod(root, 0o700)
  let cursor = root
  for (const segment of relative(root, final).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    try {
      await mkdir(cursor, { mode: 0o700 })
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error
    }
    const info = await lstat(cursor)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`native install path contains a non-directory or symbolic link: ${cursor}`)
    await chmod(cursor, 0o700)
  }
  const rootRealpath = await realpath(root)
  const finalRealpath = await realpath(final)
  if (!contained(rootRealpath, finalRealpath)) throw new Error(`native install realpath escapes cache root: ${finalRealpath}`)
}

export async function hardenExecutableParents(root, executablePath) {
  await hardenNativeDirectories(root, dirname(executablePath))
  await chmod(executablePath, 0o700)
}
