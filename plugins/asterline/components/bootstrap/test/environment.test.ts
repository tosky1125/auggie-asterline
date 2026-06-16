import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	bootstrapLocks,
	detectInstallFlow,
	detectInstallFlowForTest,
	detectInstallFlowFromEnvironment,
	resolveBootstrapLockPath,
	resolveBootstrapStatePath,
	resolveAsterlineHome,
} from "../src/environment.ts";

const componentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(dirname(dirname(dirname(componentRoot)))));

const GIT_SOURCE_CONFIG = [
	"[marketplaces.sisyphuslabs]",
	'last_updated = "2026-06-12T00:00:00Z"',
	'source_type = "git"',
	'source = "https://github.com/asterline-ai/asterline.git"',
	"",
].join("\n");

const LOCAL_SOURCE_CONFIG = [
	"[marketplaces.sisyphuslabs]",
	'last_updated = "2026-06-12T00:00:00Z"',
	'source_type = "local"',
	'source = "/Users/someone/local-workspaces/asterline"',
	"",
].join("\n");

async function withTempDir<T>(prefix: string, run: (directory: string) => Promise<T>): Promise<T> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	try {
		return await run(directory);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

async function writePluginRoot(directory: string, options: { readonly withSnapshot: boolean }): Promise<string> {
	const pluginRoot = join(directory, "plugins", "sisyphuslabs", "asterline", "4.9.2");
	await mkdir(pluginRoot, { recursive: true });
	if (options.withSnapshot) {
		await writeFile(join(pluginRoot, "asterline-install.json"), '{"packageName":"asterline-ai","version":"4.9.2"}\n');
	}
	return pluginRoot;
}

describe("detectInstallFlow", () => {
	it("#given an install snapshot and no config #when detecting #then reports npx-local", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: true });
			expect(await detectInstallFlow({ pluginRoot })).toBe("npx-local");
		});
	});

	it("#given no snapshot and no config #when detecting #then reports marketplace", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: false });
			expect(await detectInstallFlow({ pluginRoot })).toBe("marketplace");
		});
	});

	it("#given no snapshot and a git marketplace source #when detecting #then both signals agree on marketplace", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: false });
			expect(await detectInstallFlow({ configToml: GIT_SOURCE_CONFIG, pluginRoot })).toBe("marketplace");
		});
	});

	it("#given a snapshot and a local absolute marketplace source #when detecting #then both signals agree on npx-local", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: true });
			expect(await detectInstallFlow({ configToml: LOCAL_SOURCE_CONFIG, pluginRoot })).toBe("npx-local");
		});
	});

	it("#given a snapshot but a git marketplace source #when detecting #then the disagreement reports unknown", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: true });
			expect(await detectInstallFlow({ configToml: GIT_SOURCE_CONFIG, pluginRoot })).toBe("unknown");
		});
	});

	it("#given no snapshot but a local marketplace source #when detecting #then the disagreement reports unknown", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: false });
			expect(await detectInstallFlow({ configToml: LOCAL_SOURCE_CONFIG, pluginRoot })).toBe("unknown");
		});
	});

	it("#given an unclassifiable marketplace source #when detecting #then reports unknown", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: false });
			const config = ['[marketplaces.sisyphuslabs]', 'source = "./relative/checkout"', ""].join("\n");
			expect(await detectInstallFlow({ configToml: config, pluginRoot })).toBe("unknown");
		});
	});

	it("#given a quoted marketplace header #when detecting #then the section is still recognized", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: false });
			const config = ['[marketplaces."sisyphuslabs"]', 'source = "https://github.com/asterline-ai/asterline"', ""].join("\n");
			expect(await detectInstallFlow({ configToml: config, pluginRoot })).toBe("marketplace");
		});
	});

	it("#given a config without the sisyphuslabs marketplace #when detecting #then only the snapshot signal decides", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: true });
			const config = ['[marketplaces.other]', 'source = "https://github.com/other/marketplace.git"', ""].join("\n");
			expect(await detectInstallFlow({ configToml: config, pluginRoot })).toBe("npx-local");
		});
	});

	it("#given a windows drive marketplace source #when detecting with a snapshot #then reports npx-local", async () => {
		await withTempDir("asterline-flow-", async (directory) => {
			const pluginRoot = await writePluginRoot(directory, { withSnapshot: true });
			const config = ["[marketplaces.sisyphuslabs]", 'source = "C:\\\\workspaces\\\\asterline"', ""].join("\n");
			expect(await detectInstallFlow({ configToml: config, pluginRoot })).toBe("npx-local");
		});
	});
});

