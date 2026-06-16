import { workLoopGoalsRelativePath, workLoopLedgerRelativePath } from "./paths.js";
export const WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE = aggregateAsterlineObjectiveForScope();
export function aggregateAsterlineObjectiveForScope(scope) {
    return `Complete the durable work-loop plan in ${workLoopGoalsRelativePath(scope)}, including later accepted/appended stories, under the original brief constraints; use ${workLoopLedgerRelativePath(scope)} as the audit trail.`;
}
export function hostGoalMode(plan) {
    return plan.hostGoalMode ?? "per_story";
}
function isResolvedStatus(status) {
    return status === "complete";
}
function isSupersededResolved(goal, plan) {
    if (goal.steeringStatus !== "superseded")
        return false;
    const replacements = goal.supersededBy ?? [];
    if (replacements.length === 0)
        return false;
    return replacements.every((id) => {
        const replacement = plan.goals.find((candidate) => candidate.id === id);
        return replacement !== undefined && isResolvedStatus(replacement.status);
    });
}
function isCompletionBlocking(goal, plan) {
    if (goal.steeringStatus === "superseded")
        return !isSupersededResolved(goal, plan);
    if (goal.steeringStatus === "blocked")
        return true;
    return !isResolvedStatus(goal.status);
}
function isCompletionBlockingForFinalCandidate(candidate, finalCandidate, plan) {
    if (candidate.id === finalCandidate.id)
        return false;
    if (candidate.steeringStatus === "superseded") {
        const replacements = candidate.supersededBy ?? [];
        if (replacements.length === 0)
            return true;
        return !replacements.every((id) => {
            if (id === finalCandidate.id)
                return true;
            const replacement = plan.goals.find((goal) => goal.id === id);
            return replacement !== undefined && isResolvedStatus(replacement.status);
        });
    }
    return isCompletionBlocking(candidate, plan);
}
export function isWorkLoopDone(plan) {
    if (plan.aggregateCompletion?.status === "complete")
        return true;
    return plan.goals.every((goal) => !isCompletionBlocking(goal, plan));
}
export function isFinalRunCompletionCandidate(plan, goal) {
    return (isCompletionBlocking(goal, plan) &&
        plan.goals.every((candidate) => !isCompletionBlockingForFinalCandidate(candidate, goal, plan)));
}
export function aggregateAsterlineObjective(plan) {
    return plan.asterlineObjective ?? WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE;
}
export function expectedAsterlineObjective(plan, goal) {
    return hostGoalMode(plan) === "aggregate" ? aggregateAsterlineObjective(plan) : goal.objective;
}
export function compatibleAsterlineObjectives(plan) {
    return [aggregateAsterlineObjective(plan), ...(plan.asterlineObjectiveAliases ?? [])];
}
export function hasAllCriteriaPass(goal) {
    return goal.successCriteria.length > 0 && goal.successCriteria.every((criterion) => criterion.status === "pass");
}
export function firstUnresolvedCriterion(goal) {
    return goal.successCriteria.find((criterion) => criterion.status !== "pass");
}
