import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const pluginRoot = new URL("..", import.meta.url).pathname
const componentRoot = join(pluginRoot, "components", "comment-checker")
const cli = join(componentRoot, "dist", "cli.js")

const fixture = (t) => {
	const root = mkdtempSync(join(tmpdir(), "asterline-comment-guard-"))
	t.after(() => rmSync(root, { recursive: true, force: true }))
	return root
}

const payload = (overrides = {}) => ({
	conversation_id: "conversation-1",
	workspace_roots: ["/workspace"],
	is_mcp_tool: false,
	hook_event_name: "PostToolUse",
	tool_name: "save-file",
	tool_input: { path: "src/new.ts", file_content: "// explain\nconst value = 1\n" },
	tool_output: "saved",
	tool_error: null,
	...overrides,
})

const checker = (root) => {
	const path = join(root, "comment-checker")
	writeFileSync(path, `#!/usr/bin/env node
let input = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => { input += chunk })
process.stdin.on("end", () => {
  if (process.env.CHECKER_CAPTURE) require("node:fs").writeFileSync(process.env.CHECKER_CAPTURE, input)
  if (process.env.CHECKER_PID_FILE) require("node:fs").writeFileSync(process.env.CHECKER_PID_FILE, String(process.pid))
  if (process.env.CHECKER_MODE === "warning") { process.stderr.write("comment warning: explain less\\n"); process.exit(2) }
  if (process.env.CHECKER_MODE === "noisy") { process.stderr.write("x".repeat(9000)); process.exit(2) }
  if (process.env.CHECKER_MODE === "hang") { setInterval(() => {}, 1000); return }
  if (process.env.CHECKER_MODE === "output-loop") { setInterval(() => process.stderr.write("x".repeat(16384)), 0); return }
  if (process.env.CHECKER_MODE === "combined-output-loop") { setInterval(() => { process.stdout.write("x".repeat(8192)); process.stderr.write("y".repeat(8192)) }, 0); return }
  if (process.env.CHECKER_MODE === "error") { process.stderr.write("native failure\\n"); process.exit(7) }
})
`)
	chmodSync(path, 0o755)
	return path
}

const run = (input, env = {}, timeout = 5_000) => spawnSync(process.execPath, [cli, "hook", "post-tool-use"], {
	encoding: "utf8",
	input: typeof input === "string" ? input : JSON.stringify(input),
	env: { ...process.env, ...env },
	timeout,
})

const processExists = (pid) => {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		if (error?.code === "ESRCH") return false
		throw error
	}
}

const cleanupProcess = (pid) => {
	if (processExists(pid)) process.kill(pid, "SIGKILL")
}

test("Given successful Auggie save and replace payloads, when the committed runtime runs, then native checker input is exact", (t) => {
	const root = fixture(t)
	const binary = checker(root)
	const capture = join(root, "capture.json")
	const save = run(payload(), { ASTERLINE_COMMENT_CHECKER_BINARY: binary, CHECKER_CAPTURE: capture })
	assert.equal(save.status, 0, save.stderr)
	assert.equal(save.stdout, "")
	assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), {
		session_id: "conversation-1",
		tool_name: "Write",
		transcript_path: "",
		cwd: "/workspace",
		hook_event_name: "PostToolUse",
		tool_input: { file_path: "src/new.ts", content: "// explain\nconst value = 1\n" },
	})

	const replace = run(payload({
		tool_name: "str-replace-editor",
		tool_input: { command: "str_replace", path: "src/a.ts", old_str_1: "old", new_str_1: "new", old_str_2: "x", new_str_2: "y" },
	}), { ASTERLINE_COMMENT_CHECKER_BINARY: binary, CHECKER_CAPTURE: capture })
	assert.equal(replace.status, 0, replace.stderr)
	assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")).tool_input, {
		file_path: "src/a.ts",
		edits: [{ old_string: "old", new_string: "new" }, { old_string: "x", new_string: "y" }],
	})

	const patch = run(payload({
		tool_name: "apply_patch",
		tool_input: { input: "*** Begin Patch\n*** Update File: src/p.ts\n@@\n-old\n+new\n*** End Patch" },
	}), { ASTERLINE_COMMENT_CHECKER_BINARY: binary, CHECKER_CAPTURE: capture })
	assert.equal(patch.status, 0, patch.stderr)
	assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")).tool_input, {
		file_path: "src/p.ts",
		old_string: "old\n",
		new_string: "new\n",
	})
})

