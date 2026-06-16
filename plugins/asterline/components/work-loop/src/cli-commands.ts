// biome-ignore-all format: keep cli-commands dispatcher under the 200 pure LOC budget.
import { readFile } from "node:fs/promises";
import { type CheckpointWorkLoopArgs, checkpointWorkLoop } from "./checkpoint.js";
import { hasFlag, parseHostGoalJson, parseRecordEvidenceArgs, positionalText, readStdin, readValue } from "./cli-arg-parser.js";
import { blockedDecisionHandoff, normalizeHostGoalMode, printJson, printJsonError, printStatus, WORK_LOOP_HELP } from "./cli-output.js";
import { parseSteeringProposal, printSteerResult } from "./cli-steering.js";
import { buildHostGoalInstruction } from "./host-goal-instruction.js";
import { recordEvidence } from "./evidence.js";
import { resolveWorkLoopSessionIdFromEnv, type WorkLoopScope } from "./paths.js";
import { addWorkLoopGoal, createWorkLoopPlan, startNextWorkLoop, summarizeWorkLoopPlan } from "./plan-crud.js";
import { readWorkLoopPlan } from "./plan-io.js";
import { recordFinalReviewBlockers } from "./review-blockers.js";
import { steerWorkLoop } from "./steering.js";
import type { WorkLoopItem } from "./types.js";
import { WorkLoopError } from "./types.js";

type CheckpointStatus = "complete" | "failed" | "blocked";

export const WORK_LOOP_SUBCOMMANDS = ["help", "create-goals", "status", "complete-goals", "checkpoint", "steer", "add-goal", "criteria", "record-evidence", "record-review-blockers"] as const;

export type WorkLoopSubcommand = (typeof WORK_LOOP_SUBCOMMANDS)[number];

export function isWorkLoopSubcommand(value: string): value is WorkLoopSubcommand {
	return (WORK_LOOP_SUBCOMMANDS as readonly string[]).includes(value);
}

export async function workLoopCommand(argv: readonly string[]): Promise<number> {
	const head = argv[0] ?? "help";
	const command = head === "--help" || head === "-h" ? "help" : head;
	const rest = argv.slice(1);
	const repoRoot = process.cwd();
	const json = hasFlag(rest, "--json");
	const scope = commandScope(rest);
	try {
		if (!isWorkLoopSubcommand(command)) {
			if (json) { printJsonError(new WorkLoopError(`Unknown work-loop subcommand: ${command}.`, "WORK_LOOP_SUBCOMMAND_UNKNOWN", { details: { command } })); return 1; }
			process.stdout.write(`${WORK_LOOP_HELP}\n`); return 1;
		}
		switch (command) {
			case "help": process.stdout.write(`${WORK_LOOP_HELP}\n`); return 0;
			case "create-goals": return await createGoals(repoRoot, rest, json, scope);
			case "status": return await status(repoRoot, json, scope);
			case "complete-goals": return await completeGoals(repoRoot, rest, json, scope);
			case "checkpoint": return await checkpoint(repoRoot, rest, json, scope);
			case "steer": return await steer(repoRoot, rest, json, scope);
			case "add-goal": return await addGoal(repoRoot, rest, json, scope);
			case "criteria": return await criteria(repoRoot, rest, json, scope);
			case "record-evidence": return await captureEvidence(repoRoot, rest, json, scope);
			case "record-review-blockers": return await reviewBlockers(repoRoot, rest, json, scope);
			default: return unhandledSubcommand(command);
		}
	} catch (error) {
		if (json) { printJsonError(error); return 1; }
		if (error instanceof WorkLoopError) process.stderr.write(`[work-loop] ${error.message}\n`);
		else if (error instanceof Error) process.stderr.write(`[work-loop] unexpected: ${error.message}\n`);
		else process.stderr.write("[work-loop] unknown error\n");
		return 1;
	}
}

function unhandledSubcommand(command: never): never {
	throw new WorkLoopError(`Unhandled work-loop subcommand: ${String(command)}.`, "WORK_LOOP_SUBCOMMAND_UNHANDLED");
}

function commandScope(argv: readonly string[]): WorkLoopScope | undefined {
	const sessionId = readValue(argv, "--session-id") ?? resolveWorkLoopSessionIdFromEnv();
	return sessionId === null ? undefined : { sessionId };
}

async function createGoals(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const briefFile = readValue(argv, "--brief-file");
	const brief = readValue(argv, "--brief") ?? (briefFile === undefined ? undefined : await readFile(briefFile, "utf8")) ?? (hasFlag(argv, "--from-stdin") ? await readStdin() : undefined) ?? positionalText(argv);
	if (!brief.trim()) throw new WorkLoopError("Missing brief text. Pass --brief, --brief-file, --from-stdin, or positional text.", "WORK_LOOP_BRIEF_REQUIRED");
	const plan = await createWorkLoopPlan(repoRoot, { brief, hostGoalMode: normalizeHostGoalMode(readValue(argv, "--host-goal-mode")), force: hasFlag(argv, "--force") }, scope);
	if (json) printJson({ ok: true, plan, summary: summarizeWorkLoopPlan(plan) });
	else process.stdout.write(`work-loop plan created: ${plan.goals.length} goal(s)\nbrief: ${plan.briefPath}\ngoals: ${plan.goalsPath}\nledger: ${plan.ledgerPath}\n`);
	return 0;
}

async function status(repoRoot: string, json: boolean, scope?: WorkLoopScope): Promise<number> {
	const plan = await readWorkLoopPlan(repoRoot, scope);
	if (json) printJson({ ok: true, plan, summary: summarizeWorkLoopPlan(plan) });
	else printStatus(plan);
	return 0;
}

