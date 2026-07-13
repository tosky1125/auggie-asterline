import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "1.0.1"

type Environment = Readonly<Record<string, string | undefined>>

export class CodegraphPathError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "CodegraphPathError"
	}
}

export function pluginRoot(moduleUrl: string): string {
	return resolve(fileURLToPath(new URL("../../../", moduleUrl)))
}

export function pluginData(env: Environment): string {
	const configured = env["ASTERLINE_PLUGIN_DATA"]?.trim() || env["PLUGIN_DATA"]?.trim()
	if (configured !== undefined) {
		if (!isAbsolute(configured)) throw new CodegraphPathError("plugin data root must be absolute")
		return resolve(configured)
	}
	return join(resolve(env["HOME"]?.trim() || homedir()), ".augment", "asterline", "plugin-data")
}

export function resolveCodegraphBinary(options: {
	readonly env: Environment
	readonly pluginRoot: string
	readonly platform?: NodeJS.Platform
	readonly arch?: string
}): { readonly executablePath?: string; readonly reason?: string } {
	const platform = options.platform ?? process.platform
	const arch = options.arch ?? process.arch
	let manifest: unknown
	try {
		manifest = JSON.parse(readFileSync(join(options.pluginRoot, "native", "SBOM.json"), "utf8"))
	} catch (error) {
		return { reason: `CodeGraph MCP unavailable: native manifest could not be read (${message(error)}).` }
	}
	const component = codegraphComponent(manifest)
	if (component === undefined || component.version !== VERSION) {
		return { reason: `CodeGraph MCP unavailable: checksum-pinned CodeGraph ${VERSION} is absent from the native manifest.` }
	}
	const slug = `${platform}-${arch}`
	const asset = component.assets[slug]
	if (asset === undefined) return { reason: `CodeGraph MCP unavailable: CodeGraph ${VERSION} does not support ${slug}.` }
	const executablePath = join(pluginData(options.env), "native", "codegraph", VERSION, slug, asset.executable)
	if (!existsSync(executablePath)) return { reason: `CodeGraph MCP unavailable: verified native asset is missing at ${executablePath}.` }
	return { executablePath }
}

export function resolveProjectRoot(env: Environment, fallback: string): string {
	for (const key of ["ASTERLINE_CODEGRAPH_PROJECT_CWD", "PWD"] as const) {
		const value = env[key]?.trim()
		if (value === undefined || value.length === 0) continue
		const candidate = resolve(value)
		if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
	}
	return resolve(fallback)
}

type NativeComponent = { readonly assets: Readonly<Record<string, { readonly executable: string }>>; readonly version: string }

function codegraphComponent(value: unknown): NativeComponent | undefined {
	if (!record(value) || !Array.isArray(value["components"])) return undefined
	const raw = value["components"].find((entry) => record(entry) && entry["id"] === "codegraph")
	if (!record(raw) || typeof raw["version"] !== "string" || !record(raw["assets"])) return undefined
	const assets: Record<string, { readonly executable: string }> = {}
	for (const [slug, asset] of Object.entries(raw["assets"])) {
		if (!record(asset) || typeof asset["executable"] !== "string") return undefined
		const executable = asset["executable"]
		if (isAbsolute(executable) || executable.includes("\\") || executable.split("/").some((part) => part === ".." || part === "")) return undefined
		assets[slug] = { executable }
	}
	return { assets, version: raw["version"] }
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
