#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { accessSync, constants, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { bundleComponent, replaceDirectory } from "../../../scripts/bundle-component.mjs"

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(runtimeRoot, "../../..")
const defaultRecipe = join(runtimeRoot, "git-bash-mcp.build.json")
const defaultOutput = join(pluginRoot, "mcp/git_bash")

class GitBashBuildError extends Error {}

const sha256 = (value) => createHash("sha256").update(value).digest("hex")

function parseArgs(args) {
	if (args.includes("--help") || args.includes("-h")) return { help: true }
	const values = new Map()
	for (let index = 0; index < args.length; index += 2) {
		const option = args[index]
		const value = args[index + 1]
		if (!["--source", "--output", "--recipe"].includes(option) || value === undefined || values.has(option)) {
			throw new GitBashBuildError(`unknown, duplicate, or incomplete option ${JSON.stringify(option)}`)
		}
		values.set(option, value)
	}
	const source = values.get("--source") ?? process.env.ASTERLINE_UPSTREAM_SOURCE
	if (source === undefined) throw new GitBashBuildError("--source or ASTERLINE_UPSTREAM_SOURCE is required")
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
	throw new GitBashBuildError(`${name} is not available on PATH`)
}

function git(root, args) {
	const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" })
	if (result.error || result.status !== 0) throw new GitBashBuildError(result.error?.message ?? result.stderr.trim())
	return result.stdout.trim()
}

function verifySource(root, recipe) {
	if (git(root, ["rev-parse", "HEAD"]) !== recipe.upstream.commit) throw new GitBashBuildError("upstream commit mismatch")
	for (const source of recipe.sources) {
		if (git(root, ["rev-parse", `HEAD:${source.path}`]) !== source.treeOid) {
			throw new GitBashBuildError(`upstream tree mismatch: ${source.path}`)
		}
	}
}

function materialize(source, staging, recipe) {
	for (const item of recipe.sources) cpSync(join(source, item.path, "src"), join(staging, item.path, "src"), { recursive: true })
	const digests = new Map()
	for (const transform of recipe.transforms) {
		const path = join(staging, transform.file)
		const before = readFileSync(path, "utf8")
		const count = before.split(transform.from).length - 1
		if (count !== transform.expectedCount) throw new GitBashBuildError(`transform count mismatch: ${transform.file}`)
		if (!digests.has(transform.file)) digests.set(transform.file, sha256(before))
		writeFileSync(path, before.replaceAll(transform.from, transform.to))
	}
	return [...digests].sort(([left], [right]) => left.localeCompare(right)).map(([file, canonicalSha256]) => ({
		file,
		canonicalSha256,
		transformedSha256: sha256(readFileSync(join(staging, file))),
	}))
}

async function build(options) {
	const recipeBytes = readFileSync(options.recipe)
	const recipe = JSON.parse(recipeBytes)
	verifySource(options.source, recipe)
	const bun = executable(recipe.toolchain.command)
	const version = spawnSync(bun, ["--version"], { encoding: "utf8" })
	if (version.status !== 0 || version.stdout.trim() !== recipe.toolchain.version) throw new GitBashBuildError("Bun version mismatch")
	const staging = mkdtempSync(join(dirname(options.output), ".git-bash-build-"))
	const release = join(staging, "release")
	try {
		const transformedFiles = materialize(options.source, join(staging, "source"), recipe)
		await bundleComponent({
			source: join(staging, "source"),
			output: join(release, "dist"),
			config: {
				schemaVersion: 1,
				toolchain: { command: bun, version: recipe.toolchain.version },
				entries: recipe.entries,
				aliases: recipe.aliases,
			},
		})
		writeFileSync(join(release, "dist/package.json"), `${JSON.stringify({ name: "@asterline/git-bash-mcp", version: "4.17.1", private: true, type: "module" }, null, 2)}\n`)
		const outputFiles = ["cli.js", "index.js", "package.json"].map((file) => ({
			file: `dist/${file}`,
			sha256: sha256(readFileSync(join(release, "dist", file))),
		}))
		writeFileSync(join(release, "runtime-audit.json"), `${JSON.stringify({ entries: ["dist/cli.js", "dist/index.js"], files: outputFiles.map(({ file }) => file), paths: ["dist"] }, null, 2)}\n`)
		writeFileSync(join(release, "transform-provenance.json"), `${JSON.stringify({ schemaVersion: 1, upstream: recipe.upstream, recipeSha256: sha256(recipeBytes), transformedFiles, outputFiles }, null, 2)}\n`)
		await replaceDirectory(release, options.output)
	} finally {
		rmSync(staging, { recursive: true, force: true })
	}
}

const args = parseArgs(process.argv.slice(2))
if (args.help) process.stdout.write("Usage: node build-git-bash.mjs --source <oh-my-openagent-v4.17.1> [--output <mcp/git_bash>]\n")
else build(args).catch((error) => {
	process.stderr.write(`Git Bash build error: ${error instanceof Error ? error.message : String(error)}\n`)
	process.exitCode = 1
})
