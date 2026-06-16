import { type WorkLoopScope, workLoopGoalsRelativePath, workLoopLedgerRelativePath } from "./paths.js";
import type {
	WorkLoopHostGoalMode,
	WorkLoopItem,
	WorkLoopPlan,
	WorkLoopStatus,
	WorkLoopSuccessCriterion,
} from "./types.js";

export const WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE: string = aggregateAsterlineObjectiveForScope();

export function aggregateAsterlineObjectiveForScope(scope?: WorkLoopScope): string {
	return `Complete the durable work-loop plan in ${workLoopGoalsRelativePath(scope)}, including later accepted/appended stories, under the original brief constraints; use ${workLoopLedgerRelativePath(scope)} as the audit trail.`;
}

export function hostGoalMode(plan: WorkLoopPlan): WorkLoopHostGoalMode {
	return plan.hostGoalMode ?? "per_story";
}

function isResolvedStatus(status: WorkLoopStatus): boolean {
	return status === "complete";
}

function isSupersededResolved(goal: WorkLoopItem, plan: WorkLoopPlan): boolean {
	if (goal.steeringStatus !== "superseded") return false;
	const replacements = goal.supersededBy ?? [];
	if (replacements.length === 0) return false;
	return replacements.every((id) => {
		const replacement = plan.goals.find((candidate) => candidate.id === id);
		return replacement !== undefined && isResolvedStatus(replacement.status);
	});
}

function isCompletionBlocking(goal: WorkLoopItem, plan: WorkLoopPlan): boolean {
	if (goal.steeringStatus === "superseded") return !isSupersededResolved(goal, plan);
	if (goal.steeringStatus === "blocked") return true;
	return !isResolvedStatus(goal.status);
}

function isCompletionBlockingForFinalCandidate(
	candidate: WorkLoopItem,
	finalCandidate: WorkLoopItem,
	plan: WorkLoopPlan,
): boolean {
	if (candidate.id === finalCandidate.id) return false;
	if (candidate.steeringStatus === "superseded") {
		const replacements = candidate.supersededBy ?? [];
		if (replacements.length === 0) return true;
		return !replacements.every((id) => {
			if (id === finalCandidate.id) return true;
			const replacement = plan.goals.find((goal) => goal.id === id);
			return replacement !== undefined && isResolvedStatus(replacement.status);
		});
	}
	return isCompletionBlocking(candidate, plan);
}

export function isWorkLoopDone(plan: WorkLoopPlan): boolean {
	if (plan.aggregateCompletion?.status === "complete") return true;
	return plan.goals.every((goal) => !isCompletionBlocking(goal, plan));
}

export function isFinalRunCompletionCandidate(plan: WorkLoopPlan, goal: WorkLoopItem): boolean {
	return (
		isCompletionBlocking(goal, plan) &&
		plan.goals.every((candidate) => !isCompletionBlockingForFinalCandidate(candidate, goal, plan))
	);
}

export function aggregateAsterlineObjective(plan: WorkLoopPlan): string {
	return plan.asterlineObjective ?? WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE;
}

export function expectedAsterlineObjective(plan: WorkLoopPlan, goal: WorkLoopItem): string {
	return hostGoalMode(plan) === "aggregate" ? aggregateAsterlineObjective(plan) : goal.objective;
}

export function compatibleAsterlineObjectives(plan: WorkLoopPlan): readonly string[] {
	return [aggregateAsterlineObjective(plan), ...(plan.asterlineObjectiveAliases ?? [])];
}

export function hasAllCriteriaPass(goal: WorkLoopItem): boolean {
	return goal.successCriteria.length > 0 && goal.successCriteria.every((criterion) => criterion.status === "pass");
}

export function firstUnresolvedCriterion(goal: WorkLoopItem): WorkLoopSuccessCriterion | undefined {
	return goal.successCriteria.find((criterion) => criterion.status !== "pass");
}
