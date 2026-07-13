import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const pluginRoot = resolve(import.meta.dirname, "..")
const componentRoot = join(pluginRoot, "components/git-bash")
const hookCli = join(componentRoot, "dist/cli.js")
const mcpRoot = join(pluginRoot, "mcp/git_bash")
const mcpCli = join(mcpRoot, "dist/cli.js")
const mcpLibrary = join(mcpRoot, "dist/index.js")
const buildScript = join(componentRoot, "runtime/build-git-bash.mjs")
const canonicalRoot = "/tmp/omo-v417"

const sha256 = (value) => createHash("sha256").update(value).digest("hex")

const fixture = (t) => {
	const root = mkdtempSync(join(tmpdir(), "asterline-git-runtime-"))
	t.after(() => rmSync(root, { recursive: true, force: true }))
	return root
}

const launchPayload = (sessionId = "session-1") => ({
	cwd: "C:\\repo",
	hook_event_name: "PreToolUse",
	model: "claude-sonnet-4-5",
	permission_mode: "default",
	session_id: sessionId,
	tool_input: { command: "pwd", cwd: "C:\\repo", wait: true, max_wait_seconds: 5 },
	tool_name: "launch-process",
	tool_use_id: "call-1",
	transcript_path: null,
	turn_id: "turn-1",
})

const runHook = (root, input, extraEnv = {}) => spawnSync(process.execPath, [hookCli, "hook", "pre-tool-use"], {
	encoding: "utf8",
	env: { ...process.env, OS: "Windows_NT", PLUGIN_DATA: root, ...extraEnv },
	input,
	timeout: 5_000,
})

test("Given Auggie 0.32 hook support When git guidance is inspected Then only warning-free PreToolUse is registered", () => {
	const manifest = JSON.parse(readFileSync(join(componentRoot, "hooks/hooks.json"), "utf8"))
	const recipePath = join(componentRoot, "runtime/git-bash-mcp.build.json")
	const recipe = JSON.parse(readFileSync(recipePath, "utf8"))
	const provenance = JSON.parse(readFileSync(join(mcpRoot, "transform-provenance.json"), "utf8"))
	assert.deepEqual(Object.keys(manifest.hooks), ["PreToolUse"])
	assert.equal(manifest.hooks.PreToolUse.length, 1)
	assert.equal("matcher" in manifest.hooks.PreToolUse[0], false)
	assert.equal("statusMessage" in manifest.hooks.PreToolUse[0].hooks[0], false)
	assert.equal(recipe.upstream.commit, "ed0241d1af225d38de55fdbcf0baa0abc9a1465a")
	assert.equal(recipe.toolchain.version, "1.3.14")
	assert.deepEqual(recipe.sources.map(({ treeOid }) => treeOid), [
		"fa9e38e9ed9923e416748b50faa4739c0c6b2a46",
		"a45d3a3459dc68efeaf06413dd9a4c09fc3f1f8d",
		"6f66e37d2fb4f182ecdd2c83f2a76001b1f7b56d",
	])
	assert.equal(provenance.recipeSha256, sha256(readFileSync(recipePath)))
	for (const output of provenance.outputFiles) assert.equal(output.sha256, sha256(readFileSync(join(mcpRoot, output.file))))
})

test("Given an Auggie launch-process payload on Windows When the hook runs twice Then guidance is emitted once", (t) => {
	const root = fixture(t)
	const preferred = join(root, "preferred")
	const legacy = join(root, "legacy")
	const payload = `${JSON.stringify(launchPayload())}\n`
	const first = runHook(root, payload, { ASTERLINE_PLUGIN_DATA: preferred, PLUGIN_DATA: legacy })
	const second = runHook(root, payload, { ASTERLINE_PLUGIN_DATA: preferred, PLUGIN_DATA: legacy })
	assert.equal(first.status, 0, first.stderr)
	assert.match(first.stdout, /ASTERLINE git_bash MCP/)
	assert.equal(second.status, 0, second.stderr)
	assert.equal(second.stdout, "")
	assert.equal(existsSync(join(preferred, "git-bash-reminder", `${sha256("session-1")}.seen`)), true)
	assert.equal(existsSync(join(legacy, "git-bash-reminder", `${sha256("session-1")}.seen`)), false)
	const home = join(root, "home")
	const fallback = runHook(root, `${JSON.stringify(launchPayload("fallback-dist"))}\n`, {
		ASTERLINE_PLUGIN_DATA: "",
		PLUGIN_DATA: "",
		HOME: home,
	})
	assert.equal(fallback.status, 0, fallback.stderr)
	assert.equal(existsSync(join(home, ".augment/asterline/plugin-data/git-bash-reminder", `${sha256("fallback-dist")}.seen`)), true)
})

