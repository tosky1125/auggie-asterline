import { isAbsolute, join, relative, resolve } from "node:path";

import type { ReadonlyFileSystem } from "./types.js";

const TODO_HEADING = "TODOs";
const FINAL_VERIFICATION_HEADING = "Final Verification Wave";
const CHECKBOX_PREFIX_LENGTH = "- [ ] ".length;

type WorkStatus = "active" | "completed" | "paused" | "abandoned";

type BoulderWork = {
	readonly activePlan: string;
	readonly planName: string;
	readonly status: WorkStatus;
	readonly sessionIds: readonly string[];
	readonly startedAt: string | null;
	readonly updatedAt: string | null;
	readonly worktreePath: string | null;
};

type BoulderState = {
	readonly works: readonly BoulderWork[];
	readonly mirrorWork: BoulderWork | null;
	readonly hasWorksMap: boolean;
};

export type PlanChecklist = {
	readonly completed: number;
	readonly remaining: number;
	readonly total: number;
	readonly nextTaskLabel: string | null;
};

export type ContinuationState = {
	readonly planName: string;
	readonly planPath: string;
	readonly boulderPath: string;
	readonly ledgerPath: string;
	readonly worktreePath: string | null;
	readonly checklist: PlanChecklist;
};

type PlanFile = {
	readonly path: string;
	readonly markdown: string;
};

export function parsePlanChecklist(markdown: string): PlanChecklist {
	const lines = markdown.split(/\r?\n/);
	const hasCountedSections = lines.some((line) => isCountedHeading(parseLevelTwoHeading(line)));
	let completed = 0;
	let remaining = 0;
	let nextTaskLabel: string | null = null;
	let isCountedSection = !hasCountedSections;
	for (const line of lines) {
		const heading = parseLevelTwoHeading(line);
		if (heading !== null) {
			isCountedSection = isCountedHeading(heading);
			continue;
		}
		if (!isCountedSection) continue;
		const checkbox = parseTopLevelCheckbox(line);
		if (checkbox === null) continue;
		if (checkbox.checked) completed += 1;
		else {
			remaining += 1;
			nextTaskLabel ??= checkbox.label;
		}
	}
	return { completed, remaining, total: completed + remaining, nextTaskLabel };
}

export function readContinuationState(
	cwd: string,
	sessionId: string,
	fs: ReadonlyFileSystem,
): ContinuationState | null {
	const boulderPath = join(cwd, ".asterline", "boulder.json");
	const state = parseBoulderState(readJsonObject(fs, boulderPath));
	if (state === null) return null;
	const work = findNewestMatchingWork(state, `auggie:${sessionId}`);
	if (work === null || !isContinuableStatus(work.status)) return null;
	const plan = readTrackedPlan(cwd, work, fs);
	if (plan === null) return null;
	const checklist = parsePlanChecklist(plan.markdown);
	if (checklist.remaining === 0) return null;
	return {
		planName: work.planName,
		planPath: plan.path,
		boulderPath,
		ledgerPath: join(cwd, ".asterline", "run-plan", "ledger.jsonl"),
		worktreePath: work.worktreePath,
		checklist,
	};
}

function readTrackedPlan(cwd: string, work: BoulderWork, fs: ReadonlyFileSystem): PlanFile | null {
	const relativePlan = resolveTrackedRelativePath(cwd, work.activePlan);
	if (relativePlan === null) return null;
	if (work.worktreePath !== null) {
		if (!isAbsolute(work.worktreePath)) return null;
		const worktreePlan = resolveContainedFile(work.worktreePath, relativePlan, fs);
		if (worktreePlan !== null) return worktreePlan;
	}
	return resolveContainedFile(cwd, relativePlan, fs);
}

function resolveTrackedRelativePath(root: string, trackedPath: string): string | null {
	if (trackedPath.trim().length === 0) return null;
	const absoluteRoot = resolve(root);
	const candidate = isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(absoluteRoot, trackedPath);
	return isInside(absoluteRoot, candidate) ? relative(absoluteRoot, candidate) : null;
}

