import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import test from "node:test"

const pluginRoot = resolve(import.meta.dirname, "..")
const componentRoot = join(pluginRoot, "components/codegraph")
const bundle = join(pluginRoot, "mcp/codegraph/dist/serve.js")
const buildScript = join(componentRoot, "runtime/build-codegraph.mjs")
const canonicalRoot = "/tmp/omo-v417"
const realRuntime = "/tmp/native-probe-cg/codegraph-linux-x64"

function temporaryRoot() {
	return mkdtempSync(join(tmpdir(), "asterline-codegraph-test-"))
}

function fixtureExecutable(root, source) {
	const executable = join(root, "data/native/codegraph/1.0.1/linux-x64/codegraph-linux-x64/bin/codegraph")
	mkdirSync(dirname(executable), { recursive: true })
	writeFileSync(executable, `#!/usr/bin/env node
const readline = require("node:readline")
require("node:fs").writeFileSync(__filename + ".log", JSON.stringify({ args: process.argv.slice(2), env: { daemon: process.env.CODEGRAPH_NO_DAEMON, download: process.env.CODEGRAPH_NO_DOWNLOAD, install: process.env.CODEGRAPH_INSTALL_DIR, telemetry: process.env.CODEGRAPH_TELEMETRY, track: process.env.DO_NOT_TRACK } }))
const lines = readline.createInterface({ input: process.stdin })
if (${JSON.stringify(source)} === "hang") setInterval(() => {}, 1000)
lines.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { capabilities: { tools: {} }, protocolVersion: "2024-11-05", serverInfo: { name: "codegraph", version: "1.0.1" } } }) + "\\n")
  if (request.method === "tools/list") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "codegraph_node", description: "node", inputSchema: { type: "object", properties: { includeCode: { type: "boolean" } } } }] } }) + "\\n")
  if (request.method === "tools/call") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: "Structural outline only\\nRead a member" }] } }) + "\\n")
})
lines.on("close", () => { if (${JSON.stringify(source)} !== "hang") process.exit(0) })
`)
	chmodSync(executable, 0o755)
	return executable
}

function runMcp(root, input, extraEnv = {}) {
	return spawnSync(process.execPath, [bundle], {
		cwd: pluginRoot,
		encoding: "utf8",
		env: {
			...process.env,
			ASTERLINE_CODEGRAPH_PROJECT_CWD: pluginRoot,
			ASTERLINE_PLUGIN_DATA: join(root, "data"),
			HOME: root,
			...extraEnv,
		},
		input,
		timeout: 5_000,
	})
}

function lines(output) {
	return output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
}

