import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { normalizeWorkLoopSessionId, workLoopDir } from "./paths.js";
import { INSTALLED_WORK_LOOP_COMMAND } from "./constants.js";
import type { WorkLoopItem, WorkLoopPlan } from "./types.js";

const CONTINUATION_CAP = 2;
const CONTEXT_PRESSURE_MARKERS = [
	"context compacted",
	"context_length_exceeded",
	"skill descriptions were shortened",
	"context_too_large",
	"auggie ran out of room in the model's context window",
	"your input exceeds the context window",
	"long sessions and multiple compactions",
] as const;

interface StopPayload {
	readonly sessionId: string;
	readonly cwd: string;
	readonly transcriptPath: string;
	readonly stopHookActive: boolean;
}

interface ContinuationCounter {
	readonly count: number;
	readonly ledgerLineCount: number;
}

export function runStopContinuation(input: unknown): string {
	const payload = parseStopPayload(input);
	if (payload === null || payload.stopHookActive || transcriptShowsContextPressure(payload.transcriptPath)) return "";
	if (runPlanContinuationWillFire(payload.cwd, payload.sessionId)) return "";
	const stateDir = safeStateDir(payload.cwd, payload.sessionId);
	if (stateDir === null) return "";
	const plan = readPlan(join(stateDir, "goals.json"));
	if (plan === null || plan.aggregateCompletion?.status === "complete") return "";
	const goal = resumableGoal(plan);
	if (goal === undefined || !consumeContinuationBudget(stateDir, goal.id)) return "";
	return JSON.stringify({ decision: "block", reason: renderDirective(plan, goal, payload.sessionId) });
}

export async function runStopContinuationCli(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream): Promise<void> {
	try {
		const chunks: Buffer[] = [];
		for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
		const raw = Buffer.concat(chunks).toString("utf8");
		const input: unknown = JSON.parse(raw);
		const output = runStopContinuation(input);
		if (output.length > 0) stdout.write(output);
	} catch (error) {
		if (error instanceof Error) return;
		throw error;
	}
}

function resumableGoal(plan: WorkLoopPlan): WorkLoopItem | undefined {
	const active = plan.goals.find((goal) => goal.id === plan.activeGoalId);
	if (active !== undefined && isResumableStatus(active.status)) return active;
	return plan.goals.find((goal) => isResumableStatus(goal.status));
}

function isResumableStatus(status: WorkLoopItem["status"]): boolean {
	return status === "pending" || status === "in_progress";
}

function consumeContinuationBudget(stateDir: string, goalId: string): boolean {
	return withContinuationLock(stateDir, () => {
		const ledgerLineCount = countLedgerLines(join(stateDir, "ledger.jsonl"));
		const counterPath = join(stateDir, `auto-continue-${goalId}.json`);
		const previous = readCounter(counterPath);
		const count = previous !== null && previous.ledgerLineCount === ledgerLineCount ? previous.count : 0;
		if (count >= CONTINUATION_CAP) {
			atomicWrite(join(stateDir, `auto-continue-${goalId}.stuck`), `no ledger progress after ${count} continuations\n`);
			return false;
		}
		atomicWrite(counterPath, JSON.stringify({ count: count + 1, ledgerLineCount }));
		return true;
	});
}

function withContinuationLock(stateDir: string, action: () => boolean): boolean {
	const lockPath = join(stateDir, ".stop-continuation.lock");
	const deadline = Date.now() + 5_000;
	while (true) {
		try {
			const descriptor = openSync(lockPath, "wx", 0o600);
			closeSync(descriptor);
			try { return action(); }
			finally { try { unlinkSync(lockPath); } catch (error) { if (!hasCode(error, "ENOENT")) throw error; } }
		} catch (error) {
			if (!hasCode(error, "EEXIST")) throw error;
			if (lockIsStale(lockPath)) { try { unlinkSync(lockPath); } catch (unlinkError) { if (!hasCode(unlinkError, "ENOENT")) throw unlinkError; } continue; }
			if (Date.now() >= deadline) return false;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
		}
	}
}

function lockIsStale(path: string): boolean {
	try { return Date.now() - statSync(path).mtimeMs > 30_000; }
	catch (error) { if (hasCode(error, "ENOENT")) return false; throw error; }
}

