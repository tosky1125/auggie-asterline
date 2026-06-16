import { WorkLoopError } from "./types.js";
export const WORK_LOOP_HELP = `Usage:
  asterline work-loop create-goals --brief "..." [--brief-file <path>] [--from-stdin] [--host-goal-mode aggregate|per_story] [--force] [--json]
  asterline work-loop status [--json]
  asterline work-loop complete-goals [--retry-failed] [--json]
  asterline work-loop criteria --goal-id <id> [--json]
  asterline work-loop record-evidence --goal-id <id> --criterion-id <id> --status pass|fail|blocked --evidence "..." [--notes "..."] [--json]
  asterline work-loop checkpoint --goal-id <id> --status complete|failed|blocked --evidence "..." --host-goal-json <...> [--quality-gate-json <...>] [--json]
  asterline work-loop steer --kind <kind> ... --evidence "..." --rationale "..." [--json]
  asterline work-loop add-goal --title "..." --objective "..." [--json]
  asterline work-loop record-review-blockers --goal-id <id> --title "..." --objective "..." --evidence "..." --host-goal-json <...> [--json]

All subcommands accept [--session-id <id>] to isolate state under .asterline/work-loop/<id>/; without it, Asterline session env is used when present.`;
export function printJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
export function printJsonError(error) {
    if (error instanceof WorkLoopError) {
        printJson({
            ok: false,
            error: {
                code: error.code,
                message: error.message,
                ...(error.details === undefined ? {} : { details: error.details }),
            },
        });
        return;
    }
    if (error instanceof Error) {
        printJson({ ok: false, error: { code: "WORK_LOOP_UNEXPECTED", message: error.message } });
        return;
    }
    printJson({ ok: false, error: { code: "WORK_LOOP_UNKNOWN", message: "unknown error" } });
}
function criteriaCounts(goal) {
    let pass = 0;
    for (const criterion of goal.successCriteria)
        if (criterion.status === "pass")
            pass += 1;
    return { pass, total: goal.successCriteria.length };
}
export function printStatus(plan) {
    let totalCriteria = 0;
    let passCriteria = 0;
    const lines = ["work-loop status", "", "goals:"];
    for (const goal of plan.goals) {
        const counts = criteriaCounts(goal);
        totalCriteria += counts.total;
        passCriteria += counts.pass;
        const marker = goal.id === plan.activeGoalId ? "*" : "-";
        lines.push(`${marker} ${goal.id} [${goal.status}] ${goal.title} (criteria: ${counts.pass}/${counts.total})`);
    }
    lines.push("", "summary:", `total goals: ${plan.goals.length}`, `criteria: ${passCriteria}/${totalCriteria} pass`);
    process.stdout.write(`${lines.join("\n")}\n`);
}
export function blockedDecisionHandoff(plan) {
    const blocked = plan.goals.find((goal) => goal.status === "needs_user_decision" && goal.nonRetriable);
    if (blocked === undefined)
        return "";
    return [
        "work-loop: blocked on repeated external authorization; no retryable failed goals remain.",
        `Goal: ${blocked.id} - ${blocked.title}`,
        `Required external decision: ${blocked.requiredExternalDecision ?? "provide the missing authorization or choose a different unblock path"}.`,
        "Do not run complete-goals --retry-failed again until external state changes or the user authorizes an unblock path.",
    ].join("\n");
}
export function normalizeHostGoalMode(value) {
    if (value === undefined)
        return "aggregate";
    if (value === "aggregate" || value === "per_story")
        return value;
    throw new WorkLoopError("Invalid --host-goal-mode; expected aggregate or per_story.", "WORK_LOOP_ASTERLINE_GOAL_MODE_INVALID", { details: { value } });
}
