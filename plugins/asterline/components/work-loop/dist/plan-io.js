import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { aggregateAsterlineObjectiveForScope } from "./goal-status.js";
import { repoRelative, workLoopDir, workLoopGoalsPath, workLoopLedgerPath, workLoopRelativeDir, } from "./paths.js";
import { iso, WORK_LOOP_DIR, WORK_LOOP_GOALS, WORK_LOOP_LEDGER, WorkLoopError } from "./types.js";
const LEGACY_OBJECTIVE_PREFIX = `Complete all work-loop stories in ${WORK_LOOP_DIR}/${WORK_LOOP_GOALS}: `;
const LEGACY_OBJECTIVE = `Complete all work-loop stories listed in ${WORK_LOOP_DIR}/${WORK_LOOP_GOALS}. Use ${WORK_LOOP_DIR}/${WORK_LOOP_LEDGER} as the durable audit trail.`;
const locks = new Map();
function hasCode(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
function isLegacyEnumeratedAggregateObjective(objective) {
    return objective === LEGACY_OBJECTIVE || Boolean(objective?.startsWith(LEGACY_OBJECTIVE_PREFIX));
}
function isSteeringKind(value) {
    return value === "steering_accepted" || value === "steering_rejected" || value === "criteria_revised";
}
export async function withWorkLoopMutationLock(repoRoot, scopeOrFn, maybeFn) {
    const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
    const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
    if (fn === undefined)
        throw new WorkLoopError("Missing work-loop mutation body.", "WORK_LOOP_LOCK_BODY_MISSING");
    const lockKey = `${repoRoot}\0${workLoopRelativeDir(scope)}`;
    const prior = locks.get(lockKey) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    locks.set(lockKey, run.catch(() => undefined));
    return run;
}
export async function readWorkLoopPlan(repoRoot, scope) {
    const path = workLoopGoalsPath(repoRoot, scope);
    let raw;
    try {
        raw = await readFile(path, "utf8");
    }
    catch (error) {
        if (!hasCode(error, "ENOENT"))
            throw error;
        throw new WorkLoopError(`No work-loop plan found at ${repoRelative(path, repoRoot)}. Run \`asterline work-loop create-goals ...\` first.`, "WORK_LOOP_PLAN_MISSING", { cause: error });
    }
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.goals)) {
        throw new WorkLoopError(`Invalid work-loop plan at ${repoRelative(path, repoRoot)}.`, "WORK_LOOP_PLAN_INVALID");
    }
    const previousObjective = parsed.asterlineObjective;
    if ((parsed.hostGoalMode ?? "per_story") === "aggregate" &&
        isLegacyEnumeratedAggregateObjective(previousObjective)) {
        const now = iso();
        parsed.asterlineObjective = aggregateAsterlineObjectiveForScope(scope);
        parsed.asterlineObjectiveAliases = [...new Set([...(parsed.asterlineObjectiveAliases ?? []), previousObjective])];
        parsed.updatedAt = now;
        await writePlan(repoRoot, parsed, scope);
        await appendLedger(repoRoot, {
            at: now,
            kind: "aggregate_objective_migrated",
            message: "Migrated legacy enumerated aggregate Asterline objective to the stable pointer objective.",
            before: { asterlineObjective: previousObjective },
            after: { asterlineObjective: parsed.asterlineObjective },
        }, scope);
    }
    return parsed;
}
export async function writePlan(repoRoot, plan, scope) {
    await mkdir(workLoopDir(repoRoot, scope), { recursive: true });
    const path = workLoopGoalsPath(repoRoot, scope);
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    await rename(tmpPath, path);
}
export async function appendLedger(repoRoot, entry, scope) {
    await mkdir(workLoopDir(repoRoot, scope), { recursive: true });
    await appendFile(workLoopLedgerPath(repoRoot, scope), `${JSON.stringify(entry)}\n`, "utf8");
}
export async function readSteeringLedgerEntries(repoRoot, scope) {
    let raw;
    try {
        raw = await readFile(workLoopLedgerPath(repoRoot, scope), "utf8");
    }
    catch (error) {
        if (hasCode(error, "ENOENT"))
            return [];
        throw error;
    }
    const entries = [];
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
        const entry = JSON.parse(line);
        if (isSteeringKind(entry.kind))
            entries.push(entry);
    }
    return entries;
}
