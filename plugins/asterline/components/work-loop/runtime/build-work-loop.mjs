#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleComponent } from "../../../scripts/bundle-component.mjs";

const runtimeRoot = dirname(fileURLToPath(import.meta.url));
const componentRoot = resolve(runtimeRoot, "..");
const componentsRoot = resolve(componentRoot, "..");
const recipePath = join(runtimeRoot, "work-loop.build.json");

class WorkLoopBuildError extends Error {}

function executable(name) {
	if (name.includes("/") || name.includes("\\")) throw new WorkLoopBuildError("toolchain command must be a bare executable name");
	for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
		const candidate = join(directory, name);
		try { accessSync(candidate, constants.X_OK); return resolve(candidate); }
		catch (error) { if (!(error instanceof Error)) throw error; }
	}
	throw new WorkLoopBuildError(`${name} is not available on PATH`);
}

async function build() {
	const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
	if (recipe?.schemaVersion !== 1 || typeof recipe?.toolchain?.command !== "string" || typeof recipe?.toolchain?.version !== "string" || !Array.isArray(recipe?.entries) || !Array.isArray(recipe?.aliases)) throw new WorkLoopBuildError("invalid work-loop build recipe");
	const bun = executable(recipe.toolchain.command);
	const version = spawnSync(bun, ["--version"], { encoding: "utf8" });
	if (version.error || version.status !== 0 || version.stdout.trim() !== recipe.toolchain.version) throw new WorkLoopBuildError(`Bun version mismatch: expected ${recipe.toolchain.version}`);
	await bundleComponent({
		source: componentsRoot,
		output: join(componentRoot, "dist"),
		config: { schemaVersion: 1, toolchain: { command: bun, version: recipe.toolchain.version }, entries: recipe.entries, aliases: recipe.aliases },
	});
}

build().catch((error) => {
	process.stderr.write(`Work-loop build error: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