describe("detectInstallFlowFromEnvironment", () => {
	it("#given a asterline store layout with a git marketplace config #when detecting from environment #then reports marketplace", async () => {
		await withTempDir("asterline-flow-env-", async (directory) => {
			const asterlineHome = join(directory, ".asterline");
			const pluginRoot = join(asterlineHome, "plugins", "sisyphuslabs", "asterline", "4.9.2");
			await mkdir(pluginRoot, { recursive: true });
			await writeFile(join(asterlineHome, "config.toml"), GIT_SOURCE_CONFIG);

			const detection = await detectInstallFlowFromEnvironment({ env: {}, pluginRoot });

			expect(detection.flow).toBe("marketplace");
			expect(detection.snapshotPresent).toBe(false);
		});
	});

	it("#given a asterline store layout with a local source and an install snapshot #when detecting from environment #then reports npx-local", async () => {
		await withTempDir("asterline-flow-env-", async (directory) => {
			const asterlineHome = join(directory, ".asterline");
			const pluginRoot = join(asterlineHome, "plugins", "sisyphuslabs", "asterline", "4.9.2");
			await mkdir(pluginRoot, { recursive: true });
			await writeFile(join(asterlineHome, "config.toml"), LOCAL_SOURCE_CONFIG);
			await writeFile(join(pluginRoot, "asterline-install.json"), '{"packageName":"asterline-ai","version":"4.9.2"}\n');

			const detection = await detectInstallFlowFromEnvironment({ env: {}, pluginRoot });

			expect(detection.flow).toBe("npx-local");
			expect(detection.snapshotPresent).toBe(true);
		});
	});
});

describe("sync-asterline-marketplace output", () => {
	it("#given a synced marketplace tree #when looking for the install snapshot #then it is absent and detection reports marketplace", async () => {
		await withTempDir("asterline-flow-sync-", async (directory) => {
			const sourceRoot = join(directory, "source");
			const asterlineRoot = join(directory, "asterline");
			await writeSyncSourceFixture(sourceRoot);

			const sync = spawnSync(
				process.execPath,
				["run", join(repoRoot, "script", "sync-asterline-marketplace.ts"), sourceRoot, asterlineRoot],
				{ encoding: "utf8" },
			);
			expect(sync.status).toBe(0);

			const syncedPluginRoot = join(asterlineRoot, "plugins", "asterline");
			expect(existsSync(syncedPluginRoot)).toBe(true);
			expect(existsSync(join(syncedPluginRoot, "asterline-install.json"))).toBe(false);
			expect(await detectInstallFlowForTest(syncedPluginRoot)).toBe("marketplace");
		});
	}, 30_000);

	it("#given the repo plugin source tree the sync copies #when looking for the install snapshot #then it never exists there", () => {
		const pluginSourceRoot = join(repoRoot, "packages", "asterline-runtime", "plugin");
		expect(existsSync(join(pluginSourceRoot, ".augment-plugin", "plugin.json"))).toBe(true);
		expect(existsSync(join(pluginSourceRoot, "asterline-install.json"))).toBe(false);
	});
});

