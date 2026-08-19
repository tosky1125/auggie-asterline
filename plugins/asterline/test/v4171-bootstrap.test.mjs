import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = new URL("..", import.meta.url);
const componentRoot = new URL("../components/bootstrap/", import.meta.url);
const distPath = fileURLToPath(new URL("dist/cli.js", componentRoot));

test("Given the v4.19.4 port, when metadata is inspected, then provenance and Auggie hook fields are exact", () => {
	const pkg = JSON.parse(readFileSync(new URL("package.json", componentRoot), "utf8"));
	const hooks = JSON.parse(readFileSync(new URL("hooks/hooks.json", componentRoot), "utf8"));
	const provenance = JSON.parse(readFileSync(new URL("UPSTREAM-PROVENANCE.json", componentRoot), "utf8"));
	assert.equal(pkg.version, "4.19.4");
	assert.equal(provenance.upstream.commit, "b072d279110bdda2c6ac2525d0d24dc54d16148a");
	assert.equal(provenance.upstream.treeOid, "bece3bbdcb0423d66197006af86ed82dcfad55d0");
	assert.deepEqual(Object.keys(hooks.hooks), ["SessionStart"]);
	assert.equal(JSON.stringify(hooks).includes("statusMessage"), false);
});

test("Given the shipped bundle, when invoked, then it is self-contained and exposes the current runtime", () => {
	const result = spawnSync(process.execPath, [distPath, "help"], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Asterline bootstrap 4\.19\.4/);
	const source = readFileSync(distPath, "utf8");
	for (const banned of ["node_modules", "vendor/", "npm install", "pnpm", "posthog", "telemetry"]) {
		assert.equal(source.toLowerCase().includes(banned), false, banned);
	}
});

test("Given a stale bootstrap lock, when SessionStart runs, then it replaces the lock through a detached worker", async () => {
	const home = await mkdtemp(join(tmpdir(), "asterline-bootstrap-hook-"));
	const root = join(home, "plugin");
	const data = join(home, "data");
	await mkdir(join(root, ".augment-plugin"), { recursive: true });
	await mkdir(join(data, "bootstrap"), { recursive: true });
	await writeFile(join(root, ".augment-plugin", "plugin.json"), '{"version":"4.19.4"}');
	const lockPath = join(data, "bootstrap", "worker.lock");
	await mkdir(lockPath);
	const old = new Date(0);
	await import("node:fs/promises").then(({ utimes }) => utimes(lockPath, old, old));
	const result = spawnSync(process.execPath, [distPath, "hook", "session-start"], {
		encoding: "utf8",
		env: { HOME: home, AUGMENT_PLUGIN_ROOT: root, ASTERLINE_PLUGIN_DATA: data, PATH: process.env.PATH },
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Asterline bootstrap running in background/);
});

test("Given interrupted provisioning and a hostile data path, when the worker runs, then it degrades and contains writes", async () => {
	const home = await mkdtemp(join(tmpdir(), "asterline-bootstrap-worker-"));
	const root = join(home, "plugin");
	const outside = join(home, "outside");
	await mkdir(join(root, ".augment-plugin"), { recursive: true });
	await writeFile(join(root, ".augment-plugin", "plugin.json"), '{"version":"4.19.4"}');
	const escaped = spawnSync(process.execPath, [distPath, "worker", "--data-root", "../outside", "--once"], {
		encoding: "utf8",
		env: { HOME: home, AUGMENT_PLUGIN_ROOT: root, PATH: process.env.PATH },
	});
	assert.equal(escaped.status, 0, escaped.stderr);
	assert.match(escaped.stderr, /contained/);
	await assert.rejects(stat(outside));

	const data = join(home, "safe-data");
	const interrupted = spawnSync(process.execPath, [distPath, "worker", "--once"], {
		encoding: "utf8",
		env: { HOME: home, AUGMENT_PLUGIN_ROOT: root, ASTERLINE_PLUGIN_DATA: data, ASTERLINE_BOOTSTRAP_INTERRUPT: "ast-grep", PATH: process.env.PATH },
	});
	assert.equal(interrupted.status, 0, interrupted.stderr);
	const state = JSON.parse(await readFile(join(data, "bootstrap", "state.json"), "utf8"));
	assert.equal(state.lastStatus, "degraded");
	assert.equal(state.degraded[0].component, "ast-grep");
	assert.equal(state.completedForVersion, undefined);
});