function resolveContainedFile(root: string, trackedPath: string, fs: ReadonlyFileSystem): PlanFile | null {
	if (trackedPath.trim().length === 0) return null;
	const absoluteRoot = resolve(root);
	const candidate = isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(absoluteRoot, trackedPath);
	if (!isInside(absoluteRoot, candidate)) return null;
	try {
		const realRoot = fs.realpathSync(absoluteRoot);
		const realCandidate = fs.realpathSync(candidate);
		if (!isInside(realRoot, realCandidate)) return null;
		return readPlanFile(realCandidate, fs);
	} catch (error) {
		if (error instanceof Error) return null;
		throw error;
	}
}

function readPlanFile(path: string, fs: ReadonlyFileSystem): PlanFile | null {
	const markdown = readTextFile(fs, path);
	return markdown === null ? null : { path, markdown };
}

function parseBoulderState(value: Record<string, unknown> | null): BoulderState | null {
	if (value === null) return null;
	const worksValue = value["works"];
	const hasWorksMap = isRecord(worksValue);
	const works = hasWorksMap ? Object.values(worksValue).flatMap((candidate) => {
		const work = parseBoulderWork(candidate);
		return work === null ? [] : [work];
	}) : [];
	const mirrorWork = parseBoulderWork(value);
	if (works.length === 0 && mirrorWork === null) return null;
	return { works, mirrorWork, hasWorksMap };
}

function findNewestMatchingWork(state: BoulderState, sessionId: string): BoulderWork | null {
	let newest: BoulderWork | null = null;
	let newestMilliseconds = 0;
	for (const work of state.works) {
		if (!work.sessionIds.includes(sessionId)) continue;
		const milliseconds = parseIsoMilliseconds(work.updatedAt ?? work.startedAt) ?? 0;
		if (newest === null || milliseconds > newestMilliseconds) {
			newest = work;
			newestMilliseconds = milliseconds;
		}
	}
	if (newest !== null) return newest;
	if (state.hasWorksMap) return null;
	return state.mirrorWork?.sessionIds.includes(sessionId) === true ? state.mirrorWork : null;
}

function parseBoulderWork(value: unknown): BoulderWork | null {
	if (!isRecord(value)) return null;
	const activePlan = value["active_plan"];
	const status = parseWorkStatus(value["status"]);
	if (typeof activePlan !== "string" || status === null) return null;
	return {
		activePlan,
		planName: typeof value["plan_name"] === "string" ? value["plan_name"] : activePlan,
		status,
		sessionIds: parseSessionIds(value["session_ids"]),
		startedAt: typeof value["started_at"] === "string" ? value["started_at"] : null,
		updatedAt: typeof value["updated_at"] === "string" ? value["updated_at"] : null,
		worktreePath:
			typeof value["worktree_path"] === "string" && value["worktree_path"].trim().length > 0
				? value["worktree_path"]
				: null,
	};
}

function parseTopLevelCheckbox(line: string): { readonly checked: boolean; readonly label: string } | null {
	if (line.startsWith("- [ ] ")) return { checked: false, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
		return { checked: true, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	}
	return null;
}

function parseLevelTwoHeading(line: string): string | null {
	return line.startsWith("## ") ? line.slice("## ".length).trim() : null;
}

function isCountedHeading(heading: string | null): boolean {
	return heading === TODO_HEADING || heading === FINAL_VERIFICATION_HEADING;
}

function parseWorkStatus(value: unknown): WorkStatus | null {
	if (value === "active" || value === "completed" || value === "paused" || value === "abandoned") return value;
	return null;
}

function parseSessionIds(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseIsoMilliseconds(value: string | null): number | null {
	if (value === null) return null;
	const milliseconds = Date.parse(value);
	return Number.isNaN(milliseconds) ? null : milliseconds;
}

function isContinuableStatus(status: WorkStatus): boolean {
	return status === "active" || status === "paused";
}

function readJsonObject(fs: ReadonlyFileSystem, path: string): Record<string, unknown> | null {
	const text = readTextFile(fs, path);
	if (text === null) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : null;
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

function readTextFile(fs: ReadonlyFileSystem, path: string): string | null {
	try {
		return fs.readFileSync(path, "utf8");
	} catch (error) {
		if (error instanceof Error) return null;
		throw error;
	}
}

function isInside(root: string, path: string): boolean {
	const child = relative(root, path);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
