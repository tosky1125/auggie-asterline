import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { gzipSync } from "node:zlib"

import { provisionNativeAsset } from "../scripts/native-assets.mjs"
import { buildProbeInvocation } from "../scripts/native-probe.mjs"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

function tarEntry(name, bytes) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, "utf8")
  header.write("0000755\0", 100, 8, "ascii")
  header.write("0000000\0", 108, 8, "ascii")
  header.write("0000000\0", 116, 8, "ascii")
  header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii")
  header.write("00000000000\0", 136, 12, "ascii")
  header.fill(0x20, 148, 156)
  header.write("0", 156, 1, "ascii")
  header.write("ustar\0", 257, 6, "ascii")
  header.write("00", 263, 2, "ascii")
  const checksum = [...header].reduce((total, value) => total + value, 0)
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii")
  return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)])
}

const tarGz = (entries) => gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
const fetchBytes = (bytes) => async () => new Response(bytes, { status: 200 })

function fixtureSbom(archive, executable = "bundle/bin/fixture") {
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
          archive: "tar.gz", executable, sha256: sha256(archive), url: "https://example.invalid/fixture.tar.gz",
        },
      },
    }],
  }
}

test("Given Windows script assets, when probe invocation is built, then cmd and JavaScript use explicit safe runtimes", () => {
  assert.deepEqual(buildProbeInvocation({
    executablePath: "C:\\cache\\codegraph.cmd", args: ["--version"], platform: "win32",
    comspec: "C:\\Windows\\System32\\cmd.exe", execPath: "C:\\node.exe",
  }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "C:\\cache\\codegraph.cmd", "--version"],
  })
  assert.deepEqual(buildProbeInvocation({
    executablePath: "C:\\cache\\tool.js", args: ["--version"], platform: "win32",
    comspec: "cmd.exe", execPath: "C:\\node.exe",
  }), { command: "C:\\node.exe", args: ["C:\\cache\\tool.js", "--version"] })
})

test("Given output-bomb executables, when probed, then per-stream and combined limits kill them", async (context) => {
  const cases = [
    ["stdout", "process.stdout.write('x'.repeat(70000))"],
    ["stderr", "process.stderr.write('x'.repeat(70000))"],
    ["combined", "process.stdout.write('x'.repeat(50000));process.stderr.write('x'.repeat(50000))"],
  ]
  for (const [name, body] of cases) await context.test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), "asterline-native-output-"))
    const archive = tarGz([tarEntry("bundle/bin/fixture.js", Buffer.from(`#!/usr/bin/env node\n${body}\n`))])
    const result = await provisionNativeAsset({
      sbom: fixtureSbom(archive, "bundle/bin/fixture.js"), toolId: "fixture", cacheRoot: root,
      platform: "linux", arch: "x64", allowDownload: true, fetchImpl: fetchBytes(archive),
    })
    assert.equal(result.code, "probe_failed")
    assert.match(result.message, /output limit/)
    assert.deepEqual(await readdir(root), [])
  })
})

test("Given an unhealthy cached install, when a verified replacement arrives, then repair is atomic and complete", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-repair-"))
  const finalRoot = join(root, "fixture", "1.0.0", "linux-x64")
  const executable = join(finalRoot, "bundle", "bin", "fixture")
  await mkdir(join(finalRoot, "bundle", "bin"), { recursive: true })
  await writeFile(executable, "#!/bin/sh\nprintf 'broken\\n'\n", { mode: 0o755 })
  const replacement = Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n")
  const archive = tarGz([tarEntry("bundle/bin/fixture", replacement)])
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.status, "available")
  assert.equal((await readFile(executable, "utf8")), replacement.toString())
  assert.deepEqual(await readdir(join(root, "fixture", "1.0.0")), ["linux-x64"])
})

test("Given concurrent installers, when they collide, then both return the same healthy cache without debris", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-concurrent-"))
  const archive = tarGz([tarEntry("bundle/bin/fixture", Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n"))])
  const options = {
    sbom: fixtureSbom(archive), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  }
  const results = await Promise.all([provisionNativeAsset(options), provisionNativeAsset(options)])
  assert.deepEqual(results.map(({ status }) => status), ["available", "available"])
  assert.equal(results[0].executablePath, results[1].executablePath)
  assert.deepEqual(await readdir(join(root, "fixture", "1.0.0")), ["linux-x64"])
})

test("Given a corrupt tar header checksum, when extracted, then no file is trusted or installed", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterline-native-tar-checksum-"))
  const entry = tarEntry("bundle/bin/fixture", Buffer.from("#!/bin/sh\nprintf 'fixture 1.0.0\\n'\n"))
  entry[0] ^= 1
  const archive = tarGz([entry])
  const result = await provisionNativeAsset({
    sbom: fixtureSbom(archive), toolId: "fixture", cacheRoot: root, platform: "linux", arch: "x64",
    allowDownload: true, fetchImpl: fetchBytes(archive),
  })
  assert.equal(result.code, "unsafe_archive")
  assert.equal(existsSync(join(root, "fixture")), false)
  assert.deepEqual(await readdir(root), [])
})
