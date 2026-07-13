#!/usr/bin/env node
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { accessSync, constants, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { bundleComponent, replaceDirectory } from "../../../scripts/bundle-component.mjs"

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const componentRoot = resolve(runtimeRoot, "..")
const pluginRoot = resolve(componentRoot, "../..")
const defaultRecipe = join(runtimeRoot, "codegraph-mcp.build.json")
const defaultOutput = join(pluginRoot, "mcp", "codegraph")

class CodegraphBuildError extends Error {}

const sha256 = (value) => createHash("sha256").update(value).digest("hex")

function parseArgs(args) {
	if (args.includes("--help") || args.includes("-h")) return { help: true }
	const values = new Map()
	for (let index = 0; index < args.length; index += 2) {
		const option = args[index]
		const value = args[index + 1]
		if (!["--source", "--output", "--recipe"].includes(option) || value === undefined || values.has(option)) {
			throw new CodegraphBuildError(`unknown, duplicate, or incomplete option ${JSON.stringify(option)}`)
		}
		values.set(option, value)
	}
	const source = values.get("--source") ?? process.env.ASTERLINE_UPSTREAM_SOURCE
	if (source === undefined) throw new CodegraphBuildError("--source or ASTERLINE_UPSTREAM_SOURCE is required")
	return {
		help: false,
		source: resolve(source),
		output: resolve(values.get("--output") ?? defaultOutput),
		recipe: resolve(values.get("--recipe") ?? defaultRecipe),
	}
}

function executable(name) {
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		const candidate = join(directory, name)
		try {
			accessSync(candidate, constants.X_OK)
			return resolve(candidate)
		} catch (error) {
			if (!(error instanceof Error)) throw error
		}
	}
	throw new CodegraphBuildError(`${name} is not available on PATH`)
}

function git(root, args) {
	const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" })
	if (result.error || result.status !== 0) throw new CodegraphBuildError(result.error?.message ?? result.stderr.trim())
	return result.stdout.trim()
}

function verifySource(root, recipe) {
	if (git(root, ["rev-parse", "HEAD"]) !== recipe.upstream.commit) throw new CodegraphBuildError("upstream commit mismatch")
	for (const source of recipe.upstream.sources) {
		if (git(root, ["rev-parse", `HEAD:${source.path}`]) !== source.treeOid) throw new CodegraphBuildError(`upstream tree mismatch: ${source.path}`)
	}
}

function materialize(source, staging, recipe) {
	cpSync(join(componentRoot, "src"), join(staging, "adapter"), { recursive: true })
	cpSync(join(source, "packages/mcp-stdio-core/src"), join(staging, "upstream/mcp-stdio-core"), { recursive: true })
	mkdirSync(join(staging, "upstream/codegraph"), { recursive: true })
	const digests = []
	for (const canonical of recipe.canonicalFiles) {
		const sourcePath = join(source, canonical)
		const name = canonical.split("/").at(-1)
		const before = readFileSync(sourcePath, "utf8")
		let after = before.replace("../../../../../mcp-stdio-core/src/index.ts", "../mcp-stdio-core/index.ts")
		after = after.replace('import type { CodegraphServeProcessOptions } from "./serve.js";', 'import type { CodegraphServeProcessOptions } from "../../adapter/runtime-types.ts";')
		if (name === "mcp-bridge.ts") {
			after = after.replace(
				"\tconst bridgeDone = Promise.all([\n\t\tforwardClientToCodegraph(options.input, childInput, pendingResponses, (mode) => {",
				"\tconst clientDone = forwardClientToCodegraph(options.input, childInput, pendingResponses, (mode) => {",
			)
			after = after.replace(
				"\t\t}),\n\t\tforwardCodegraphToClient(childOutput, options.output, pendingResponses, () => defaultResponseMode),\n\t]);",
				"\t\t});\n\tconst serverDone = forwardCodegraphToClient(childOutput, options.output, pendingResponses, () => defaultResponseMode);\n\tconst bridgeDone = Promise.all([clientDone, serverDone]);\n\tconst requestedShutdownMs = Number.parseInt(process.env[\"ASTERLINE_CODEGRAPH_SHUTDOWN_TIMEOUT_MS\"] ?? \"2000\", 10);\n\tconst shutdownTimeoutMs = Number.isFinite(requestedShutdownMs) ? Math.max(50, Math.min(requestedShutdownMs, 10_000)) : 2_000;\n\tlet shutdownTimer: NodeJS.Timeout | undefined;\n\tvoid clientDone.then(() => { shutdownTimer = setTimeout(() => child.kill(\"SIGKILL\"), shutdownTimeoutMs); });",
			)
			after = after.replace(
				"\treturn Promise.race([childExit, bridgeDone.then(() => childExit)]);",
				"\treturn Promise.race([childExit, bridgeDone.then(() => childExit)]).finally(() => { if (shutdownTimer !== undefined) clearTimeout(shutdownTimer); });",
			)
		}
		writeFileSync(join(staging, "upstream/codegraph", name), after)
		digests.push({ file: canonical, canonicalSha256: sha256(before), transformedSha256: sha256(after) })
	}
	return digests
}

async function build(options) {
	const recipeBytes = readFileSync(options.recipe)
	const recipe = JSON.parse(recipeBytes)
	verifySource(options.source, recipe)
	const bun = executable(recipe.toolchain.command)
	const version = spawnSync(bun, ["--version"], { encoding: "utf8" })
	if (version.status !== 0 || version.stdout.trim() !== recipe.toolchain.version) throw new CodegraphBuildError("Bun version mismatch")
	const staging = mkdtempSync(join(dirname(options.output), ".codegraph-build-"))
	const release = join(staging, "release")
	try {
		const transformedFiles = materialize(options.source, join(staging, "source"), recipe)
		await bundleComponent({
			source: join(staging, "source"),
			output: join(release, "dist"),
			config: {
				schemaVersion: 1,
				toolchain: { command: bun, version: recipe.toolchain.version },
				entries: [{ source: "adapter/serve.ts", output: "serve.js", executable: true }],
				aliases: [],
			},
		})
		writeFileSync(join(release, "dist/package.json"), `${JSON.stringify({ name: "@asterline/codegraph-mcp", version: "4.17.1", private: true, type: "module" }, null, 2)}\n`)
		writeFileSync(join(release, "runtime-audit.json"), `${JSON.stringify({ entries: ["dist/serve.js"], files: ["dist/serve.js", "dist/package.json"], paths: ["dist"] }, null, 2)}\n`)
		const outputFiles = ["serve.js", "package.json"].map((file) => ({ file: `dist/${file}`, sha256: sha256(readFileSync(join(release, "dist", file))) }))
		writeFileSync(join(release, "transform-provenance.json"), `${JSON.stringify({ schemaVersion: 1, upstream: recipe.upstream, recipeSha256: sha256(recipeBytes), transformedFiles, outputFiles }, null, 2)}\n`)
		await replaceDirectory(release, options.output)
	} finally {
		rmSync(staging, { recursive: true, force: true })
	}
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
	process.stdout.write("Usage: node build-codegraph.mjs --source <oh-my-openagent-v4.17.1> [--output <mcp/codegraph>]\n")
} else {
	build(args).catch((error) => {
		process.stderr.write(`CodeGraph build error: ${error instanceof Error ? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
