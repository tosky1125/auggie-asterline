import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { gzipSync } from "node:zlib"

import {
  nativeAssetDoctor,
  provisionNativeAsset,
  selectNativeAsset,
  validateNativeSbom,
} from "../scripts/native-assets.mjs"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

function tarEntry(name, bytes, options = {}) {
  const { type = "0", linkName = "" } = options
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, "utf8")
  header.write("0000755\0", 100, 8, "ascii")
  header.write("0000000\0", 108, 8, "ascii")
  header.write("0000000\0", 116, 8, "ascii")
  header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii")
  header.write("00000000000\0", 136, 12, "ascii")
  header.fill(0x20, 148, 156)
  header.write(type, 156, 1, "ascii")
  header.write(linkName, 157, 100, "utf8")
  header.write("ustar\0", 257, 6, "ascii")
  header.write("00", 263, 2, "ascii")
  const checksum = [...header].reduce((total, value) => total + value, 0)
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii")
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512)
  return Buffer.concat([header, bytes, padding])
}

function tarGz(entries) {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
}

function storedZip(name, bytes, unixMode = 0o100755) {
  const nameBytes = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(bytes.length, 18)
  local.writeUInt32LE(bytes.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE((3 << 8) | 20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(bytes.length, 20)
  central.writeUInt32LE(bytes.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE((unixMode << 16) >>> 0, 38)
  const body = Buffer.concat([local, nameBytes, bytes, central, nameBytes])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length + nameBytes.length, 12)
  eocd.writeUInt32LE(local.length + nameBytes.length + bytes.length, 16)
  return Buffer.concat([body, eocd])
}

function fixtureSbom(archive, overrides = {}) {
  return {
    schemaVersion: 1,
    components: [{
      id: "fixture",
      version: "1.0.0",
      license: { spdx: "MIT", provenance: "https://example.invalid/LICENSE" },
      source: { repository: "https://example.invalid/repo", revision: "a".repeat(40) },
      probe: { args: ["--version"], expectedExit: 0, expectedStdout: "fixture 1.0.0\n", timeoutMs: 1000 },
      assets: {
        "linux-x64": {
          archive: "tar.gz",
          executable: "bundle/bin/fixture",
          executableSha256: "0".repeat(64),
          sha256: sha256(archive),
          url: "https://example.invalid/fixture.tar.gz",
          ...overrides,
        },
      },
    }],
  }
}

const fetchBytes = (bytes) => async () => new Response(bytes, { status: 200 })

test("Given the shipped SBOM, when validated, then every native release pin is exact and licensed", async () => {
  const sbom = JSON.parse(await readFile(new URL("../native/SBOM.json", import.meta.url), "utf8"))
  const schema = JSON.parse(await readFile(new URL("../native/manifest.schema.json", import.meta.url), "utf8"))
  assert.equal(validateNativeSbom(sbom), sbom)
  assert.equal(sbom.$schema, "./manifest.schema.json")
  assert.equal(schema.additionalProperties, false)
  assert.equal(Object.values(schema.$defs).every((definition) => definition.additionalProperties === false || definition.type !== "object"), true)
  assert.deepEqual(sbom.components.map(({ id, version, license }) => [id, version, license.spdx]), [
    ["ast-grep", "0.43.0", "MIT"],
    ["codegraph", "1.0.1", "MIT"],
  ])
  assert.equal(Object.keys(sbom.components[0].assets).length, 6)
  assert.equal(Object.keys(sbom.components[1].assets).length, 6)
  assert.equal(sbom.components[0].assets["linux-x64"].sha256, "a26253a9c821d935f7e383e40f0de7c2ca62a4121de1f73a6d81ec32eae631e0")
  assert.equal(sbom.components[1].assets["linux-x64"].sha256, "d45a068f44596a85c7ba7d0ef924eaf7103fbbf3cafbeb668127daff60a52228")
  for (const component of sbom.components) for (const asset of Object.values(component.assets)) {
    assert.match(asset.executableSha256, /^[0-9a-f]{64}$/)
  }
})

test("Given an unknown field or malformed digest, when parsed, then the manifest is rejected", () => {
  const archive = tarGz([])
  assert.throws(() => validateNativeSbom({ ...fixtureSbom(archive), surprise: true }), /unknown field surprise/)
  assert.throws(() => validateNativeSbom(fixtureSbom(archive, { sha256: "abcd" })), /sha256/)
})

test("Given an unsupported platform, when selected and diagnosed, then it is explicitly unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-unsupported-"))
  const sbom = fixtureSbom(tarGz([]))
  assert.deepEqual(selectNativeAsset({ sbom, toolId: "fixture", platform: "aix", arch: "ppc64" }), {
    status: "unavailable", code: "unsupported_platform", message: "fixture 1.0.0 has no asset for aix-ppc64",
  })
  const result = await nativeAssetDoctor({ sbom, toolId: "fixture", cacheRoot: root, platform: "aix", arch: "ppc64" })
  assert.equal(result.status, "unavailable")
  assert.equal(result.code, "unsupported_platform")
  assert.deepEqual(await readdir(root), [])
})

