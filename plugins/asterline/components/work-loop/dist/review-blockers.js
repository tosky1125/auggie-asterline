// biome-ignore-all format: compact port must stay within the requested pure LOC budget.
import { readHostGoalSnapshotInput, reconcileHostGoalSnapshot } from "./host-goal-snapshot.js";
import { hostGoalMode, compatibleAsterlineObjectives, expectedAsterlineObjective, isFinalRunCompletionCandidate } from "./goal-status.js";
import { seedDefaultSuccessCriteria } from "./plan-crud.js";
import { appendLedger, readWorkLoopPlan, withWorkLoopMutationLock, writePlan } from "./plan-io.js";
import { iso, WorkLoopError } from "./types.js";
const BLOCKER_FIELDS = "blockedReason blockerSignature blockerOccurrenceCount requiredExternalDecision nonRetriable failedAt failureReason completedAt blocker blockerEvidence blockerOccurrences blockedAt".split(" ");
function workLoopError(message, code) {
    throw new WorkLoopError(message, code);
}
function nextGoalId(plan) {
    const max = plan.goals.reduce((current, goal) => {
        const digits = /^G(\d+)/u.exec(goal.id)?.[1];
        return digits === undefined ? current : Math.max(current, Number(digits));
    }, 0);
    return `G${String(max + 1).padStart(3, "0")}`;
}
function appendBlockerGoal(plan, args, now) {
    const index = plan.goals.length;
    const goal = {
        id: nextGoalId(plan),
        title: args.title,
        objective: args.objective,
        status: "pending",
        successCriteria: seedDefaultSuccessCriteria(index, args.objective),
        attempt: 0,
        createdAt: now,
        updatedAt: now,
    };
    plan.goals.push(goal);
    return goal;
}
export async function recordFinalReviewBlockers(repoRoot, args, scope) {
    return withWorkLoopMutationLock(repoRoot, scope, async () => {
        const plan = await readWorkLoopPlan(repoRoot, scope);
        const goal = plan.goals.find((candidate) => candidate.id === args.goalId);
        if (goal === undefined)
            workLoopError(`Unknown work-loop id: ${args.goalId}`, "ulw_loop_goal_not_found");
        if (goal.status !== "in_progress")
            workLoopError(`${goal.id} is ${goal.status}.`, "ulw_loop_goal_not_in_progress");
        if (!isFinalRunCompletionCandidate(plan, goal))
            workLoopError(`${goal.id} is not final.`, "ulw_loop_not_final_story");
        const snapshot = await readHostGoalSnapshotInput(args.hostGoalJson, repoRoot);
        const aggregate = hostGoalMode(plan) === "aggregate";
        const reconciliation = reconcileHostGoalSnapshot(snapshot, { expectedObjective: expectedAsterlineObjective(plan, goal), ...(aggregate ? { acceptedObjectives: compatibleAsterlineObjectives(plan) } : {}), allowedStatuses: ["active"], requireSnapshot: true, requireComplete: false });
        if (!reconciliation.ok)
            workLoopError(reconciliation.errors.join(" "), "ulw_loop_asterline_snapshot_mismatch");
        const now = iso();
        for (const field of BLOCKER_FIELDS)
            Reflect.deleteProperty(goal, field);
        goal.status = "review_blocked";
        goal.reviewBlockedAt = now;
        goal.evidence = args.evidence;
        goal.updatedAt = now;
        if (plan.activeGoalId === goal.id)
            delete plan.activeGoalId;
        const newGoal = appendBlockerGoal(plan, args, now);
        plan.updatedAt = now;
        const hostGoal = reconciliation.snapshot.raw;
        const blockedEntry = { at: now, kind: "goal_review_blocked", goalId: goal.id, status: goal.status, evidence: args.evidence, hostGoal };
        const addedEntry = { at: now, kind: "goal_added", goalId: newGoal.id, status: newGoal.status, evidence: args.evidence, message: newGoal.title };
        const summaryEntry = { at: now, kind: "goal_review_blocked", goalId: goal.id, status: goal.status, evidence: args.evidence, hostGoal, message: `Review blockers recorded; appended ${newGoal.id}.` };
        Reflect.set(summaryEntry, "kind", "blocker_recorded");
        const ledgerEntries = [blockedEntry, addedEntry, summaryEntry];
        await writePlan(repoRoot, plan, scope);
        for (const entry of ledgerEntries)
            await appendLedger(repoRoot, entry, scope);
        return { plan, blockedGoal: goal, newGoal, ledgerEntries };
    });
}