test("Given explicit failure cancellation or unknown state, when the hook runs, then it fails open without launching the checker", (t) => {
	const root = fixture(t)
	const binary = checker(root)
	const capture = join(root, "capture.json")
	const cases = [
		{ tool_output: "saved", tool_error: "Permission denied" },
		{ tool_output: "saved", tool_error: "Tool execution cancelled by user" },
		{ tool_output: { status: "deferred", ticket: 7 }, tool_error: null },
	]
	for (const state of cases) {
		const result = run(payload(state), { ASTERLINE_COMMENT_CHECKER_BINARY: binary, CHECKER_CAPTURE: capture })
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.stdout, "")
	}
	assert.throws(() => readFileSync(capture), /ENOENT/)
})

test("Given misleading success output with no error, when the hook runs, then explicit Auggie state wins and warnings block", (t) => {
	const root = fixture(t)
	const binary = checker(root)
	const result = run(payload({ tool_output: "failed to save, allegedly", tool_error: null }), {
		ASTERLINE_COMMENT_CHECKER_BINARY: binary,
		CHECKER_MODE: "warning",
	})
	assert.equal(result.status, 0, result.stderr)
	assert.deepEqual(JSON.parse(result.stdout), {
		decision: "block",
		reason: "comment-checker found issues in src/new.ts:\ncomment warning: explain less",
	})
})

test("Given malformed unsupported empty or absent-checker inputs, when the hook runs, then it fails open truthfully", () => {
	for (const input of ["{broken", payload({ tool_name: "Save-File" }), payload({ tool_input: { path: "src/a.ts", file_content: "" } })]) {
		const result = run(input, { ASTERLINE_COMMENT_CHECKER_BINARY: "/definitely/missing/comment-checker" })
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.stdout, "")
	}
	const source = readFileSync(join(componentRoot, "src", "runner.ts"), "utf8")
	assert.doesNotMatch(source, /\b(?:npm|npx|pnpm|yarn|bunx?)\b/i)
	assert.match(source, /operator-provisioned/i)
})

test("Given an operational checker failure, when the native process exits unexpectedly, then the hook fails open", (t) => {
	const root = fixture(t)
	const result = run(payload(), {
		ASTERLINE_COMMENT_CHECKER_BINARY: checker(root),
		CHECKER_MODE: "error",
	})
	assert.equal(result.status, 0, result.stderr)
	assert.equal(result.stdout, "")
})

test("Given excessive checker output, when warnings are returned, then process and hook feedback stay bounded", (t) => {
	const root = fixture(t)
	const result = run(payload(), {
		ASTERLINE_COMMENT_CHECKER_BINARY: checker(root),
		CHECKER_MODE: "noisy",
	})
	assert.equal(result.status, 0, result.stderr)
	const feedback = JSON.parse(result.stdout)
	assert.ok(feedback.reason.length <= 8_000)
	assert.match(feedback.reason, /Truncated hook output/)
})

test("Given a hanging checker, when its configured deadline expires, then the hook returns after the child is gone", (t) => {
	const root = fixture(t)
	const pidFile = join(root, "checker.pid")
	const started = Date.now()
	const result = run(payload(), {
		ASTERLINE_COMMENT_CHECKER_BINARY: checker(root),
		ASTERLINE_COMMENT_CHECKER_TIMEOUT_MS: "150",
		CHECKER_MODE: "hang",
		CHECKER_PID_FILE: pidFile,
	}, 5_000)
	const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : undefined
	try {
		assert.equal(result.status, 0, result.error?.message ?? result.stderr)
		assert.ok(Date.now() - started < 5_000)
		if (pid !== undefined) assert.equal(processExists(pid), false)
	} finally {
		if (pid !== undefined) cleanupProcess(pid)
	}
})

