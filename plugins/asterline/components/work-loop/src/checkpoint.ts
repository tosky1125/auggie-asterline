// biome-ignore-all format: keep checkpoint orchestration below the pure LOC budget.
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INSTALLED_WORK_LOOP_COMMAND } from "./constants.js";

import { formatHostGoalReconciliation, readHostGoalSnapshotInput, reconcileHostGoalSnapshot } from "./host-goal-snapshot.js";
import { requireAllCriteriaPass, requireAllPlanCriteriaPass, requireEssentialCriteriaPass } from "./evidence.js";
import { hostGoalMode, compatibleAsterlineObjectives, expectedAsterlineObjective, isFinalRunCompletionCandidate } from "./goal-status.js";
import { type WorkLoopScope, workLoopAttemptEvidenceDir, workLoopBriefPath } from "./paths.js";
import { appendLedger, readWorkLoopPlan, withWorkLoopMutationLock, writePlan } from "./plan-io.js";
import { classifyExternalAuthorizationBlocker, clearGoalBlockerFields, sameBlockerOccurrences, validateQualityGate } from "./quality-gate.js";
import type { WorkLoopAggregateCompletion, WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan, WorkLoopQualityGate } from "./types.js";
import { iso, WORK_LOOP_DIR, WORK_LOOP_GOALS, WORK_LOOP_LEDGER, WorkLoopError } from "./types.js";

export interface CheckpointWorkLoopArgs { readonly goalId: string; readonly status: "complete" | "failed" | "blocked"; readonly evidence: string; readonly hostGoalJson?: string; readonly qualityGateJson?: string }
export interface CheckpointWorkLoopResult { readonly plan: WorkLoopPlan; readonly goal: WorkLoopItem; readonly ledgerEntry: WorkLoopLedgerEntry; readonly aggregateCompletion?: WorkLoopAggregateCompletion }

