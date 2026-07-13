import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { WORK_LOOP_BRIEF, WORK_LOOP_DIR, WORK_LOOP_GOALS, WORK_LOOP_LEDGER } from "./types.js";
import { WorkLoopError } from "./types.js";

export interface WorkLoopScope {
	readonly sessionId?: string | null;
}

const SESSION_ENV_KEYS = ["ASTERLINE_WORK_LOOP_SESSION_ID", "AUGGIE_SESSION_ID"] as const;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
type EnvMap = Readonly<Record<string, string | undefined>>;

export function normalizeWorkLoopSessionId(sessionId: string | null | undefined): string | null {
	const trimmed = sessionId?.trim();
	if (!trimmed) return null;
	if (SESSION_ID_PATTERN.test(trimmed)) return trimmed;
	throw new WorkLoopError(
		"Session id must be 1-128 ASCII letters, digits, dots, underscores, or dashes and must start with a letter or digit.",
		"WORK_LOOP_SESSION_ID_INVALID",
		{ details: { sessionId: trimmed } },
	);
}

export function resolveWorkLoopSessionIdFromEnv(env: EnvMap = process.env): string | null {
	for (const key of SESSION_ENV_KEYS) {
		const normalized = normalizeWorkLoopSessionId(env[key]);
		if (normalized !== null) return normalized;
	}
	return null;
}

export function workLoopRelativeDir(scope?: WorkLoopScope): string {
	const sessionId = normalizeWorkLoopSessionId(scope?.sessionId);
	return sessionId === null ? WORK_LOOP_DIR : `${WORK_LOOP_DIR}/${sessionId}`;
}

export function workLoopDir(repoRoot: string, scope?: WorkLoopScope): string {
	const root = resolve(repoRoot);
	const path = resolve(root, workLoopRelativeDir(scope));
	const child = relative(root, path);
	if (child === "" || child.startsWith("..") || isAbsolute(child)) {
		throw new WorkLoopError("Work-loop state path escapes the repository.", "WORK_LOOP_PATH_OUTSIDE_REPOSITORY");
	}
	return path;
}

export async function ensureWorkLoopDir(repoRoot: string, scope?: WorkLoopScope): Promise<string> {
	const root = resolve(repoRoot);
	const segments = workLoopRelativeDir(scope).split("/");
	let current = root;
	for (const segment of segments) {
		current = join(current, segment);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory()) {
				throw new WorkLoopError("Work-loop state path contains a symlink or non-directory.", "WORK_LOOP_PATH_UNSAFE");
			}
		} catch (error) {
			if (!hasCode(error, "ENOENT")) throw error;
			await mkdir(current, { mode: 0o700 });
		}
	}
	return current;
}

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

export function workLoopBriefRelativePath(scope?: WorkLoopScope): string {
	return `${workLoopRelativeDir(scope)}/${WORK_LOOP_BRIEF}`;
}

export function workLoopGoalsRelativePath(scope?: WorkLoopScope): string {
	return `${workLoopRelativeDir(scope)}/${WORK_LOOP_GOALS}`;
}

export function workLoopLedgerRelativePath(scope?: WorkLoopScope): string {
	return `${workLoopRelativeDir(scope)}/${WORK_LOOP_LEDGER}`;
}

export function workLoopAttemptEvidenceDir(goalId: string, attempt: number, scope?: WorkLoopScope): string {
	const sessionId = normalizeWorkLoopSessionId(scope?.sessionId) ?? resolveWorkLoopSessionIdFromEnv() ?? "session";
	return `.asterline/evidence/work-loop/${sessionId}/${goalId}/a${attempt}`;
}

export function isWithinAttemptDir(candidate: string, attemptRoot: string): boolean {
	const child = relative(resolve(attemptRoot), resolve(candidate));
	return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

export function workLoopBriefPath(repoRoot: string, scope?: WorkLoopScope): string {
	return join(workLoopDir(repoRoot, scope), WORK_LOOP_BRIEF);
}

export function workLoopGoalsPath(repoRoot: string, scope?: WorkLoopScope): string {
	return join(workLoopDir(repoRoot, scope), WORK_LOOP_GOALS);
}

export function workLoopLedgerPath(repoRoot: string, scope?: WorkLoopScope): string {
	return join(workLoopDir(repoRoot, scope), WORK_LOOP_LEDGER);
}

export function repoRelative(absolutePath: string, repoRoot: string): string {
	const slashPrefix = `${repoRoot}/`;
	const backslashPrefix = `${repoRoot}\\`;
	if (absolutePath.startsWith(slashPrefix)) return absolutePath.slice(slashPrefix.length).split("\\").join("/");
	if (absolutePath.startsWith(backslashPrefix))
		return absolutePath.slice(backslashPrefix.length).split("\\").join("/");
	return absolutePath.split("\\").join("/");
}
