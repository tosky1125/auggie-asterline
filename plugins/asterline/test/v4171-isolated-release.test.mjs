import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const source = resolve(import.meta.dirname, "..")
const managers = ["npm", "npx", "pnpm", "yarn", "bun", "bunx"]
const jsonLines = (...messages) => `${messages.map(JSON.stringify).join("\n")}\n`
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }
const listTools = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }

function processExists(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		if (error?.code === "ESRCH") return false
		throw error
	}
}

async function stopOwnedProcesses(root) {
	if (!existsSync("/proc")) return
	const owned = readdirSync("/proc").filter((name) => /^\d+$/.test(name)).map(Number).filter((pid) => {
		try {
			return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(root)
		} catch {
			return false
		}
	})
	for (const pid of owned) process.kill(pid, "SIGTERM")
	for (let attempt = 0; attempt < 50 && owned.some(processExists); attempt += 1) {
		await new Promise((resolveWait) => setTimeout(resolveWait, 20))
	}
	for (const pid of owned.filter(processExists)) process.kill(pid, "SIGKILL")
	assert.deepEqual(owned.filter(processExists), [], "isolated runtime process survived cleanup")
}

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "asterline-isolated-release-"))
	const home = join(root, "home")
	const plugin = join(home, ".augment/plugins/marketplaces/auggie-asterline/plugins/asterline")
	const bin = join(root, "bin")
	const sentinel = join(root, "package-manager.log")
	mkdirSync(dirname(plugin), { recursive: true })
	cpSync(source, plugin, { recursive: true, filter: (path) => !path.includes("node_modules") && !path.includes("__pycache__") })
	mkdirSync(bin)
	symlinkSync(process.execPath, join(bin, "node"))
	for (const manager of managers) {
		const path = join(bin, manager)
		writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' ${manager} >> ${JSON.stringify(sentinel)}\nexit 97\n`)
		chmodSync(path, 0o755)
	}
	const env = {
		HOME: home,
		PATH: `${bin}:/usr/bin:/bin`,
		LANG: "C",
		LC_ALL: "C",
		TZ: "UTC",
		PYTHONDONTWRITEBYTECODE: "1",
		ASTERLINE_HOME: join(home, ".asterline"),
		ASTERLINE_PLUGIN_DATA: join(root, "data"),
		ASTERLINE_LSP_DAEMON_DIR: join(root, "lsp-daemon"),
		ASTERLINE_NATIVE_DOWNLOAD: "0",
		CODEGRAPH_TELEMETRY: "0",
	}
	t.after(async () => {
		await stopOwnedProcesses(root)
		rmSync(root, { recursive: true, force: true })
	})
	return { root, home, plugin, sentinel, env }
}

function run(command, args, env, input = "", timeout = 10_000) {
	return spawnSync(command, args, { encoding: "utf8", env, input, timeout })
}

function assertClean(result, label, accepted = [0]) {
	assert.equal(result.error, undefined, `${label}: ${result.error?.message ?? ""}`)
	assert.ok(accepted.includes(result.status), `${label}: exit=${result.status}\n${result.stderr}`)
}

test("Given an exact isolated install, every bin and hook runs without a package manager", { timeout: 60_000 }, (t) => {
	const { plugin, sentinel, env } = fixture(t)
	const pkg = JSON.parse(readFileSync(join(plugin, "package.json"), "utf8"))
	const session = jsonLines({ conversation_id: "isolated", workspace_roots: [plugin] })
	const edit = jsonLines({
		conversation_id: "isolated", workspace_roots: [plugin], hook_event_name: "PostToolUse",
		tool_name: "save-file", tool_input: { path: "fixture.ts", file_content: "const value = 1\n" },
		tool_output: "saved", tool_error: null, is_mcp_tool: false,
	})
	const launch = jsonLines({
		conversation_id: "isolated", workspace_roots: [plugin], hook_event_name: "PreToolUse",
		tool_name: "launch-process", tool_input: { command: "pwd" }, is_mcp_tool: false,
	})
	const stop = jsonLines({ conversation_id: "isolated", workspace_roots: [plugin], hook_event_name: "Stop" })
	const binCalls = {
		"asterline-comment-guard": ["hook", "post-tool-use"],
		"asterline-git-flow": ["help"],
		"asterline-code-intel": ["hook", "post-tool-use"],
		"asterline-rule-sync": ["hook", "session-start"],
		"asterline-run-plan-continuation": ["hook", "stop"],
		"asterline-work-loop-engine": ["--help"],
	}
	for (const [name, args] of Object.entries(binCalls)) {
		const entry = join(plugin, pkg.bin[name])
		const input = name === "asterline-rule-sync" ? session : name.includes("continuation") ? stop : edit
		assertClean(run(process.execPath, [entry, ...args], env, input), `bin ${name}`)
	}
	const hookInputs = {
		"rules-session-start.sh": session,
		"bootstrap-session-start.sh": session,
		"git-flow-pre-tool-use.sh": launch,
		"comment-guard-post-tool-use.sh": edit,
		"code-intel-post-tool-use.sh": edit,
		"rule-sync-post-tool-use.sh": edit,
		"run-plan-stop.sh": stop,
		"work-loop-stop.sh": stop,
	}
	for (const [name, input] of Object.entries(hookInputs)) {
		assertClean(run("/bin/bash", [join(plugin, "hooks/bin", name)], env, input, 30_000), `hook ${name}`)
	}
	assert.equal(existsSync(sentinel), false, "runtime invoked a package-manager sentinel")
})

test("Given isolated local MCP bundles, protocol startup is self-contained with downloads disabled", { timeout: 30_000 }, (t) => {
	const { root, plugin, sentinel, env } = fixture(t)
	const exchanges = [
		["ast_grep", "mcp/ast_grep/dist/cli.js", ["mcp"]],
		["lsp", "mcp/lsp/dist/cli.js", ["mcp"]],
		["codegraph", "mcp/codegraph/dist/serve.js", []],
		["git_bash", "mcp/git_bash/dist/cli.js", ["mcp"]],
	]
	for (const [name, relative, args] of exchanges) {
		const result = run(process.execPath, [join(plugin, relative), ...args], env, jsonLines(initialize, listTools), 15_000)
		assertClean(result, `MCP ${name}`)
		const responses = result.stdout.trim().split("\n").filter(Boolean).map(JSON.parse)
		assert.equal(responses[0].id, 1, name)
		assert.equal(responses[1].id, 2, name)
	}
	assert.equal(existsSync(sentinel), false)
	assert.equal(existsSync(join(plugin, "vendor")), false)
	assert.equal(existsSync(join(root, "node_modules")), false)
	assert.equal(readdirSync(root).some((name) => name.includes("partial") || name.includes("staging")), false)
})