function workLoopFail(message: string, code: string): never { throw new WorkLoopError(message, code); }
function normalizeObjective(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function nonEmptyEvidence(value: string): string { const trimmed = value.trim(); return trimmed || workLoopFail("Evidence must be a non-empty string.", "WORK_LOOP_EVIDENCE_REQUIRED"); }
function findGoal(plan: WorkLoopPlan, goalId: string): WorkLoopItem { const goal = plan.goals.find((candidate) => candidate.id === goalId); return goal ?? workLoopFail(`Unknown work-loop id: ${goalId}.`, "WORK_LOOP_GOAL_NOT_FOUND"); }

function textMentionsWorkLoopPlanArtifact(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	return normalized.includes(WORK_LOOP_DIR.toLowerCase()) || normalized.includes(WORK_LOOP_GOALS.toLowerCase()) || normalized.includes(WORK_LOOP_LEDGER.toLowerCase());
}
function textMentionsGoalId(value: string | undefined, goalId: string): boolean { return (value ?? "").toLowerCase().includes(goalId.toLowerCase()); }
function textHasCompletionValidationEvidence(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	const done = /\b(?:planned work|implementation|deliverables?|scope|task|work)\b/.test(normalized) && /\b(?:done|complete|completed|finished|shipped)\b/.test(normalized);
	const verified = /\b(?:validation|verification|tests?|build|lint|review|quality gate|code-review)\b/.test(normalized) && /\b(?:passed|complete|completed|clean|green|approve|approved|clear)\b/.test(normalized);
	return done && verified;
}

async function snapshotObjectiveMapsToWorkLoopPlan(repoRoot: string, snapshotObjective: string, scope?: WorkLoopScope): Promise<boolean> {
	const actual = normalizeObjective(snapshotObjective).toLowerCase();
	if (textMentionsWorkLoopPlanArtifact(actual)) return true;
	if (actual.length < 24 || !existsSync(workLoopBriefPath(repoRoot, scope))) return false;
	try {
		const brief = normalizeObjective(await readFile(workLoopBriefPath(repoRoot, scope), "utf8")).toLowerCase();
		return brief.length >= 24 && (brief.includes(actual) || actual.includes(brief));
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

async function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot: string, plan: WorkLoopPlan, goal: WorkLoopItem, snapshotObjective: string, evidence: string, scope?: WorkLoopScope): Promise<boolean> {
	if (hostGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (isFinalRunCompletionCandidate(plan, goal)) return snapshotObjectiveMapsToWorkLoopPlan(repoRoot, snapshotObjective, scope);
	if (!textMentionsWorkLoopPlanArtifact(evidence) || !textMentionsGoalId(evidence, goal.id)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToWorkLoopPlan(repoRoot, snapshotObjective, scope);
}

async function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot: string, plan: WorkLoopPlan, goal: WorkLoopItem, snapshotObjective: string, evidence: string, scope?: WorkLoopScope): Promise<boolean> {
	if (hostGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (!isFinalRunCompletionCandidate(plan, goal)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToWorkLoopPlan(repoRoot, snapshotObjective, scope);
}

function buildCompletedLegacyGoalRemediation(goal: WorkLoopItem): string {
	return [
		"If get_goal returns a different completed objective, do not repeat --status complete in this Auggie session.",
		`Record a non-terminal blocker with: ${INSTALLED_WORK_LOOP_COMMAND} checkpoint --goal-id ${goal.id} --status blocked --evidence "<completed host goal blocks native goal activation in this Auggie session>" --host-goal-json "<different completed get_goal JSON or path>".`,
		"Then continue only from a host goal context with no active/completed conflicting goal, in the same repo/worktree, and create the intended goal there.",
	].join(" ");
}

function buildTaskScopedAggregateReconciliationHint(goal: WorkLoopItem, final: boolean): string {
	if (final) {
		return ` Final task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress final ASTERLINE goal and the completed get_goal objective to map to the work-loop brief or artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
	}
	return ` Completed task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress ASTERLINE goal, evidence that names that active ASTERLINE goal id, names .asterline/work-loop/goals.json or ledger.jsonl, includes completed implementation plus validation/review evidence, and a get_goal objective that maps to the work-loop brief/artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
}

async function readJsonInput(raw: string | undefined, repoRoot: string): Promise<unknown> {
	if (raw === undefined || raw.trim() === "") return undefined;
	const trimmed = raw.trim();
	try { return JSON.parse(trimmed); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
	const path = resolve(repoRoot, trimmed);
	if (!existsSync(path)) return workLoopFail("Quality gate JSON is neither valid JSON nor a readable path.", "WORK_LOOP_JSON_INPUT_INVALID");
	try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { return workLoopFail(`Quality gate path does not contain valid JSON${error instanceof Error ? `: ${error.message}` : "."}`, "WORK_LOOP_JSON_INPUT_INVALID"); }
}

function makeAggregateCompletion(now: string, evidence: string, hostGoal: unknown): WorkLoopAggregateCompletion {
	return { status: "complete", completedAt: now, evidence, hostGoal };
}

function applyBlockedOrFailed(goal: WorkLoopItem, plan: WorkLoopPlan, status: "failed" | "blocked", evidence: string, now: string): void {
	const signature = classifyExternalAuthorizationBlocker(evidence);
	const occurrences = signature === null ? 0 : sameBlockerOccurrences(plan, signature) + 1;
	const needsDecision = signature !== null && occurrences >= 3;
	goal.status = needsDecision ? "needs_user_decision" : status;
	goal.updatedAt = now;
	if (status === "failed" || needsDecision) { goal.failedAt = now; goal.failureReason = evidence; }
	if (status === "blocked" || needsDecision) goal.blockedReason = evidence;
	if (signature !== null) { goal.blockerSignature = signature; goal.blockerOccurrenceCount = occurrences; goal.requiredExternalDecision = `Resolve external authorization: ${signature}`; }
	if (needsDecision) goal.nonRetriable = true;
	if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
}

function ledgerKind(status: CheckpointWorkLoopArgs["status"], goal: WorkLoopItem, aggregateCompletion: WorkLoopAggregateCompletion | undefined): WorkLoopLedgerEntry["kind"] {
	if (aggregateCompletion !== undefined) return "aggregate_completed";
	if (status === "complete") return "goal_completed";
	if (goal.status === "needs_user_decision") return "goal_needs_user_decision";
	return status === "blocked" ? "goal_blocked" : "goal_failed";
}

function buildLedger(now: string, args: CheckpointWorkLoopArgs, goal: WorkLoopItem, qualityGate: WorkLoopQualityGate | undefined, hostGoal: unknown, aggregateCompletion: WorkLoopAggregateCompletion | undefined): WorkLoopLedgerEntry {
	const entry: WorkLoopLedgerEntry = { at: now, kind: ledgerKind(args.status, goal, aggregateCompletion), goalId: goal.id, status: goal.status, evidence: args.evidence };
	if (hostGoal !== undefined) entry.hostGoal = hostGoal;
	if (qualityGate !== undefined) entry.qualityGate = qualityGate;
	if (goal.blockerSignature !== undefined) entry.blockerSignature = goal.blockerSignature;
	if (goal.blockerOccurrenceCount !== undefined) entry.blockerOccurrenceCount = goal.blockerOccurrenceCount;
	if (goal.requiredExternalDecision !== undefined) entry.requiredExternalDecision = goal.requiredExternalDecision;
	return entry;
}

export async function checkpointWorkLoop(repoRoot: string, args: CheckpointWorkLoopArgs, scope?: WorkLoopScope): Promise<CheckpointWorkLoopResult> {
	return withWorkLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readWorkLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, args.goalId);
		const evidence = nonEmptyEvidence(args.evidence);
		const now = iso();
		let aggregateCompletion: WorkLoopAggregateCompletion | undefined;
		let qualityGate: WorkLoopQualityGate | undefined;
		let hostGoal: unknown;
		if (args.status === "complete") {
			const aggregate = hostGoalMode(plan) === "aggregate";
			const final = isFinalRunCompletionCandidate(plan, goal);
			if (final) { requireAllCriteriaPass(goal); requireAllPlanCriteriaPass(plan); }
			else if (aggregate) requireEssentialCriteriaPass(goal);
			else requireAllCriteriaPass(goal);
			const snapshot = await readHostGoalSnapshotInput(args.hostGoalJson, repoRoot);
			const reconciliation = reconcileHostGoalSnapshot(snapshot, { expectedObjective: expectedAsterlineObjective(plan, goal), ...(aggregate ? { acceptedObjectives: compatibleAsterlineObjectives(plan) } : {}), allowedStatuses: aggregate ? (final ? ["complete"] : ["active"]) : ["complete"], requireSnapshot: true, requireComplete: !aggregate || final });
			hostGoal = reconciliation.snapshot.raw;
			if (!reconciliation.ok) {
				const objective = snapshot?.objective;
				const mismatchedTaskObjective = snapshot?.available === true && objective !== undefined && normalizeObjective(objective) !== normalizeObjective(expectedAsterlineObjective(plan, goal));
				const completedTaskScoped = mismatchedTaskObjective && snapshot.status === "complete" && await canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope);
				const activeFinalTaskScoped = mismatchedTaskObjective && snapshot.status === "active" && await canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope);
				const taskScoped = completedTaskScoped || activeFinalTaskScoped;
				if (!taskScoped) throw new WorkLoopError(`${formatHostGoalReconciliation(reconciliation)}${aggregate && snapshot?.status === "complete" && objective !== undefined ? buildTaskScopedAggregateReconciliationHint(goal, final) : ""}`, "WORK_LOOP_ASTERLINE_SNAPSHOT_MISMATCH");
				aggregateCompletion = makeAggregateCompletion(now, evidence, hostGoal);
			}
			if (final) aggregateCompletion = makeAggregateCompletion(now, evidence, hostGoal);
			if (final || aggregateCompletion !== undefined) {
				const gateOptions = plan.evidenceLayoutVersion === 2 ? { repoRoot, fs: { existsSync, statSync }, currentAttemptDir: workLoopAttemptEvidenceDir(goal.id, goal.attempt, scope) } : undefined;
				qualityGate = validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot), gateOptions);
			}
			goal.status = "complete";
			goal.completedAt = now;
			goal.evidence = evidence;
			delete goal.failedAt;
			delete goal.failureReason;
			clearGoalBlockerFields(goal);
			if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
		} else applyBlockedOrFailed(goal, plan, args.status, evidence, now);
		goal.updatedAt = now;
		if (aggregateCompletion !== undefined) plan.aggregateCompletion = aggregateCompletion;
		plan.updatedAt = now;
		await writePlan(repoRoot, plan, scope);
		const ledgerEntry = buildLedger(now, args, goal, qualityGate, hostGoal, aggregateCompletion);
		await appendLedger(repoRoot, ledgerEntry, scope);
		return aggregateCompletion === undefined ? { plan, goal, ledgerEntry } : { plan, goal, ledgerEntry, aggregateCompletion };
	});
}