test("Given download is disabled, when provisioned, then no network or cache write occurs", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-disabled-"))
  let fetched = false
  const doctor = await nativeAssetDoctor({ sbom: fixtureSbom(tarGz([])), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64" })
  assert.equal(doctor.code, "missing_or_unhealthy")
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(tarGz([])), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: false, fetchImpl: async () => { fetched = true; throw new Error("must not fetch") },
  })
  assert.equal(result.code, "download_disabled")
  assert.equal(fetched, false)
  assert.deepEqual(await readdir(root), [])
})

test("Given an offline host, when an explicit download is attempted, then failure remains structured and non-destructive", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-offline-"))
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(tarGz([])), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: async () => { throw new TypeError("offline") },
  })
  assert.equal(result.code, "download_failed")
  assert.match(result.message, /offline/)
  assert.deepEqual(await readdir(root), [])
})

test("Given a wrong checksum, when provisioned, then target and staging remain absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-checksum-"))
  const archive = tarGz([tarEntry("bundle/bin/fixture", Buffer.from("fixture"))])
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive, { sha256: "0".repeat(64) }), toolId: "fixture", cacheRoot: root,
    platform: "linux", arch: "x64", allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "checksum_mismatch")
  assert.equal(existsSync(join(root, "fixture")), false)
  assert.deepEqual(await readdir(root), [])
})

test("Given a traversal archive, when provisioned, then nothing escapes the atomic staging directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "asterline-native-traversal-"))
  const root = join(parent, "cache")
  const archive = storedZip("../../escaped", Buffer.from("owned"))
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive, { archive: "zip", executable: "escaped" }), toolId: "fixture", cacheRoot: root,
    platform: "linux", arch: "x64", allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "unsafe_archive")
  assert.equal(existsSync(join(parent, "escaped")), false)
  assert.equal(existsSync(root), false)
})

test("Given a symlink archive entry, when provisioned, then the special entry is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-link-"))
  const archive = tarGz([tarEntry("bundle/bin/fixture", Buffer.alloc(0), { type: "2", linkName: "/tmp/target" })])
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "unsafe_archive")
  assert.deepEqual(await readdir(root), [])
})

test("Given unsafe ZIP names, when provisioned, then backslashes and NUL bytes are rejected", async (context) => {
  for (const name of ["..\\escaped", "bad\0name"]) await context.test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), "asterline-native-name-"))
    const archive = storedZip(name, Buffer.from("owned"))
    const result = await provisionNativeAsset({
      sbom: fixtureSbom(archive, { archive: "zip", executable: "fixture" }), toolId: "fixture", cacheRoot: root,
      platform: "linux", arch: "x64", allowDownload: true, fetchImpl: fetchBytes(archive),
    })
    assert.equal(result.code, "unsafe_archive")
    assert.deepEqual(await readdir(root), [])
  })
})

test("Given an entry size bomb, when provisioned, then extraction stops before a write", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-size-"))
  const oversized = tarEntry("bundle/bin/fixture", Buffer.alloc(0))
  oversized.write("1000000001\0", 124, 12, "ascii")
  const archive = tarGz([oversized])
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "unsafe_archive")
  assert.deepEqual(await readdir(root), [])
})

