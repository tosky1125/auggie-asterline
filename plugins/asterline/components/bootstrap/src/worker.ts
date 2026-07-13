import { readFile } from "node:fs/promises";

import { provisionNativeAsset } from "../../../scripts/native-assets.mjs";
import { containedPath, parseDataOverride, resolvePluginData, resolvePluginRoot } from "./paths.ts";
import type { BootstrapEnvironment } from "./paths.ts";
import { acquireLock, readJsonRecord, writeJsonAtomic } from "./state.ts";

const TOOL_IDS = ["ast-grep", "codegraph"] as const;

export type BootstrapStatus = "success" | "degraded";
export type DegradedEntry = { readonly component: string; readonly reason: string };
export type WorkerResult =
	| { readonly kind: "skipped"; readonly reason: "completed" | "locked" }
	| { readonly kind: "ran"; readonly status: BootstrapStatus; readonly degraded: readonly DegradedEntry[] };

export type WorkerOptions = {
	readonly env: BootstrapEnvironment;
	readonly once: boolean;
	readonly dataOverride?: string;
	readonly now?: number;
};

export function downloadsEnabled(env: BootstrapEnvironment): boolean {
	return env["ASTERLINE_BOOTSTRAP_DOWNLOAD"] === "1";
}

async function pluginVersion(pluginRoot: string): Promise<string | undefined> {
	const manifest = await readJsonRecord(containedPath(pluginRoot, ".augment-plugin", "plugin.json"));
	return typeof manifest["version"] === "string" ? manifest["version"] : undefined;
}

async function provisionTool(
	toolId: (typeof TOOL_IDS)[number],
	input: { readonly env: BootstrapEnvironment; readonly pluginRoot: string; readonly dataRoot: string },
): Promise<DegradedEntry | undefined> {
	if (input.env["ASTERLINE_BOOTSTRAP_INTERRUPT"] === toolId) throw new Error(`interrupted while provisioning ${toolId}`);
	const sbom: unknown = JSON.parse(await readFile(containedPath(input.pluginRoot, "native", "SBOM.json"), "utf8"));
	const result = await provisionNativeAsset({
		sbom,
		toolId,
		cacheRoot: containedPath(input.dataRoot, "native"),
		allowDownload: downloadsEnabled(input.env),
	});
	return result.status === "available" ? undefined : { component: toolId, reason: result.message };
}

export async function runWorker(options: WorkerOptions): Promise<WorkerResult> {
	const now = options.now ?? Date.now();
	const pluginRoot = resolvePluginRoot(options.env, import.meta.url);
	const configuredDataRoot = resolvePluginData(options.env);
	const dataRoot = parseDataOverride(options.dataOverride, configuredDataRoot) ?? configuredDataRoot;
	const statePath = containedPath(dataRoot, "bootstrap", "state.json");
	const version = await pluginVersion(pluginRoot);
	const lock = await acquireLock(containedPath(dataRoot, "bootstrap", "worker.lock"), now);
	if (lock === null) return { kind: "skipped", reason: "locked" };
	try {
		const previous = await readJsonRecord(statePath);
		if (!options.once && version !== undefined && previous["completedForVersion"] === version) {
			return { kind: "skipped", reason: "completed" };
		}
		const degraded: DegradedEntry[] = [];
		for (const toolId of TOOL_IDS) {
			// no-excuse-ok: catch -- each native asset is an independent degraded boundary.
			try {
				const result = await provisionTool(toolId, { dataRoot, env: options.env, pluginRoot });
				if (result !== undefined) degraded.push(result);
			} catch (error) {
				degraded.push({ component: toolId, reason: error instanceof Error ? error.message : String(error) });
			}
		}
		const status: BootstrapStatus = degraded.length === 0 ? "success" : "degraded";
		await writeJsonAtomic(statePath, {
			...(status === "success" && version !== undefined ? { completedForVersion: version } : {}),
			degraded,
			lastAttemptAt: now,
			lastStatus: status,
		});
		return { degraded, kind: "ran", status };
	} finally {
		await lock.release();
	}
}
