#!/usr/bin/env bun
import { spawn } from "node:child_process"
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const DEFAULT_TIMEOUT_MS = 60_000
const HELP = "Usage: bun verify-lsp.ts <file> [--timeout=ms]\n"
const MCP_CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../../../mcp/lsp/dist/cli.js")

type TextContent = {
	readonly type: "text"
	readonly text: string
}

type DiagnosticsDetails = {
	readonly mode: "file" | "directory"
	readonly totalDiagnostics: number
	readonly error?: string
	readonly errorKind?: "missing_dependency" | "no_files" | "invalid_path"
}

type ToolResult = {
	readonly content: readonly TextContent[]
	readonly isError: boolean
	readonly details: DiagnosticsDetails | null
}

class McpRuntimeNotFoundError extends Error {
	constructor(readonly path: string) {
		super(`Asterline LSP MCP runtime not found: ${path}`)
		this.name = "McpRuntimeNotFoundError"
	}
}

class McpProtocolError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "McpProtocolError"
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseDetails(value: unknown): DiagnosticsDetails | null {
	if (!isRecord(value)) return null
	const mode = value["mode"]
	const totalDiagnostics = value["totalDiagnostics"]
	if ((mode !== "file" && mode !== "directory") || typeof totalDiagnostics !== "number") return null
	const error = typeof value["error"] === "string" ? value["error"] : undefined
	const rawKind = value["errorKind"]
	const errorKind =
		rawKind === "missing_dependency" || rawKind === "no_files" || rawKind === "invalid_path" ? rawKind : undefined
	return { mode, totalDiagnostics, ...(error === undefined ? {} : { error }), ...(errorKind === undefined ? {} : { errorKind }) }
}

function parseToolResult(line: string): ToolResult {
	let decoded: unknown
	try {
		decoded = JSON.parse(line)
	} catch (error) {
		throw new McpProtocolError(`invalid JSON-RPC response: ${error instanceof Error ? error.message : String(error)}`)
	}
	if (!isRecord(decoded) || decoded["id"] !== 1 || !isRecord(decoded["result"])) {
		throw new McpProtocolError("invalid JSON-RPC response envelope")
	}
	const result = decoded["result"]
	const content = result["content"]
	if (!Array.isArray(content)) throw new McpProtocolError("JSON-RPC result has no content array")
	const textContent: TextContent[] = []
	for (const item of content) {
		if (!isRecord(item) || item["type"] !== "text" || typeof item["text"] !== "string") {
			throw new McpProtocolError("JSON-RPC result contains invalid content")
		}
		textContent.push({ type: "text", text: item["text"] })
	}
	return { content: textContent, isError: result["isError"] === true, details: parseDetails(result["details"]) }
}

function daemonPids(root: string): readonly number[] {
	if (!existsSync(root)) return []
	const pids: number[] = []
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name)
			if (entry.isDirectory()) visit(path)
			if (entry.isFile() && entry.name === "daemon.pid") {
				const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10)
				if (Number.isInteger(pid) && pid > 0) pids.push(pid)
			}
		}
	}
	visit(root)
	return pids
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return false
		throw error
	}
}

function signalProcess(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
	try {
		process.kill(pid, signal)
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return
		throw error
	}
}

async function waitForProcessExit(pids: readonly number[]): Promise<void> {
	for (let attempt = 0; attempt < 40 && pids.some(isProcessAlive); attempt += 1) await Bun.sleep(25)
}

async function stopDaemon(root: string): Promise<void> {
	const pids = daemonPids(root)
	for (const pid of pids) signalProcess(pid, "SIGTERM")
	await waitForProcessExit(pids)
	for (const pid of pids.filter(isProcessAlive)) signalProcess(pid, "SIGKILL")
	await waitForProcessExit(pids)
	rmSync(root, { recursive: true, force: true })
}