describe("resolveAsterlineHome", () => {
	it("#given ASTERLINE_HOME in the environment #when resolving #then the env value wins", async () => {
		await withTempDir("asterline-home-", async (directory) => {
			const resolution = await resolveAsterlineHome({
				env: { ASTERLINE_HOME: directory },
				pluginRoot: join(directory, "plugins", "sisyphuslabs", "asterline", "4.9.2"),
			});
			expect(resolution).toEqual({ path: directory, source: "env" });
		});
	});

	it("#given a asterline store layout #when resolving without env #then walking up finds the config.toml dir", async () => {
		await withTempDir("asterline-home-", async (directory) => {
			const asterlineHome = join(directory, ".asterline");
			const pluginRoot = join(asterlineHome, "plugins", "sisyphuslabs", "asterline", "4.9.2");
			await mkdir(pluginRoot, { recursive: true });
			await writeFile(join(asterlineHome, "config.toml"), GIT_SOURCE_CONFIG);

			const resolution = await resolveAsterlineHome({ env: {}, pluginRoot });

			expect(resolution).toEqual({ path: asterlineHome, source: "walk-up" });
		});
	});

	it("#given config.toml six levels above the plugin root #when resolving #then the walk-up still finds it", async () => {
		await withTempDir("asterline-home-", async (directory) => {
			const pluginRoot = join(directory, "a", "b", "c", "d", "e", "f");
			await mkdir(pluginRoot, { recursive: true });
			await writeFile(join(directory, "config.toml"), "");

			const resolution = await resolveAsterlineHome({ env: {}, pluginRoot });

			expect(resolution).toEqual({ path: directory, source: "walk-up" });
		});
	});

	it("#given config.toml seven levels above the plugin root #when resolving #then the bounded walk falls back to the default home", async () => {
		await withTempDir("asterline-home-", async (directory) => {
			const pluginRoot = join(directory, "a", "b", "c", "d", "e", "f", "g");
			await mkdir(pluginRoot, { recursive: true });
			await writeFile(join(directory, "config.toml"), "");

			const resolution = await resolveAsterlineHome({ env: {}, pluginRoot });

			expect(resolution).toEqual({ path: join(homedir(), ".asterline"), source: "default" });
		});
	});

	it("#given no env and no config.toml ancestor #when resolving #then defaults to ~/.asterline", async () => {
		await withTempDir("asterline-home-", async (directory) => {
			const pluginRoot = join(directory, "plugins", "sisyphuslabs", "asterline", "4.9.2");
			await mkdir(pluginRoot, { recursive: true });

			const resolution = await resolveAsterlineHome({ env: {}, pluginRoot });

			expect(resolution).toEqual({ path: join(homedir(), ".asterline"), source: "default" });
		});
	});
});

describe("bootstrapLocks", () => {
	it("#given free locks #when acquiring twice #then the second acquirer gets null and release leaves no lock files", async () => {
		await withTempDir("asterline-locks-", async (directory) => {
			const pluginData = join(directory, "plugin-data");
			const env = { PLUGIN_DATA: pluginData };

			const first = await bootstrapLocks({ env, pluginData });
			expect(first).not.toBeNull();
			if (first === null) throw new Error("unreachable");
			expect(first.bootstrapLockPath).toBe(join(pluginData, "bootstrap", "state.json.lock"));
			expect(first.statePath).toBe(join(pluginData, "bootstrap", "state.json"));
			expect(first.autoUpdateLockPath).toBe(join(pluginData, "auto-update.json.lock"));
			expect(existsSync(first.bootstrapLockPath)).toBe(true);
			expect(existsSync(first.autoUpdateLockPath)).toBe(true);

			const second = await bootstrapLocks({ env, pluginData });
			expect(second).toBeNull();

			await first.release();
			expect(existsSync(first.bootstrapLockPath)).toBe(false);
			expect(existsSync(first.autoUpdateLockPath)).toBe(false);
		});
	});

	it("#given the auto-update lock already held #when acquiring #then returns null without leaking the bootstrap lock", async () => {
		await withTempDir("asterline-locks-", async (directory) => {
			const pluginData = join(directory, "plugin-data");
			const env = { PLUGIN_DATA: pluginData };
			const autoUpdateLockPath = join(pluginData, "auto-update.json.lock");
			await mkdir(pluginData, { recursive: true });
			await writeFile(autoUpdateLockPath, `${Date.now()}\n`);

			const handle = await bootstrapLocks({ env, pluginData });

			expect(handle).toBeNull();
			expect(existsSync(join(pluginData, "bootstrap", "state.json.lock"))).toBe(false);
			expect(existsSync(autoUpdateLockPath)).toBe(true);
		});
	});

	it("#given an explicit auto-update lock override #when acquiring #then the override path is honored", async () => {
		await withTempDir("asterline-locks-", async (directory) => {
			const pluginData = join(directory, "plugin-data");
			const overridePath = join(directory, "custom-auto-update.lock");
			const env = { ASTERLINE_AUTO_UPDATE_LOCK_PATH: overridePath, PLUGIN_DATA: pluginData };

			const handle = await bootstrapLocks({ env, pluginData });

			expect(handle).not.toBeNull();
			if (handle === null) throw new Error("unreachable");
			expect(handle.autoUpdateLockPath).toBe(overridePath);
			expect(existsSync(overridePath)).toBe(true);
			await handle.release();
			expect(existsSync(overridePath)).toBe(false);
		});
	});

	it("#given the path helpers #when resolving state and lock paths #then they follow the PLUGIN_DATA bootstrap layout", () => {
		expect(resolveBootstrapStatePath("/data/asterline-sisyphuslabs")).toBe(join("/data/asterline-sisyphuslabs", "bootstrap", "state.json"));
		expect(resolveBootstrapLockPath("/data/asterline-sisyphuslabs")).toBe(
			join("/data/asterline-sisyphuslabs", "bootstrap", "state.json.lock"),
		);
	});
});

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeExecutableStub(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, "#!/usr/bin/env node\n");
}

