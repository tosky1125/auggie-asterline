import { expect, test } from "bun:test";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { containedPath, parseDataOverride } from "../src/paths.ts";
import { acquireLock, LOCK_STALE_MS, writeJsonAtomic } from "../src/state.ts";
import type { AtomicFileOps } from "../src/state.ts";
import { runSessionStart } from "../src/hook.ts";
import { downloadsEnabled } from "../src/worker.ts";

test("Given bootstrap download configuration, when parsed, then only exact opt-in enables network access", () => {
	expect(downloadsEnabled({})).toBe(false);
	expect(downloadsEnabled({ ASTERLINE_BOOTSTRAP_DOWNLOAD: "0" })).toBe(false);
	expect(downloadsEnabled({ ASTERLINE_BOOTSTRAP_DOWNLOAD: "true" })).toBe(false);
	expect(downloadsEnabled({ ASTERLINE_BOOTSTRAP_DOWNLOAD: "1" })).toBe(true);
});

test("Given path traversal, when resolved, then the data boundary rejects it", () => {
	expect(() => containedPath("/safe/root", "..", "escape")).toThrow("contained");
	expect(() => parseDataOverride("../escape")).toThrow("absolute contained");
	expect(() => parseDataOverride("/outside", "/safe/root")).toThrow("configured plugin data root");
});

test("Given a fresh lock, when acquired again, then the second worker skips", async () => {
	const path = join(tmpdir(), `asterline-bootstrap-lock-${crypto.randomUUID()}`);
	const first = await acquireLock(path, 10_000);
	expect(first).not.toBeNull();
	expect(await acquireLock(path, 10_001)).toBeNull();
	await first?.release();
});

test("Given a stale lock, when acquired, then ownership is recovered", async () => {
	const path = join(tmpdir(), `asterline-bootstrap-stale-${crypto.randomUUID()}`);
	await mkdir(path);
	await utimes(path, new Date(0), new Date(0));
	const lock = await acquireLock(path, LOCK_STALE_MS + 1);
	expect(lock).not.toBeNull();
	expect((await stat(path)).isDirectory()).toBe(true);
	await lock?.release();
});

test("Given detached spawn interruption, when SessionStart runs, then failure is fail-open", async () => {
	const home = join(tmpdir(), `asterline-bootstrap-hook-${crypto.randomUUID()}`);
	const action = await runSessionStart({
		env: { HOME: home, AUGMENT_PLUGIN_ROOT: home },
		spawnWorker: () => { throw new Error("interrupted"); },
		writeOutput: () => { throw new Error("output must not run"); },
	});
	expect(action).toBe("spawn-failed");
});

test("Given an existing state, when written consecutively, then the latest record replaces it without debris", async () => {
	const root = join(tmpdir(), `asterline-bootstrap-state-${crypto.randomUUID()}`);
	const path = join(root, "state.json");
	await writeJsonAtomic(path, { generation: 1 });
	await writeJsonAtomic(path, { generation: 2 });
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ generation: 2 });
	expect(await readdir(root)).toEqual(["state.json"]);
	await rm(root, { recursive: true, force: true });
});

class FixtureFsError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "FixtureFsError";
		this.code = code;
	}
}

const realFileOps: AtomicFileOps = {
	mkdir: (path, options) => mkdir(path, options),
	rename: (source, destination) => rename(source, destination),
	rm: (path, options) => rm(path, options),
	writeFile: (path, data, options) => writeFile(path, data, options),
};

test("Given Windows replacement semantics, when the fast rename is rejected, then backup publication succeeds cleanly", async () => {
	const root = join(tmpdir(), `asterline-bootstrap-windows-${crypto.randomUUID()}`);
	const path = join(root, "state.json");
	await mkdir(root);
	await writeFile(path, '{"generation":1}\n');
	let rejected = false;
	const ops: AtomicFileOps = {
		...realFileOps,
		rename: async (source, destination) => {
			if (!rejected && source.endsWith(".tmp") && destination === path) {
				rejected = true;
				throw new FixtureFsError("EPERM", "Windows cannot replace an existing file");
			}
			await rename(source, destination);
		},
	};
	await writeJsonAtomic(path, { generation: 2 }, { ops });
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ generation: 2 });
	expect(await readdir(root)).toEqual(["state.json"]);
	await rm(root, { recursive: true, force: true });
});

test("Given publication failure after backup, when replacement aborts, then the prior state rolls back without debris", async () => {
	const root = join(tmpdir(), `asterline-bootstrap-rollback-${crypto.randomUUID()}`);
	const path = join(root, "state.json");
	await mkdir(root);
	await writeFile(path, '{"generation":1}\n');
	let stagingPublishes = 0;
	const ops: AtomicFileOps = {
		...realFileOps,
		rename: async (source, destination) => {
			if (source.endsWith(".tmp") && destination === path) {
				stagingPublishes += 1;
				throw new FixtureFsError(stagingPublishes === 1 ? "EEXIST" : "EIO", "simulated publication failure");
			}
			await rename(source, destination);
		},
	};
	await expect(writeJsonAtomic(path, { generation: 2 }, { ops })).rejects.toThrow("simulated publication failure");
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ generation: 1 });
	expect(await readdir(root)).toEqual(["state.json"]);
	await rm(root, { recursive: true, force: true });
});