function atomicWrite(path: string, contents: string): void {
	const temporary = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
	try { writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 }); renameSync(temporary, path); }
	finally { try { unlinkSync(temporary); } catch (error) { if (!hasCode(error, "ENOENT")) throw error; } }
}

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function renderDirective(plan: WorkLoopPlan, goal: WorkLoopItem, sessionId: string): string {
	const normalized = normalizeWorkLoopSessionId(sessionId);
	const option = normalized !== null && plan.goalsPath.includes(`/${normalized}/`) ? ` --session-id ${normalized}` : "";
	return [
		`The Asterline work-loop in Auggie session auggie:${sessionId} has unfinished goals (next: ${goal.id} — ${goal.title}).`,
		"Continue the durable work-loop now; this is plan continuation, not persistent team or worker-thread resumption:",
		`1. Run \`${INSTALLED_WORK_LOOP_COMMAND} status${option} --json\` to reload the goal and ledger.`,
		"2. Continue remaining criteria and record observable evidence.",
		`3. Checkpoint through \`${INSTALLED_WORK_LOOP_COMMAND} checkpoint${option}\` only when proven.`,
		"If genuinely blocked on the user, checkpoint blocked with the reason instead.",
	].join("\n");
}

function safeStateDir(cwd: string, sessionId: string): string | null {
	try {
		const path = workLoopDir(cwd, { sessionId });
		for (const candidate of [join(resolve(cwd), ".asterline"), join(resolve(cwd), ".asterline", "work-loop"), path]) {
			const info = lstatSync(candidate);
			if (info.isSymbolicLink() || !info.isDirectory()) return null;
		}
		return path;
	} catch (error) {
		if (error instanceof Error) return null;
		throw error;
	}
}

function readPlan(path: string): WorkLoopPlan | null {
	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		return isPlan(value) ? value : null;
	} catch (error) {
		if (error instanceof Error) return null;
		throw error;
	}
}

function isPlan(value: unknown): value is WorkLoopPlan {
	return isRecord(value) && value["version"] === 1 && Array.isArray(value["goals"]);
}

function countLedgerLines(path: string): number {
	try { return readFileSync(path, "utf8").split("\n").filter(Boolean).length; }
	catch (error) { if (error instanceof Error) return 0; throw error; }
}

function readCounter(path: string): ContinuationCounter | null {
	try {
		if (!existsSync(path)) return null;
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(value) || typeof value["count"] !== "number" || typeof value["ledgerLineCount"] !== "number") return null;
		return { count: value["count"], ledgerLineCount: value["ledgerLineCount"] };
	} catch (error) { if (error instanceof Error) return null; throw error; }
}

function runPlanContinuationWillFire(cwd: string, sessionId: string): boolean {
	try {
		const value: unknown = JSON.parse(readFileSync(join(cwd, ".asterline", "boulder.json"), "utf8"));
		if (!isRecord(value)) return false;
		const works = isRecord(value["works"]) ? Object.values(value["works"]) : [value];
		return works.some((work) => isContinuableRunPlan(work, cwd, sessionId));
	} catch (error) { if (error instanceof Error) return false; throw error; }
}

function isContinuableRunPlan(value: unknown, cwd: string, sessionId: string): boolean {
	if (!isRecord(value) || (value["status"] !== "active" && value["status"] !== "paused")) return false;
	if (!Array.isArray(value["session_ids"]) || !value["session_ids"].includes(`auggie:${sessionId}`)) return false;
	const activePlan = value["active_plan"];
	if (typeof activePlan !== "string") return false;
	const path = containedRealPath(cwd, activePlan);
	return path !== null && readFileSync(path, "utf8").split(/\r?\n/u).some((line) => line.startsWith("- [ ] "));
}

function containedRealPath(cwd: string, path: string): string | null {
	try {
		const root = realpathSync(cwd);
		const candidate = realpathSync(isAbsolute(path) ? path : resolve(root, path));
		const child = relative(root, candidate);
		return child === "" || (!child.startsWith("..") && !isAbsolute(child)) ? candidate : null;
	} catch (error) { if (error instanceof Error) return null; throw error; }
}

function transcriptShowsContextPressure(path: string): boolean {
	try { const text = readFileSync(path, "utf8").toLowerCase(); return CONTEXT_PRESSURE_MARKERS.some((marker) => text.includes(marker)); }
	catch (error) { if (error instanceof Error) return false; throw error; }
}

function parseStopPayload(value: unknown): StopPayload | null {
	if (!isRecord(value) || value["hook_event_name"] !== "Stop") return null;
	if (typeof value["session_id"] !== "string" || typeof value["cwd"] !== "string" || typeof value["transcript_path"] !== "string" || typeof value["stop_hook_active"] !== "boolean") return null;
	return { sessionId: value["session_id"], cwd: value["cwd"], transcriptPath: value["transcript_path"], stopHookActive: value["stop_hook_active"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
