import { join } from "node:path";
import { WORK_LOOP_BRIEF, WORK_LOOP_DIR, WORK_LOOP_GOALS, WORK_LOOP_LEDGER } from "./types.js";
const SESSION_ENV_KEYS = ["ASTERLINE_WORK_LOOP_SESSION_ID", "ASTERLINE_SESSION_ID", "ASTERLINE_THREAD_ID"];
export function normalizeWorkLoopSessionId(sessionId) {
    const trimmed = sessionId?.trim();
    if (!trimmed)
        return null;
    const pathSegments = trimmed
        .split(/[\\/]+/)
        .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
    const candidate = (pathSegments.length > 0 ? pathSegments.join("-") : trimmed)
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^\.+/, "")
        .replace(/^[.-]+|[.-]+$/g, "");
    return candidate.length > 0 ? candidate : null;
}
export function resolveWorkLoopSessionIdFromEnv(env = process.env) {
    for (const key of SESSION_ENV_KEYS) {
        const normalized = normalizeWorkLoopSessionId(env[key]);
        if (normalized !== null)
            return normalized;
    }
    return null;
}
export function workLoopRelativeDir(scope) {
    const sessionId = normalizeWorkLoopSessionId(scope?.sessionId);
    return sessionId === null ? WORK_LOOP_DIR : `${WORK_LOOP_DIR}/${sessionId}`;
}
export function workLoopDir(repoRoot, scope) {
    return join(repoRoot, workLoopRelativeDir(scope));
}
export function workLoopBriefRelativePath(scope) {
    return `${workLoopRelativeDir(scope)}/${WORK_LOOP_BRIEF}`;
}
export function workLoopGoalsRelativePath(scope) {
    return `${workLoopRelativeDir(scope)}/${WORK_LOOP_GOALS}`;
}
export function workLoopLedgerRelativePath(scope) {
    return `${workLoopRelativeDir(scope)}/${WORK_LOOP_LEDGER}`;
}
export function workLoopBriefPath(repoRoot, scope) {
    return join(workLoopDir(repoRoot, scope), WORK_LOOP_BRIEF);
}
export function workLoopGoalsPath(repoRoot, scope) {
    return join(workLoopDir(repoRoot, scope), WORK_LOOP_GOALS);
}
export function workLoopLedgerPath(repoRoot, scope) {
    return join(workLoopDir(repoRoot, scope), WORK_LOOP_LEDGER);
}
export function repoRelative(absolutePath, repoRoot) {
    const slashPrefix = `${repoRoot}/`;
    const backslashPrefix = `${repoRoot}\\`;
    if (absolutePath.startsWith(slashPrefix))
        return absolutePath.slice(slashPrefix.length).split("\\").join("/");
    if (absolutePath.startsWith(backslashPrefix))
        return absolutePath.slice(backslashPrefix.length).split("\\").join("/");
    return absolutePath.split("\\").join("/");
}
