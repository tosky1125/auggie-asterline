import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const pluginRoot = resolve(import.meta.dirname, "..")
const jsonLines = (...messages) => `${messages.map(JSON.stringify).join("\n")}\n`
const sha256 = (value) => createHash("sha256").update(value).digest("hex")

function fixture(context) {
	const root = mkdtempSync(join(tmpdir(), "asterline-ast-grep-bootstrap-"))
	const plugin = join(root, "plugin")
	const data = join(root, "data")
	const executable = join(data, "native", "ast-grep", "0.43.0", `${process.platform}-${process.arch}`, "ast-grep")
	const script = `#!/bin/sh
if [ "$1" = "--version" ]; then
	printf 'ast-grep 0.43.0\\n'
	exit 0
fi
printf '[]\\n'
`
	mkdirSync(join(plugin, "mcp", "ast_grep", "dist"), { recursive: true })
	mkdirSync(join(plugin, "scripts"), { recursive: true })
	mkdirSync(join(plugin, "native"), { recursive: true })
	mkdirSync(dirname(executable), { recursive: true })
	cpSync(join(pluginRoot, "mcp", "ast_grep", "dist", "cli.js"), join(plugin, "mcp", "ast_grep", "dist", "cli.js"))
	for (const name of ["native-archive.mjs", "native-assets.mjs", "native-probe.mjs", "native-verification.mjs"]) {
		cpSync(join(pluginRoot, "scripts", name), join(plugin, "scripts", name))
	}
	writeFileSync(executable, script)
	chmodSync(executable, 0o700)
	const sbom = JSON.parse(readFileSync(join(pluginRoot, "native", "SBOM.json"), "utf8"))
	const component = sbom.components.find(({ id }) => id === "ast-grep")
	component.assets = {
		[`${process.platform}-${process.arch}`]: {
			archive: "zip",
			executable: "ast-grep",
			executableSha256: sha256(script),
			sha256: "0".repeat(64),
			url: "https://example.invalid/ast-grep.zip",
		},
	}
	writeFileSync(join(plugin, "native", "SBOM.json"), `${JSON.stringify({ ...sbom, components: [component] }, null, 2)}\n`)
	context.after(() => rmSync(root, { recursive: true, force: true }))
	return { data, executable, plugin }
}

function search(plugin, data) {
	const input = jsonLines(
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
		{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { pattern: "console.log($MSG)", lang: "typescript" } } },
	)
	return spawnSync(process.execPath, [join(plugin, "mcp", "ast_grep", "dist", "cli.js"), "mcp"], {
		cwd: plugin,
		encoding: "utf8",
		env: { HOME: join(data, "home"), PATH: "/usr/bin:/bin", ASTERLINE_PLUGIN_DATA: data },
		input,
		timeout: 10_000,
	})
}

test("Given only the checksum-pinned bootstrap cache, when ast_grep search runs, then the MCP uses the verified executable", (context) => {
	// Given
	const { data, plugin } = fixture(context)

	// When
	const result = search(plugin, data)

	// Then
	assert.equal(result.error, undefined)
	assert.equal(result.status, 0, result.stderr)
	const responses = result.stdout.trim().split("\n").map(JSON.parse)
	assert.equal(responses[1].result.isError, false, responses[1].result.content[0].text)
	assert.doesNotMatch(responses[1].result.content[0].text, /binary not found/i)
})

test("Given a tampered bootstrap executable, when ast_grep search runs, then the MCP rejects it before execution", (context) => {
	// Given
	const { data, executable, plugin } = fixture(context)
	writeFileSync(executable, "#!/bin/sh\nprintf 'tampered\\n'\n")

	// When
	const result = search(plugin, data)

	// Then
	assert.equal(result.error, undefined)
	assert.equal(result.status, 0, result.stderr)
	const responses = result.stdout.trim().split("\n").map(JSON.parse)
	assert.equal(responses[1].result.isError, true)
	assert.match(responses[1].result.content[0].text, /binary not found/i)
})

test("Given no bootstrap executable, when ast_grep search runs, then the error names the exact download opt-in", (context) => {
	// Given
	const { data, executable, plugin } = fixture(context)
	rmSync(executable)

	// When
	const result = search(plugin, data)

	// Then
	assert.equal(result.error, undefined)
	assert.equal(result.status, 0, result.stderr)
	const responses = result.stdout.trim().split("\n").map(JSON.parse)
	assert.equal(responses[1].result.isError, true)
	assert.match(responses[1].result.content[0].text, /ASTERLINE_BOOTSTRAP_DOWNLOAD=1/)
})
