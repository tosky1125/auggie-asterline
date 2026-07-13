import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { nativeAssetDoctor } from "../../../scripts/native-assets.mjs"

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

export async function resolveCodegraphBinary(options: {
	readonly env: Environment
	readonly pluginRoot: string
	readonly platform?: NodeJS.Platform
	readonly arch?: string
}): Promise<{ readonly executablePath?: string; readonly reason?: string }> {
	const platform = options.platform ?? process.platform
	const arch = options.arch ?? process.arch
	let manifest: unknown
	try {
		manifest = JSON.parse(readFileSync(join(options.pluginRoot, "native", "SBOM.json"), "utf8"))
	} catch (error) {
		return { reason: `CodeGraph MCP unavailable: native manifest could not be read (${message(error)}).` }
	}
	const component = codegraphComponent(manifest)
	if (component?.version !== VERSION) {
		return { reason: `CodeGraph MCP unavailable: checksum-pinned CodeGraph ${VERSION} is absent from the native manifest.` }
	}
	try {
		const result = await nativeAssetDoctor({
			sbom: manifest,
			toolId: "codegraph",
			cacheRoot: join(pluginData(options.env), "native"),
			platform,
			arch,
		})
		if (result.status === "available") return { executablePath: result.executablePath }
		return { reason: `CodeGraph MCP unavailable: ${result.message}.` }
	} catch (error) {
		return { reason: `CodeGraph MCP unavailable: native verification failed (${message(error)}).` }
	}
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

type NativeComponent = { readonly version: string }

function codegraphComponent(value: unknown): NativeComponent | undefined {
	if (!record(value) || !Array.isArray(value["components"])) return undefined
	const raw = value["components"].find((entry) => record(entry) && entry["id"] === "codegraph")
	if (!record(raw) || typeof raw["version"] !== "string") return undefined
	return { version: raw["version"] }
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
