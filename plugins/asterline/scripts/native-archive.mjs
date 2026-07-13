import { mkdir, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { gunzipSync, inflateRawSync } from "node:zlib"

const MAX_EXPANDED_BYTES = 256 * 1024 * 1024
const MAX_ENTRY_BYTES = 128 * 1024 * 1024
const MAX_FILES = 2048

export class NativeArchiveError extends Error {
  constructor(message, options = {}) {
    super(message, options)
    this.name = "NativeArchiveError"
  }
}

function safeArchivePath(name) {
  if (name.length === 0 || name.includes("\\") || name.includes("\0") || isAbsolute(name) || /^[A-Za-z]:/.test(name)) throw new NativeArchiveError(`archive entry ${name} is unsafe`)
  if (name.split("/").some((part) => part === "" || part === "." || part === "..")) throw new NativeArchiveError(`archive entry ${name} is unsafe`)
  return name
}

function tarEntries(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES })
  const entries = []
  let cursor = 0
  let expanded = 0
  while (cursor + 512 <= tar.length) {
    const header = tar.subarray(cursor, cursor + 512)
    if (header.every((byte) => byte === 0)) break
    if (entries.length >= MAX_FILES) throw new NativeArchiveError("archive has too many entries")
    const storedChecksum = Number.parseInt(header.subarray(148, 156).toString("ascii").replace(/\0.*$/, "").trim(), 8)
    const checksumHeader = Buffer.from(header)
    checksumHeader.fill(0x20, 148, 156)
    const actualChecksum = [...checksumHeader].reduce((total, value) => total + value, 0)
    if (!Number.isSafeInteger(storedChecksum) || storedChecksum !== actualChecksum) throw new NativeArchiveError("tar header checksum mismatch")
    const nul = header.indexOf(0, 0)
    const name = header.subarray(0, nul < 0 || nul > 100 ? 100 : nul).toString("utf8")
    const sizeRaw = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim()
    const size = Number.parseInt(sizeRaw || "0", 8)
    const type = String.fromCharCode(header[156] ?? 0)
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_BYTES) throw new NativeArchiveError("archive entry size is invalid")
    if (!["\0", "0", "5"].includes(type)) throw new NativeArchiveError(`archive contains unsupported special entry ${name}`)
    const entryName = safeArchivePath(name.replace(/\/$/, ""))
    const start = cursor + 512
    const end = start + size
    if (end > tar.length) throw new NativeArchiveError("tar entry exceeds archive")
    expanded += size
    if (expanded > MAX_EXPANDED_BYTES) throw new NativeArchiveError("archive expands beyond limit")
    entries.push({ name: entryName, bytes: tar.subarray(start, end), directory: type === "5" || name.endsWith("/") })
    cursor = start + Math.ceil(size / 512) * 512
  }
  return entries
}

function findEocd(zip) {
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset -= 1) if (zip.readUInt32LE(offset) === 0x06054b50) return offset
  throw new NativeArchiveError("archive is not a ZIP file")
}

function zipEntries(zip) {
  const eocd = findEocd(zip)
  const count = zip.readUInt16LE(eocd + 10)
  if (count > MAX_FILES) throw new NativeArchiveError("archive has too many entries")
  let cursor = zip.readUInt32LE(eocd + 16)
  let expanded = 0
  const entries = []
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) throw new NativeArchiveError("ZIP central directory is corrupt")
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10)
    const compressed = zip.readUInt32LE(cursor + 20)
    const size = zip.readUInt32LE(cursor + 24)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const mode = zip.readUInt32LE(cursor + 38) >>> 16
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8")
    if ([compressed, size, localOffset].includes(0xffffffff) || size > MAX_ENTRY_BYTES) throw new NativeArchiveError("ZIP64 or oversized entries are unsupported")
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || (mode & 0o170000) && ![0o100000, 0o040000].includes(mode & 0o170000)) throw new NativeArchiveError(`archive contains unsupported special entry ${name}`)
    const entryName = safeArchivePath(name.replace(/\/$/, ""))
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) throw new NativeArchiveError("ZIP local header is corrupt")
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const raw = zip.subarray(start, start + compressed)
    const content = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES })
    if (content.length !== size) throw new NativeArchiveError(`ZIP entry ${name} size mismatch`)
    expanded += size
    if (expanded > MAX_EXPANDED_BYTES) throw new NativeArchiveError("archive expands beyond limit")
    entries.push({ name: entryName, bytes: content, directory: name.endsWith("/") || (mode & 0o170000) === 0o040000 })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export async function extractNativeArchive(options) {
  let entries
  try {
    entries = options.format === "zip" ? zipEntries(options.bytes) : tarEntries(options.bytes)
  } catch (error) {
    if (error instanceof NativeArchiveError) throw error
    if (error instanceof Error) throw new NativeArchiveError(`archive decoding failed: ${error.message}`, { cause: error })
    throw error
  }
  for (const entry of entries) {
    const output = resolve(options.destination, entry.name)
    const rel = relative(options.destination, output)
    if (rel.startsWith("..") || isAbsolute(rel)) throw new NativeArchiveError(`archive entry ${entry.name} escapes staging`)
    if (entry.directory) await mkdir(output, { recursive: true })
    else {
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, entry.bytes, { mode: 0o755, flag: "wx" })
    }
  }
}
