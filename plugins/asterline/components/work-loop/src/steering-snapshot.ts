import type { WorkLoopItem, WorkLoopPlan } from "./domain-types.js";
import type { WorkLoopSteeringPlanSnapshot } from "./steering-types.js";

export function buildSteeringPlanSnapshot(
	plan: WorkLoopPlan,
	changedGoalIds: ReadonlySet<string>,
): WorkLoopSteeringPlanSnapshot {
	const snapshot: WorkLoopSteeringPlanSnapshot = {
		updatedAt: plan.updatedAt,
		goalCount: plan.goals.length,
		goalIds: plan.goals.map((goal) => goal.id),
		goals: plan.goals.filter((goal) => changedGoalIds.has(goal.id)),
	};
	return plan.activeGoalId === undefined ? snapshot : { ...snapshot, activeGoalId: plan.activeGoalId };
}

export function changedGoalIdsBetween(before: WorkLoopPlan, after: WorkLoopPlan): Set<string> {
	const beforeById = new Map<string, WorkLoopItem>(before.goals.map((goal) => [goal.id, goal]));
	const changed = new Set<string>();
	for (const goal of after.goals) {
		const prior = beforeById.get(goal.id);
		if (prior === undefined || JSON.stringify(prior) !== JSON.stringify(goal)) changed.add(goal.id);
		beforeById.delete(goal.id);
	}
	for (const id of beforeById.keys()) changed.add(id);
	return changed;
}