test("Given an endless output checker, when byte budgets are exhausted, then the hook aborts and reaps it promptly", (t) => {
	const root = fixture(t)
	const pidFile = join(root, "checker.pid")
	const started = Date.now()
	const result = run(payload(), {
		ASTERLINE_COMMENT_CHECKER_BINARY: checker(root),
		CHECKER_MODE: "output-loop",
		CHECKER_PID_FILE: pidFile,
	}, 1_500)
	const pid = Number(readFileSync(pidFile, "utf8"))
	try {
		assert.equal(result.status, 0, result.error?.message ?? result.stderr)
		assert.ok(Date.now() - started < 1_500)
		assert.equal(processExists(pid), false)
	} finally {
		cleanupProcess(pid)
	}
})

test("Given combined stdout and stderr flooding, when their shared budget is exhausted, then the hook reaps the checker", (t) => {
	const root = fixture(t)
	const pidFile = join(root, "checker.pid")
	const result = run(payload(), {
		ASTERLINE_COMMENT_CHECKER_BINARY: checker(root),
		CHECKER_MODE: "combined-output-loop",
		CHECKER_PID_FILE: pidFile,
	}, 1_500)
	const pid = Number(readFileSync(pidFile, "utf8"))
	try {
		assert.equal(result.status, 0, result.error?.message ?? result.stderr)
		assert.equal(processExists(pid), false)
	} finally {
		cleanupProcess(pid)
	}
})

test("Given an executable with a missing interpreter, when spawn emits an error, then the hook fails open once", (t) => {
	const root = fixture(t)
	const invalid = join(root, "invalid-checker")
	writeFileSync(invalid, "#!/definitely/missing/interpreter\n")
	chmodSync(invalid, 0o755)
	const result = run(payload(), { ASTERLINE_COMMENT_CHECKER_BINARY: invalid })
	assert.equal(result.status, 0, result.stderr)
	assert.equal(result.stdout, "")
})

test("Given the release recipe, when inspected, then F3 emits a self-contained Node-only runtime", () => {
	const recipe = JSON.parse(readFileSync(join(componentRoot, "runtime", "comment-checker.build.json"), "utf8"))
	const packageJson = JSON.parse(readFileSync(join(componentRoot, "package.json"), "utf8"))
	const hooks = JSON.parse(readFileSync(join(componentRoot, "hooks", "hooks.json"), "utf8"))
	const provenance = JSON.parse(readFileSync(join(componentRoot, "UPSTREAM-PROVENANCE.json"), "utf8"))
	assert.equal(recipe.schemaVersion, 1)
	assert.equal(recipe.toolchain.version, "1.3.14")
	assert.deepEqual(recipe.entries, [{ source: "comment-checker/src/cli.ts", output: "cli.js", executable: true }])
	assert.deepEqual(recipe.aliases.map(({ specifier }) => specifier), ["@asterline/hook-bridge"])
	assert.equal(packageJson.private, true)
	assert.equal(packageJson.dependencies, undefined)
	assert.equal(packageJson.optionalDependencies, undefined)
	assert.equal(packageJson.packageManager, undefined)
	assert.equal(hooks.hooks.PostToolUse[0].matcher, undefined)
	assert.doesNotMatch(JSON.stringify(hooks), /matcher/)
	assert.doesNotMatch(JSON.stringify(hooks), /statusMessage/)
	assert.equal(provenance.upstream.commit, "ed0241d1af225d38de55fdbcf0baa0abc9a1465a")
	const dist = readFileSync(cli, "utf8")
	assert.doesNotMatch(dist, /(?:from|require\()\s*["'](?!node:|\.)/)
	assert.doesNotMatch(dist, /\b(?:npm|npx|pnpm|yarn|bunx?)\b/i)
})
