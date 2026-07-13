import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { containedPath, resolvePluginData, resolvePluginRoot } from "./paths.ts";
import type { BootstrapEnvironment } from "./paths.ts";
import { LOCK_STALE_MS, readJsonRecord } from "./state.ts";

export const BOOTSTRAP_RESTART_NOTICE = "Asterline bootstrap running in background — restart Auggie after it completes";

export type HookAction = "spawned" | "skip-completed" | "skip-locked" | "spawn-failed";
export type SpawnInvocation = {
	readonly command: string;
	readonly args: readonly string[];
	readonly env: BootstrapEnvironment;
};
export type HookOptions = {
	readonly env: BootstrapEnvironment;
	readonly now?: number;
	readonly spawnWorker?: (invocation: SpawnInvocation) => void;
	readonly writeOutput?: (line: string) => void;
};

async function isFresh(path: string, now: number): Promise<boolean> {
	try {
		return now - (await stat(path)).mtimeMs < LOCK_STALE_MS;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

function spawnDetached(invocation: SpawnInvocation): void {
	const child = spawn(invocation.command, [...invocation.args], { detached: true, env: invocation.env, stdio: "ignore" });
	child.unref();
}

export async function runSessionStart(options: HookOptions): Promise<HookAction> {
	// no-excuse-ok: catch -- Auggie hook boundary is contractually fail-open.
	try {
		const now = options.now ?? Date.now();
		const pluginRoot = resolvePluginRoot(options.env, import.meta.url);
		const dataRoot = resolvePluginData(options.env);
		const manifest = await readJsonRecord(containedPath(pluginRoot, ".augment-plugin", "plugin.json"));
		const state = await readJsonRecord(containedPath(dataRoot, "bootstrap", "state.json"));
		if (typeof manifest["version"] === "string" && state["completedForVersion"] === manifest["version"]) return "skip-completed";
		if (await isFresh(containedPath(dataRoot, "bootstrap", "worker.lock"), now)) return "skip-locked";
		(options.spawnWorker ?? spawnDetached)({
			command: process.execPath,
			args: [fileURLToPath(import.meta.url), "worker"],
			env: options.env,
		});
		const output = JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: BOOTSTRAP_RESTART_NOTICE } });
		(options.writeOutput ?? ((line: string) => process.stdout.write(`${line}\n`)))(output);
		return "spawned";
	} catch (error) {
		process.stderr.write(`[asterline-bootstrap] ${error instanceof Error ? error.message : String(error)}\n`);
		return "spawn-failed";
	}
}
