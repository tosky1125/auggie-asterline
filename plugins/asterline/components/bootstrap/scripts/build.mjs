#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleComponent } from "../../../scripts/bundle-component.mjs";

const componentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = resolve(componentRoot, "..", "..");
const configuredBun = process.env["BUN"];
const probe = configuredBun === undefined
	? spawnSync("bun", ["--eval", "process.stdout.write(process.execPath)"], { encoding: "utf8", shell: false })
	: undefined;
if (configuredBun === undefined && (probe?.error !== undefined || probe?.status !== 0 || probe.stdout.trim().length === 0)) {
	throw new Error(`Bun 1.3.14 is required to reproduce the bootstrap bundle: ${probe?.error?.message ?? probe?.stderr.trim()}`);
}
const bun = realpathSync(configuredBun ?? probe?.stdout.trim() ?? "");

await bundleComponent({
	source: pluginRoot,
	output: join(componentRoot, "dist"),
	config: {
		schemaVersion: 1,
		toolchain: { command: bun, version: "1.3.14" },
		entries: [{ source: "components/bootstrap/src/cli.ts", output: "cli.js", executable: true }],
		aliases: [],
	},
});