// Mirrors the minimal source tree script/sync-asterline-marketplace.test.ts uses so the
// real sync (including bundle validation) runs against a hermetic fixture.
async function writeSyncSourceFixture(sourceRoot: string): Promise<void> {
	const pluginSource = join(sourceRoot, "packages", "asterline-runtime", "plugin");
	await writeJson(join(sourceRoot, "packages", "asterline-runtime", "marketplace.json"), {
		name: "sisyphuslabs",
		plugins: [{ name: "asterline", source: "./plugins/asterline" }],
	});
	await writeJson(join(pluginSource, ".augment-plugin", "plugin.json"), { name: "asterline", version: "1.2.3" });
	await writeJson(join(pluginSource, "package.json"), { name: "@sisyphuslabs/asterline-runtime-plugin", version: "1.2.3" });
	const bootstrapSessionStart = {
		hooks: {
			SessionStart: [
				{
					hooks: [
						{
							command: 'node "${PLUGIN_ROOT}/components/bootstrap/dist/cli.js" hook session-start',
							commandWindows:
								'powershell -NoProfile -ExecutionPolicy Bypass -File "${PLUGIN_ROOT}\\components\\bootstrap\\scripts\\bootstrap.ps1"',
							statusMessage: "Asterline(1.2.3): Checking Bootstrap Provisioning",
							timeout: 30,
							type: "command",
						},
					],
				},
			],
		},
	};
	await writeJson(join(pluginSource, "hooks", "hooks.json"), bootstrapSessionStart);
	await writeJson(join(pluginSource, "components", "bootstrap", "hooks", "hooks.json"), bootstrapSessionStart);
	await writeJson(join(pluginSource, ".mcp.json"), {
		mcpServers: {
			ast_grep: { args: ["../../ast-grep-mcp/dist/cli.js", "mcp"], command: "node", cwd: "." },
			git_bash: { args: ["../../git-bash-mcp/dist/cli.js", "mcp"], command: "node", cwd: "." },
			lsp: { args: ["../../lsp-daemon/dist/cli.js", "mcp"], command: "node", cwd: "." },
		},
	});
	await mkdir(join(sourceRoot, "packages", "asterline-runtime", "asterline-repository", ".github", "workflows"), { recursive: true });
	await writeFile(
		join(sourceRoot, "packages", "asterline-runtime", "asterline-repository", ".github", "workflows", "pr-source-guidance.yml"),
		"name: PR source guidance\n\non:\n  pull_request_target:\n",
	);
	await writeExecutableStub(join(pluginSource, "components", "bootstrap", "dist", "cli.js"));
	await mkdir(join(pluginSource, "components", "bootstrap", "scripts"), { recursive: true });
	await writeFile(join(pluginSource, "components", "bootstrap", "scripts", "bootstrap.ps1"), "exit 0\n");
	await writeExecutableStub(join(sourceRoot, "packages", "ast-grep-mcp", "dist", "cli.js"));
	await writeExecutableStub(join(sourceRoot, "packages", "git-bash-mcp", "dist", "cli.js"));
	await writeExecutableStub(join(sourceRoot, "packages", "lsp-tools-mcp", "dist", "cli.js"));
	await writeExecutableStub(join(sourceRoot, "packages", "lsp-daemon", "dist", "cli.js"));
}
