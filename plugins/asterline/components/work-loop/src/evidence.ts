// biome-ignore-all format: keep this module under the mandated pure LOC budget.
import { essentialCriteriaOf, hasAllCriteriaPass, hasEssentialCriteriaPass } from "./goal-status.js";
import type { WorkLoopScope } from "./paths.js";
import { appendLedger, readWorkLoopPlan, withWorkLoopMutationLock, writePlan } from "./plan-io.js";
import type { WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan, WorkLoopSuccessCriterion } from "./types.js";
import { iso, WorkLoopError } from "./types.js";

type EvidenceStatus = "pass" | "fail" | "blocked";
type RecordEvidenceArgs = { readonly goalId: string; readonly criterionId: string; readonly status: EvidenceStatus; readonly evidence: string; readonly notes?: string };

function workLoopFail(message: string, code: string, details: Record<string, unknown>): never { throw new WorkLoopError(message, code, { details }); }

function ledgerKind(status: EvidenceStatus): WorkLoopLedgerEntry["kind"] {
	switch (status) {
		case "pass":
			return "evidence_captured";
		case "fail":
			return "criterion_failed";
		case "blocked":
			return "criterion_blocked";
		default:
			return workLoopFail("Invalid criterion status.", "WORK_LOOP_CRITERION_STATUS_INVALID", { status });
	}
}

function findGoal(plan: WorkLoopPlan, goalId: string): WorkLoopItem {
	const goal = plan.goals.find((candidate) => candidate.id === goalId);
	return goal ?? workLoopFail(`WorkLoop goal not found: ${goalId}.`, "WORK_LOOP_GOAL_NOT_FOUND", { goalId });
}

function findCriterion(goal: WorkLoopItem, criterionId: string): WorkLoopSuccessCriterion {
	const criterion = goal.successCriteria.find((candidate) => candidate.id === criterionId);
	return criterion ?? workLoopFail(`Success criterion not found: ${criterionId}.`, "WORK_LOOP_CRITERION_NOT_FOUND", { goalId: goal.id, criterionId });
}

function nonEmptyEvidence(evidence: string): string { const trimmed = evidence.trim(); return trimmed || workLoopFail("Evidence must be a non-empty string.", "WORK_LOOP_EVIDENCE_REQUIRED", {}); }

export async function recordEvidence(repoRoot: string, args: RecordEvidenceArgs, scope?: WorkLoopScope): Promise<{ plan: WorkLoopPlan; goal: WorkLoopItem; criterion: WorkLoopSuccessCriterion; ledgerEntry: WorkLoopLedgerEntry }> {
	return withWorkLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readWorkLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, args.goalId);
		const criterion = findCriterion(goal, args.criterionId);
		const evidence = nonEmptyEvidence(args.evidence);
		const kind = ledgerKind(args.status);
		const prevStatus = criterion.status;
		const capturedAt = iso();
		criterion.status = args.status;
		criterion.capturedEvidence = evidence;
		criterion.capturedAt = capturedAt;
		if (args.notes !== undefined) criterion.notes = args.notes;
		goal.updatedAt = capturedAt;
		plan.updatedAt = capturedAt;
		await writePlan(repoRoot, plan, scope);
		const ledgerEntry: WorkLoopLedgerEntry = {
			at: capturedAt,
			kind,
			goalId: goal.id,
			criterionId: criterion.id,
			criterionStatus: args.status,
			evidence,
			capturedEvidence: evidence,
			before: { status: prevStatus },
			after: { goalId: goal.id, criterionId: criterion.id, status: args.status, evidence, capturedAt, prevStatus },
		};
		await appendLedger(repoRoot, ledgerEntry, scope);
		return { plan, goal, criterion, ledgerEntry };
	});
}