test("Given a hanging executable, when probed, then the bounded probe is killed and install is discarded", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-timeout-"))
  const archive = tarGz([tarEntry("bundle/bin/fixture", Buffer.from("#!/bin/sh\nwhile :; do :; done\n"))])
  const sbom = fixtureSbom(archive, { executableSha256: sha256(Buffer.from("#!/bin/sh\nwhile :; do :; done\n")) })
  sbom.components[0].probe.timeoutMs = 100
  const result = await provisionNativeAsset({
    sbom, toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "probe_failed")
  assert.match(result.message, /timed out after 100ms/)
  assert.deepEqual(await readdir(root), [])
})

test("Given a verified local archive, when provisioned, then install and exact probe complete atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-success-"))
  const script = Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n")
  const archive = tarGz([tarEntry("bundle/bin/fixture", script)])
  const options = {
    sbom: fixtureSbom(archive, { executableSha256: sha256(script) }), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  }
  const result = await provisionNativeAsset(options)
  assert.equal(result.status, "available")
  assert.equal(readFileSync(result.executablePath, "utf8"), script.toString())
  assert.deepEqual(await readdir(join(root, "fixture", "1.0.0")), ["linux-x64"])
  const doctor = await nativeAssetDoctor({ ...options, allowDownload: undefined })
  assert.equal(doctor.status, "available")
  assert.equal(doctor.probe.stdout, "fixture 1.0.0\n")
  for (const path of [
    root,
    join(root, "fixture"),
    join(root, "fixture", "1.0.0"),
    join(root, "fixture", "1.0.0", "linux-x64"),
    join(root, "fixture", "1.0.0", "linux-x64", "bundle"),
    join(root, "fixture", "1.0.0", "linux-x64", "bundle", "bin"),
  ]) assert.equal((await lstat(path)).mode & 0o777, 0o700, path)
})

test("Given a probe-compatible cached executable is replaced, when diagnosed again, then it is rejected before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-tamper-"))
  const trusted = Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n")
  const archive = tarGz([tarEntry("bundle/bin/fixture", trusted)])
  const sbom = fixtureSbom(archive, { executableSha256: sha256(trusted) })
  const installed = await provisionNativeAsset({ sbom, toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64", allowDownload: true, fetchImpl: fetchBytes(archive) })
  assert.equal(installed.status, "available")
  const marker = join(root, "executed-marker")
  await writeFile(installed.executablePath, `#!/bin/sh\nprintf 'fixture 1.0.0\\n'\nprintf owned > ${JSON.stringify(marker)}\n`)
  await chmod(installed.executablePath, 0o700)

  const result = await nativeAssetDoctor({ sbom, toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64" })

  assert.equal(result.code, "integrity_mismatch")
  assert.equal(existsSync(marker), false)
})

test("Given a cached executable or parent is a symlink, when diagnosed, then escape is rejected before execution", async (context) => {
  const trusted = Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n")
  const archive = tarGz([tarEntry("bundle/bin/fixture", trusted)])
  const sbom = fixtureSbom(archive, { executableSha256: sha256(trusted) })
  for (const target of ["executable", "parent"]) await context.test(target, async () => {
    const root = await mkdtemp(join(tmpdir(), "asterline-native-symlink-"))
    const outside = await mkdtemp(join(tmpdir(), "asterline-native-outside-"))
    const finalRoot = join(root, "fixture", "1.0.0", "linux-x64")
    const outsideExecutable = join(outside, "fixture")
    await writeFile(outsideExecutable, trusted, { mode: 0o700 })
    await mkdir(join(finalRoot, "bundle"), { recursive: true })
    if (target === "executable") {
      await mkdir(join(finalRoot, "bundle", "bin"))
      await symlink(outsideExecutable, join(finalRoot, "bundle", "bin", "fixture"))
    } else {
      await symlink(outside, join(finalRoot, "bundle", "bin"))
    }
    const result = await nativeAssetDoctor({ sbom, toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64" })
    assert.equal(result.code, "unsafe_cache_path")
  })
})
