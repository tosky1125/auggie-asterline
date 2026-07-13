import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const LOCK_STALE_MS = 10 * 60 * 1_000;

export type LockHandle = { readonly release: () => Promise<void> };

export interface AtomicFileOps {
	readonly mkdir: (path: string, options: { readonly recursive: true }) => Promise<string | undefined>;
	readonly rename: (source: string, destination: string) => Promise<void>;
	readonly rm: (path: string, options: { readonly force: true; readonly recursive?: boolean }) => Promise<void>;
	readonly writeFile: (path: string, data: string, options: { readonly mode: number }) => Promise<void>;
}

export interface AtomicWriteOptions {
	readonly ops?: AtomicFileOps;
}

const DEFAULT_FILE_OPS: AtomicFileOps = { mkdir, rename, rm, writeFile };

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

export async function acquireLock(path: string, now = Date.now()): Promise<LockHandle | null> {
	await mkdir(dirname(path), { recursive: true });
	try {
		await mkdir(path);
		return { release: () => rm(path, { recursive: true, force: true }) };
	} catch (error) {
		if (!hasCode(error, "EEXIST")) throw error;
	}
	const age = now - (await stat(path)).mtimeMs;
	if (age < LOCK_STALE_MS) return null;
	await rm(path, { recursive: true, force: true });
	try {
		await mkdir(path);
		return { release: () => rm(path, { recursive: true, force: true }) };
	} catch (error) {
		if (hasCode(error, "EEXIST")) return null;
		throw error;
	}
}

export async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
	try {
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
	} catch (error) {
		if (hasCode(error, "ENOENT") || error instanceof SyntaxError) return {};
		throw error;
	}
}

export async function writeJsonAtomic(
	path: string,
	value: Readonly<Record<string, unknown>>,
	options: AtomicWriteOptions = {},
): Promise<void> {
	const ops = options.ops ?? DEFAULT_FILE_OPS;
	await ops.mkdir(dirname(path), { recursive: true });
	const staging = `${path}.${randomUUID()}.tmp`;
	const backup = `${path}.${randomUUID()}.backup`;
	let cleanupBackup = false;
	try {
		await ops.writeFile(staging, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
		try {
			await ops.rename(staging, path);
			return;
		} catch (error) {
			if (!hasCode(error, "EEXIST") && !hasCode(error, "EPERM")) throw error;
		}
		await ops.rename(path, backup);
		try {
			await ops.rename(staging, path);
			cleanupBackup = true;
		} catch (publicationError) {
			try {
				await ops.rm(path, { force: true });
				await ops.rename(backup, path);
			} catch (rollbackError) {
				throw new AggregateError([publicationError, rollbackError], "state publication and rollback both failed");
			}
			throw publicationError;
		}
	} finally {
		await ops.rm(staging, { force: true });
		if (cleanupBackup) await ops.rm(backup, { force: true });
	}
}