export async function markCriteriaPendingResetForGoal(repoRoot: string, goalId: string, scope?: WorkLoopScope): Promise<{ plan: WorkLoopPlan; resetCount: number }> {
	return withWorkLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readWorkLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, goalId);
		const now = iso();
		const before = goal.successCriteria.map((criterion) => ({ id: criterion.id, status: criterion.status, capturedEvidence: criterion.capturedEvidence, capturedAt: criterion.capturedAt ?? null }));
		for (const criterion of goal.successCriteria) {
			criterion.status = "pending";
			criterion.capturedEvidence = null;
			delete criterion.capturedAt;
			delete criterion.notes;
		}
		goal.updatedAt = now;
		plan.updatedAt = now;
		await writePlan(repoRoot, plan, scope);
		await appendLedger(repoRoot, { at: now, kind: "criteria_revised", goalId, message: `Reset ${goal.successCriteria.length} criteria to pending.`, before, after: { resetCount: goal.successCriteria.length } }, scope);
		return { plan, resetCount: goal.successCriteria.length };
	});
}

export function criteriaSummary(plan: WorkLoopPlan): { totalCriteria: number; passCount: number; pendingCount: number; failCount: number; blockedCount: number; goalsWithUnresolvedCriteria: string[] } {
	let totalCriteria = 0;
	let passCount = 0;
	let pendingCount = 0;
	let failCount = 0;
	let blockedCount = 0;
	const goalsWithUnresolvedCriteria: string[] = [];
	for (const goal of plan.goals) {
		let unresolved = false;
		for (const criterion of goal.successCriteria) {
			totalCriteria += 1;
			if (criterion.status !== "pass") unresolved = true;
			switch (criterion.status) {
				case "pass": passCount += 1; break;
				case "pending": pendingCount += 1; break;
				case "fail": failCount += 1; break;
				case "blocked": blockedCount += 1; break;
				default: workLoopFail("Invalid criterion status.", "WORK_LOOP_CRITERION_STATUS_INVALID", { status: criterion.status });
			}
		}
		if (unresolved) goalsWithUnresolvedCriteria.push(goal.id);
	}
	return { totalCriteria, passCount, pendingCount, failCount, blockedCount, goalsWithUnresolvedCriteria };
}

export function unresolvedCriteriaOf(goal: WorkLoopItem): WorkLoopSuccessCriterion[] { return goal.successCriteria.filter((criterion) => criterion.status !== "pass"); }

export function unresolvedEssentialCriteriaOf(goal: WorkLoopItem): readonly WorkLoopSuccessCriterion[] {
	const ids = new Set(essentialCriteriaOf(goal).map((criterion) => criterion.id));
	return goal.successCriteria.filter((criterion) => ids.has(criterion.id) && criterion.status !== "pass");
}

export function requireAllCriteriaPass(goal: WorkLoopItem): void {
	if (hasAllCriteriaPass(goal)) return;
	throw new WorkLoopError(`Goal ${goal.id} has unresolved success criteria.`, "WORK_LOOP_CRITERIA_NOT_ALL_PASS", {
		details: { goalId: goal.id, unresolved: unresolvedCriteriaOf(goal).map((criterion) => ({ id: criterion.id, status: criterion.status })) },
	});
}

export function requireAllPlanCriteriaPass(plan: WorkLoopPlan): void {
	const unresolved = plan.goals.flatMap((goal) => unresolvedCriteriaOf(goal).map((criterion) => ({ goalId: goal.id, id: criterion.id, status: criterion.status })));
	if (unresolved.length === 0) return;
	throw new WorkLoopError("Work-loop aggregate has unresolved success criteria.", "WORK_LOOP_CRITERIA_NOT_ALL_PASS", { details: { unresolved } });
}

export function requireEssentialCriteriaPass(goal: WorkLoopItem): void {
	if (hasEssentialCriteriaPass(goal)) return;
	throw new WorkLoopError(`Goal ${goal.id} has unresolved essential success criteria.`, "WORK_LOOP_CRITERIA_NOT_ALL_PASS", {
		details: { goalId: goal.id, unresolved: unresolvedEssentialCriteriaOf(goal).map((criterion) => ({ id: criterion.id, status: criterion.status })) },
	});
}
