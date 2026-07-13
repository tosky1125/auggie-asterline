import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INSTALLED_WORK_LOOP_COMMAND } from "./constants.js";

import { aggregateAsterlineObjectiveForScope } from "./goal-status.js";
import { appendLedger } from "./ledger-io.js";
import {
	ensureWorkLoopDir,
	repoRelative,
	type WorkLoopScope,
	workLoopDir,
	workLoopGoalsPath,
	workLoopRelativeDir,
} from "./paths.js";
import type { WorkLoopPlan } from "./types.js";
import { iso, WORK_LOOP_DIR, WORK_LOOP_GOALS, WORK_LOOP_LEDGER, WorkLoopError } from "./types.js";

const LEGACY_OBJECTIVE_PREFIX = `Complete all work-loop stories in ${WORK_LOOP_DIR}/${WORK_LOOP_GOALS}: `;
const LEGACY_OBJECTIVE = `Complete all work-loop stories listed in ${WORK_LOOP_DIR}/${WORK_LOOP_GOALS}. Use ${WORK_LOOP_DIR}/${WORK_LOOP_LEDGER} as the durable audit trail.`;
const locks = new Map<string, Promise<undefined>>();
const LOCK_FILE = ".mutation.lock";
const LOCK_WAIT_MS = 25;
const LOCK_ATTEMPTS = 400;
const MALFORMED_LOCK_STALE_MS = 30_000;

interface LockOwner {
	readonly pid: number;
	readonly token: string;
	readonly createdAt: string;
}

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function isLegacyEnumeratedAggregateObjective(objective: string | undefined): objective is string {
	return objective === LEGACY_OBJECTIVE || Boolean(objective?.startsWith(LEGACY_OBJECTIVE_PREFIX));
}

export async function withWorkLoopMutationLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>;
export async function withWorkLoopMutationLock<T>(
	repoRoot: string,
	scope: WorkLoopScope | undefined,
	fn: () => Promise<T>,
): Promise<T>;
export async function withWorkLoopMutationLock<T>(
	repoRoot: string,
	scopeOrFn: WorkLoopScope | (() => Promise<T>) | undefined,
	maybeFn?: () => Promise<T>,
): Promise<T> {
	const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
	const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
	if (fn === undefined) throw new WorkLoopError("Missing work-loop mutation body.", "WORK_LOOP_LOCK_BODY_MISSING");
	const lockKey = `${repoRoot}\0${workLoopRelativeDir(scope)}`;
	const prior = locks.get(lockKey) ?? Promise.resolve(undefined);
	const run = prior.then(
		() => withFileLock(repoRoot, scope, fn),
		() => withFileLock(repoRoot, scope, fn),
	);
	const gate: Promise<undefined> = run.then(() => undefined, () => undefined);
	locks.set(lockKey, gate);
	void gate.then(() => { if (locks.get(lockKey) === gate) locks.delete(lockKey); });
	return run;
}

async function withFileLock<T>(repoRoot: string, scope: WorkLoopScope | undefined, fn: () => Promise<T>): Promise<T> {
	const owner = await acquireFileLock(repoRoot, scope);
	try {
		return await fn();
	} finally {
		await releaseFileLock(repoRoot, scope, owner);
	}
}

async function acquireFileLock(repoRoot: string, scope: WorkLoopScope | undefined): Promise<LockOwner> {
	await ensureWorkLoopDir(repoRoot, scope);
	const path = join(workLoopDir(repoRoot, scope), LOCK_FILE);
	const owner: LockOwner = { pid: process.pid, token: randomUUID(), createdAt: iso() };
	for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
		try {
			const handle = await open(path, "wx", 0o600);
			try {
				await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
			} finally {
				await handle.close();
			}
			return owner;
		} catch (error) {
			if (!hasCode(error, "EEXIST")) throw error;
			if (await recoverStaleLock(path)) continue;
			await new Promise<void>((resolveWait) => setTimeout(resolveWait, LOCK_WAIT_MS));
		}
	}
	throw new WorkLoopError("Timed out waiting for the work-loop mutation lock.", "WORK_LOOP_LOCK_TIMEOUT");
}