async function completeGoals(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const result = await startNextWorkLoop(repoRoot, { retryFailed: hasFlag(argv, "--retry-failed") }, scope);
	if ("done" in result) {
		const handoff = blockedDecisionHandoff(result.plan);
		if (json) printJson({ ok: true, done: true, blocked: handoff.length > 0, handoff, summary: summarizeWorkLoopPlan(result.plan), plan: result.plan });
		else process.stdout.write(`${handoff || "work-loop: all goals complete"}\n`);
		return 0;
	}
	const instruction = buildHostGoalInstruction({ plan: result.plan, goal: result.goal });
	if (json) printJson({ ok: true, resumed: result.resumed, goal: result.goal, instruction, plan: result.plan });
	else process.stdout.write(`${instruction.text}\n`);
	return 0;
}

async function checkpoint(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const goalId = required(argv, "--goal-id");
	const statusValue = checkpointStatus(required(argv, "--status"));
	const evidence = required(argv, "--evidence");
	const hostGoalJson = await parseHostGoalJson(statusValue === "complete" ? required(argv, "--host-goal-json") : readValue(argv, "--host-goal-json"));
	if (statusValue === "complete" && hostGoalJson === undefined) throw new WorkLoopError("Missing --host-goal-json.", "WORK_LOOP_ASTERLINE_GOAL_JSON_REQUIRED");
	const qualityGateJson = readValue(argv, "--quality-gate-json");
	const args: CheckpointWorkLoopArgs = {
		goalId,
		status: statusValue,
		evidence,
		...(hostGoalJson === undefined ? {} : { hostGoalJson }),
		...(qualityGateJson === undefined ? {} : { qualityGateJson }),
	};
	const result = await checkpointWorkLoop(repoRoot, args, scope);
	if (json) printJson({ ok: true, ...result, summary: summarizeWorkLoopPlan(result.plan) });
	else process.stdout.write(`work-loop checkpoint: ${result.goal.id} -> ${result.goal.status}\n`);
	return 0;
}

async function steer(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const proposal = await parseSteeringProposal(argv);
	const result = await steerWorkLoop(repoRoot, proposal, scope);
	printSteerResult(result, json);
	return result.accepted ? 0 : 1;
}

async function addGoal(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const result = await addWorkLoopGoal(repoRoot, { title: required(argv, "--title"), objective: required(argv, "--objective") }, scope);
	if (json) printJson({ ok: true, plan: result.plan, goal: result.goal, summary: summarizeWorkLoopPlan(result.plan) });
	else { process.stdout.write(`work-loop added goal: ${result.goal.id}\n`); printStatus(result.plan); }
	return 0;
}

async function criteria(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const goalId = required(argv, "--goal-id");
	const goal = findGoal(await readWorkLoopPlan(repoRoot, scope), goalId);
	if (json) printJson({ ok: true, goalId: goal.id, criteria: goal.successCriteria });
	else process.stdout.write(`criteria for ${goal.id}:\n${goal.successCriteria.map((c) => `- ${c.id} [${c.status}] (${c.userModel}) ${c.scenario} evidence: ${c.capturedEvidence ?? "pending"}`).join("\n")}\n`);
	return 0;
}

async function captureEvidence(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const result = await recordEvidence(repoRoot, parseRecordEvidenceArgs(argv), scope);
	if (json) printJson({ ok: true, ...result, summary: summarizeWorkLoopPlan(result.plan) });
	else process.stdout.write(`work-loop evidence recorded: ${result.goal.id}/${result.criterion.id} -> ${result.criterion.status}\n`);
	return 0;
}

async function reviewBlockers(repoRoot: string, argv: readonly string[], json: boolean, scope?: WorkLoopScope): Promise<number> {
	const hostGoalJson = await parseHostGoalJson(required(argv, "--host-goal-json"));
	if (hostGoalJson === undefined) throw new WorkLoopError("Missing --host-goal-json.", "WORK_LOOP_ASTERLINE_GOAL_JSON_REQUIRED");
	const result = await recordFinalReviewBlockers(repoRoot, { goalId: required(argv, "--goal-id"), title: required(argv, "--title"), objective: required(argv, "--objective"), evidence: required(argv, "--evidence"), hostGoalJson }, scope);
	if (json) printJson({ ok: true, plan: result.plan, blockedGoal: result.blockedGoal, goal: result.newGoal, ledgerEntries: result.ledgerEntries, summary: summarizeWorkLoopPlan(result.plan) });
	else process.stdout.write(`work-loop final review blockers recorded: ${result.blockedGoal.id} -> review_blocked; added ${result.newGoal.id}\n`);
	return 0;
}

function required(argv: readonly string[], flag: string): string {
	const value = readValue(argv, flag)?.trim();
	if (value) return value;
	throw new WorkLoopError(`Missing ${flag}.`, "WORK_LOOP_ARGUMENT_MISSING", { details: { flag } });
}

function checkpointStatus(value: string): CheckpointStatus {
	if (value === "complete" || value === "failed" || value === "blocked") return value;
	throw new WorkLoopError("Missing or invalid --status; expected complete, failed, or blocked.", "WORK_LOOP_STATUS_INVALID", { details: { status: value } });
}

function findGoal(plan: { readonly goals: readonly WorkLoopItem[] }, goalId: string): WorkLoopItem {
	const goal = plan.goals.find((candidate) => candidate.id === goalId);
	if (goal !== undefined) return goal;
	throw new WorkLoopError(`Unknown work-loop id: ${goalId}.`, "WORK_LOOP_GOAL_NOT_FOUND", { details: { goalId } });
}