test("Given malformed or aliased Auggie payloads When the hook runs Then it fails open without output", (t) => {
	const root = fixture(t)
	for (const input of ["{broken", JSON.stringify({ ...launchPayload(), tool_name: "Bash" }), "x".repeat(1024 * 1024 + 1), ""]) {
		const result = runHook(root, input)
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.stdout, "")
	}
})

test("Given a host without runnable Git Bash When MCP starts Then initialize, diagnose, and malformed input respond truthfully", () => {
	const input = [
		JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
		JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
		JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "diagnose", arguments: {} } }),
		"{broken",
	].join("\n") + "\n"
	const result = spawnSync(process.execPath, [mcpCli, "mcp"], { encoding: "utf8", input, timeout: 5_000 })
	const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line))
	assert.equal(result.status, 0, result.stderr)
	assert.equal(responses[0].result.serverInfo.name, "git_bash")
	assert.deepEqual(responses[1].result.tools.map(({ name }) => name), ["which_bash", "diagnose"])
	assert.match(responses[2].result.content[0].text, /disabled|missing-git-bash/)
	assert.equal(responses[3].error.code, -32700)
})

test("Given Windows resolver probes and a custom bash path When tools are called Then missing and runnable states are distinct", async () => {
	const { handleGitBashMcpRequest } = await import(`${mcpLibrary}?test=${Date.now()}`)
	const call = (id, name, args, options) => handleGitBashMcpRequest(
		{ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
		options,
	)
	const missing = await call(1, "diagnose", {}, { platform: "win32", env: {}, exists: () => false, where: () => [] })
	assert.match(missing.result.content[0].text, /missing-git-bash/)
	const bashPath = "C:\\PortableGit\\bin\\bash.exe"
	const ready = { platform: "win32", env: { ASTERLINE_GIT_BASH_PATH: bashPath }, exists: (path) => path === bashPath, where: () => [] }
	const listed = await handleGitBashMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ready)
	assert.deepEqual(listed.result.tools.map(({ name }) => name), ["run", "which_bash", "diagnose"])
	const ran = await call(3, "run", { command: "pwd", timeout: 50 }, {
		...ready,
		runGitBash: async (input) => ({ exitCode: 0, stdout: input.cwd ?? "", stderr: "", timedOut: false }),
	})
	assert.equal(ran.result.isError, false)
})

test("Given the bundled runner When commands succeed or time out Then output and temporary resources are deterministic", async () => {
	const { runGitBashCommand } = await import(`${mcpLibrary}?runner=${Date.now()}`)
	const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("asterline-git-bash-run-")))
	const success = await runGitBashCommand({ bashPath: "/bin/bash", command: "printf ready", timeoutMs: 1_000 })
	assert.deepEqual(success, { exitCode: 0, stdout: "ready", stderr: "", timedOut: false })
	const started = Date.now()
	const timedOut = await runGitBashCommand({ bashPath: "/bin/bash", command: "sleep 5", timeoutMs: 50 })
	assert.equal(timedOut.timedOut, true)
	assert.ok(Date.now() - started < 2_000)
	const after = readdirSync(tmpdir()).filter((name) => name.startsWith("asterline-git-bash-run-") && !before.has(name))
	assert.deepEqual(after, [])
})

test("Given exact v4.17.1 sources When the Git Bash MCP is built twice Then outputs are deterministic and self-contained", { skip: !existsSync(canonicalRoot) }, (t) => {
	const root = fixture(t)
	const outputs = [join(root, "one"), join(root, "two")]
	for (const output of outputs) {
		const result = spawnSync(process.execPath, [buildScript, "--source", canonicalRoot, "--output", output], { encoding: "utf8", timeout: 30_000 })
		assert.equal(result.status, 0, result.stderr)
	}
	for (const file of ["dist/cli.js", "dist/index.js", "dist/package.json", "transform-provenance.json"]) {
		assert.equal(sha256(readFileSync(join(outputs[0], file))), sha256(readFileSync(join(outputs[1], file))), file)
		assert.equal(sha256(readFileSync(join(outputs[0], file))), sha256(readFileSync(join(mcpRoot, file))), `shipped ${file}`)
	}
	const isolated = join(root, "isolated")
	cpSync(join(outputs[0], "dist"), isolated, { recursive: true })
	const help = spawnSync(process.execPath, [join(isolated, "cli.js"), "--help"], { encoding: "utf8", timeout: 5_000 })
	assert.equal(help.status, 0, help.stderr)
	assert.match(help.stdout, /asterline-git-bash/)
	const runtime = readFileSync(join(isolated, "cli.js"), "utf8")
	assert.doesNotMatch(runtime, /(?:from|require\()\s*["'](?!node:)[@a-z]/)
	assert.doesNotMatch(runtime, /(?:npm|npx|pnpm|yarn|bunx?)\s+(?:install|run|exec|dlx|x)\b/i)
	assert.doesNotMatch(runtime, /posthog|telemetry/i)
})