async function recoverStaleLock(path: string): Promise<boolean> {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT")) return true;
		throw error;
	}
	let pid: number | undefined;
	try {
		const value: unknown = JSON.parse(raw);
		if (isRecord(value) && typeof value["pid"] === "number" && Number.isSafeInteger(value["pid"])) pid = value["pid"];
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
	if (pid !== undefined && processIsAlive(pid)) return false;
	if (pid === undefined) {
		try {
			const info = await stat(path);
			if (Date.now() - info.mtimeMs < MALFORMED_LOCK_STALE_MS) return false;
		} catch (error) {
			if (hasCode(error, "ENOENT")) return true;
			throw error;
		}
	}
	const quarantine = `${path}.stale-${process.pid}-${randomUUID()}`;
	try {
		await rename(path, quarantine);
		await rm(quarantine, { force: true });
		return true;
	} catch (error) {
		if (hasCode(error, "ENOENT")) return true;
		throw error;
	}
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (hasCode(error, "ESRCH")) return false;
		if (hasCode(error, "EPERM")) return true;
		throw error;
	}
}

async function releaseFileLock(repoRoot: string, scope: WorkLoopScope | undefined, owner: LockOwner): Promise<void> {
	const path = join(workLoopDir(repoRoot, scope), LOCK_FILE);
	try {
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		if (isRecord(value) && value["token"] === owner.token) await unlink(path);
	} catch (error) {
		if (error instanceof SyntaxError || hasCode(error, "ENOENT")) return;
		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkLoopPlan(value: unknown): value is WorkLoopPlan {
	return isRecord(value) && value["version"] === 1 && Array.isArray(value["goals"]);
}

export async function readWorkLoopPlan(repoRoot: string, scope?: WorkLoopScope): Promise<WorkLoopPlan> {
	await ensureWorkLoopDir(repoRoot, scope);
	const path = workLoopGoalsPath(repoRoot, scope);
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
		throw new WorkLoopError(
			`No work-loop plan found at ${repoRelative(path, repoRoot)}. Run \`${INSTALLED_WORK_LOOP_COMMAND} create-goals ...\` first.`,
			"WORK_LOOP_PLAN_MISSING",
			{ cause: error },
		);
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		throw new WorkLoopError(`Invalid JSON in work-loop plan at ${repoRelative(path, repoRoot)}.`, "WORK_LOOP_PLAN_INVALID", { cause: error });
	}
	if (!isWorkLoopPlan(value)) {
		throw new WorkLoopError(`Invalid work-loop plan at ${repoRelative(path, repoRoot)}.`, "WORK_LOOP_PLAN_INVALID");
	}
	const parsed = value;
	const previousObjective = parsed.asterlineObjective;
	if (
		(parsed.hostGoalMode ?? "per_story") === "aggregate" &&
		isLegacyEnumeratedAggregateObjective(previousObjective)
	) {
		const now = iso();
		parsed.asterlineObjective = aggregateAsterlineObjectiveForScope(scope);
		parsed.asterlineObjectiveAliases = [...new Set([...(parsed.asterlineObjectiveAliases ?? []), previousObjective])];
		parsed.updatedAt = now;
		await writePlan(repoRoot, parsed, scope);
		await appendLedger(
			repoRoot,
			{
				at: now,
				kind: "aggregate_objective_migrated",
				message: "Migrated legacy enumerated aggregate Asterline objective to the stable pointer objective.",
				before: { asterlineObjective: previousObjective },
				after: { asterlineObjective: parsed.asterlineObjective },
			},
			scope,
		);
	}
	return parsed;
}

export async function writePlan(repoRoot: string, plan: WorkLoopPlan, scope?: WorkLoopScope): Promise<void> {
	await ensureWorkLoopDir(repoRoot, scope);
	const path = workLoopGoalsPath(repoRoot, scope);
	const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	try {
		await writeFile(tmpPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(tmpPath, path);
	} finally {
		await rm(tmpPath, { force: true });
	}
}

export { appendLedger, findAcceptedSteeringLedgerEntry, readSteeringLedgerEntries } from "./ledger-io.js";