test("Given the v4.17.1 port When CodeGraph is inspected Then exact upstream provenance and a self-contained bundle are shipped", () => {
	const provenance = JSON.parse(readFileSync(join(componentRoot, "UPSTREAM-PROVENANCE.json"), "utf8"))
	const runtime = readFileSync(bundle, "utf8")
	assert.equal(provenance.upstream.commit, "ed0241d1af225d38de55fdbcf0baa0abc9a1465a")
	assert.equal(provenance.upstream.treeOid, "fab3443348af56fd7e0168ceaca00530c777c64d")
	assert.match(runtime, /CODEGRAPH_TELEMETRY/)
	assert.doesNotMatch(runtime, /(?:from|require\()\s*["'](?!node:)[@a-z]/)
})

test("Given a missing native asset When MCP requests arrive Then initialize, list, call, and malformed input fail open truthfully", () => {
	const root = temporaryRoot()
	try {
		const input = [
			"{",
			JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
			JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
			JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "codegraph_status", arguments: {} } }),
		].join("\n")
		const result = runMcp(root, `${input}\n`)
		const responses = lines(result.stdout)
		assert.equal(result.status, 0)
		assert.equal(responses[0].error.code, -32700)
		assert.equal(responses[1].result.serverInfo.version, "1.0.1")
		assert.deepEqual(responses[2].result.tools, [])
		assert.equal(responses[3].result.isError, true)
		assert.match(responses[3].result.content[0].text, /verified native asset is missing/)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("Given a managed CodeGraph process When tools are listed and called Then the bridge preserves MCP and disables telemetry", () => {
	const root = temporaryRoot()
	try {
		const executable = fixtureExecutable(root, "exit")
		const requests = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
			{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
			{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "codegraph_node", arguments: {} } },
		]
		const result = runMcp(root, `${requests.map(JSON.stringify).join("\n")}\n`)
		const responses = lines(result.stdout)
		const launch = JSON.parse(readFileSync(`${executable}.log`, "utf8"))
		assert.equal(result.status, 0)
		assert.deepEqual(launch.args, ["serve", "--mcp"])
		assert.deepEqual(launch.env, { daemon: "1", download: "1", install: join(root, "data/codegraph"), telemetry: "0", track: "1" })
		assert.match(responses.find((response) => response.id === 2).result.tools[0].description, /container symbols/i)
		assert.match(responses.find((response) => response.id === 3).result.content[0].text, /request a specific member/i)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("Given a child that ignores stdin closure When the client disconnects Then the wrapper kills it within the configured bound", () => {
	const root = temporaryRoot()
	try {
		fixtureExecutable(root, "hang")
		const started = Date.now()
		const result = runMcp(root, "", { ASTERLINE_CODEGRAPH_SHUTDOWN_TIMEOUT_MS: "50" })
		assert.equal(result.status, 1)
		assert.ok(Date.now() - started < 2_000)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("Given the exact materialized v4.17.1 sources When built twice Then the CodeGraph bundle is reproducible", { skip: !existsSync(canonicalRoot) }, () => {
	const root = temporaryRoot()
	try {
		const outputs = [join(root, "one"), join(root, "two")]
		for (const output of outputs) {
			const result = spawnSync(process.execPath, [buildScript, "--source", canonicalRoot, "--output", output], { encoding: "utf8" })
			assert.equal(result.status, 0, result.stderr)
		}
		const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
		assert.equal(digest(join(outputs[0], "dist/serve.js")), digest(join(outputs[1], "dist/serve.js")))
		assert.equal(digest(join(outputs[0], "transform-provenance.json")), digest(join(outputs[1], "transform-provenance.json")))
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("Given the real pinned Linux CodeGraph 1.0.1 runtime When MCP initializes and lists tools Then the native protocol responds and exits cleanly", { skip: !existsSync(realRuntime), timeout: 10_000 }, async () => {
	const root = temporaryRoot()
	try {
		const destination = join(root, "data/native/codegraph/1.0.1/linux-x64/codegraph-linux-x64")
		mkdirSync(dirname(destination), { recursive: true })
		cpSync(realRuntime, destination, { recursive: true })
		const child = spawn(process.execPath, [bundle], {
			cwd: pluginRoot,
			env: { ...process.env, ASTERLINE_CODEGRAPH_PROJECT_CWD: pluginRoot, ASTERLINE_PLUGIN_DATA: join(root, "data"), HOME: root },
			stdio: ["pipe", "pipe", "pipe"],
		})
		const responses = new Map()
		const waiters = new Map()
		createInterface({ input: child.stdout }).on("line", (line) => {
			const response = JSON.parse(line)
			responses.set(response.id, response)
			waiters.get(response.id)?.(response)
		})
		const response = (id) => responses.has(id) ? Promise.resolve(responses.get(id)) : new Promise((resolveResponse) => waiters.set(id, resolveResponse))
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } })}\n`)
		const initialized = await response(1)
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`)
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`)
		const listed = await response(2)
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "codegraph_status", arguments: {} } })}\n`)
		const called = await response(3)
		child.stdin.end()
		const [exitCode] = await once(child, "exit")
		assert.equal(exitCode, 0)
		assert.equal(initialized.result.serverInfo.version, "1.0.1")
		assert.ok(listed.result.tools.some((tool) => tool.name === "codegraph_explore"))
		assert.ok(called.result?.content?.length > 0 || called.error !== undefined)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