function requestDiagnostics(filePath: string, timeoutMs: number, daemonDir: string): Promise<ToolResult> {
	if (!existsSync(MCP_CLI)) throw new McpRuntimeNotFoundError(MCP_CLI)
	return new Promise((resolveResult, reject) => {
		const child = spawn(process.execPath, [MCP_CLI, "mcp"], {
			cwd: process.cwd(),
			env: { ...process.env, ASTERLINE_LSP_DAEMON_DIR: daemonDir },
			stdio: ["pipe", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		let settled = false
		const finish = (action: () => void): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			child.kill("SIGTERM")
			action()
		}
		const timer = setTimeout(
			() => finish(() => reject(new McpProtocolError(`diagnostics request timed out after ${timeoutMs}ms`))),
			timeoutMs,
		)
		child.stdout.setEncoding("utf8")
		child.stderr.setEncoding("utf8")
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk
			const lineEnd = stdout.indexOf("\n")
			if (lineEnd >= 0) {
				try {
					const result = parseToolResult(stdout.slice(0, lineEnd))
					finish(() => resolveResult(result))
				} catch (error) {
					finish(() => reject(error instanceof Error ? error : new McpProtocolError(String(error))))
				}
			}
		})
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk
		})
		child.once("error", (error) => finish(() => reject(error)))
		child.once("close", (code) => {
			if (!settled) finish(() => reject(new McpProtocolError(`MCP process exited ${code ?? "unknown"}: ${stderr.trim()}`)))
		})
		child.stdin.end(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "diagnostics", arguments: { filePath, severity: "all" } } })}\n`,
		)
	})
}

function parseTimeout(args: readonly string[]): number {
	const flag = args.find((arg) => arg.startsWith("--timeout="))
	if (flag === undefined) return DEFAULT_TIMEOUT_MS
	const parsed = Number.parseInt(flag.slice("--timeout=".length), 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

async function run(filePath: string, timeoutMs: number): Promise<number> {
	const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
	const daemonDir = join(tmpdir(), `asterline-verify-lsp-${process.pid}-${Date.now()}`)
	try {
		const result = await requestDiagnostics(absolute, timeoutMs, daemonDir)
		const text = result.content.map((part) => part.text).join("\n")
		if (!result.isError && result.details === null) {
			process.stdout.write(`FAIL ${absolute}: MCP returned no diagnostics metadata\n${text}\n`)
			return 1
		}
		if (result.details?.errorKind === "missing_dependency") {
			process.stdout.write(`FAIL ${absolute}: language server not installed\n${text}\n`)
			return 1
		}
		if (result.isError || result.details?.errorKind === "invalid_path" || result.details?.errorKind === "no_files") {
			process.stdout.write(`FAIL ${absolute}: ${result.details?.error ?? text}\n`)
			return 1
		}
		const count = result.details?.totalDiagnostics ?? 0
		process.stdout.write(`OK ${absolute}: LSP roundtrip succeeded (${count} diagnostic(s))\n${text}\n`)
		return 0
	} finally {
		await stopDaemon(daemonDir)
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	if (args.includes("--help") || args.includes("-h")) {
		process.stdout.write(HELP)
		return
	}
	const filePath = args.find((arg) => !arg.startsWith("--"))
	if (filePath === undefined) {
		process.stderr.write(HELP)
		process.exitCode = 2
		return
	}
	if (!existsSync(filePath) || !statSync(filePath).isFile()) {
		process.stderr.write(`verify-lsp: not a file: ${filePath}\n`)
		process.exitCode = 2
		return
	}
	try {
		process.exitCode = await run(filePath, parseTimeout(args))
	} catch (error) {
		if (error instanceof McpRuntimeNotFoundError) {
			process.stderr.write(`SKIP: ${error.message}\n`)
			process.exitCode = 3
			return
		}
		process.stderr.write(`FAIL ${filePath}: ${error instanceof Error ? error.message : String(error)}\n`)
		process.exitCode = 1
	}
}

await main()
