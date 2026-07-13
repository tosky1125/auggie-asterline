#!/usr/bin/env node
import { join, resolve } from "node:path"
import { cwd, env, stdin, stderr, stdout } from "node:process"
import { fileURLToPath } from "node:url"

import { runBridgedCodegraphProcess } from "../upstream/codegraph/mcp-bridge.ts"
import { runUnavailableCodegraphMcpServer } from "../upstream/codegraph/mcp-unavailable.ts"
import { codegraphEnvironment } from "./environment.ts"
import { pluginData, pluginRoot, resolveCodegraphBinary, resolveProjectRoot } from "./paths.ts"

const VERSION = "1.0.1"

export async function runCodegraphMcp(): Promise<number> {
	const root = pluginRoot(import.meta.url)
	const resolution = resolveCodegraphBinary({ env, pluginRoot: root })
	if (resolution.executablePath === undefined) {
		const reason = `${resolution.reason ?? "CodeGraph MCP unavailable."}\n`
		stderr.write(reason)
		await runUnavailableCodegraphMcpServer({ input: stdin, output: stdout, reason, serverVersion: VERSION })
		return 0
	}
	return runBridgedCodegraphProcess(resolution.executablePath, ["serve", "--mcp"], {
		cwd: resolveProjectRoot(env, cwd()),
		env: codegraphEnvironment(env, join(pluginData(env), "codegraph")),
		input: stdin,
		output: stdout,
		stderr,
		stdio: "pipe",
	})
}

export function help(): string {
	return "Usage: asterline-codegraph-mcp\nServes the checksum-pinned CodeGraph 1.0.1 MCP runtime.\n"
}

async function main(): Promise<void> {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		stdout.write(help())
		return
	}
	process.exitCode = await runCodegraphMcp()
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => { // no-excuse-ok: catch -- CLI trust boundary.
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
