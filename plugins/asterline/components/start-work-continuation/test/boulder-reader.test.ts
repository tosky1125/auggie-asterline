import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePlanChecklist, readContinuationState } from "../src/boulder-reader.js";
import type { ReadonlyFileSystem } from "../src/types.js";

describe("start-work plan checklist parser", () => {
	it("#given top-level completed and incomplete checkboxes #when parsed #then counts remaining and total", () => {
		// given
		const markdown = ["# Plan", "", "## TODOs", "- [ ] First", "- [x] Done", "- [X] Also done", "- [ ] Second"].join(
			"\n",
		);

		// when
		const checklist = parsePlanChecklist(markdown);

		// then
		expect(checklist).toEqual({ completed: 2, remaining: 2, total: 4, nextTaskLabel: "First" });
	});

	it("#given nested checkboxes #when parsed #then ignores non-column-zero items", () => {
		// given
		const markdown = ["## TODOs", "- [ ] Top-level", "  - [ ] Nested", "\t- [ ] Tab nested", "- [x] Complete"].join(
			"\n",
		);

		// when
		const checklist = parsePlanChecklist(markdown);

		// then
		expect(checklist).toEqual({ completed: 1, remaining: 1, total: 2, nextTaskLabel: "Top-level" });
	});

	it("#given checkboxes outside counted sections #when parsed #then ignores unrelated top-level tasks", () => {
		// given
		const markdown = [
			"# Plan",
			"- [ ] Preamble task",
			"## TODOs",
			"- [ ] Build hook",
			"## Acceptance Criteria",
			"- [ ] Acceptance item",
			"## Final Verification Wave",
			"- [x] Run tests",
			"- [ ] Run smoke",
		].join("\n");

		// when
		const checklist = parsePlanChecklist(markdown);

		// then
		expect(checklist).toEqual({ completed: 1, remaining: 2, total: 3, nextTaskLabel: "Build hook" });
	});

	it("#given all top-level tasks complete #when parsed #then next task is null", () => {
		// given
		const markdown = ["## TODOs", "- [x] First", "- [X] Second"].join("\n");

		// when
		const checklist = parsePlanChecklist(markdown);

		// then
		expect(checklist).toEqual({ completed: 2, remaining: 0, total: 2, nextTaskLabel: null });
	});

	it("#given no counted sections #when parsed #then all column-zero checkboxes are the compatibility fallback", () => {
		// given
		const markdown = ["# Legacy plan", "- [x] Done", "- [ ] Fallback task", "  - [ ] Nested"].join("\n");

		// when
		const checklist = parsePlanChecklist(markdown);

		// then
		expect(checklist).toEqual({ completed: 1, remaining: 1, total: 2, nextTaskLabel: "Fallback task" });
	});
});

describe("run-plan Boulder state reader", () => {
	it("#given paused Auggie work #when state is read #then continuation uses run-plan ledger", () => {
		// given
		const cwd = "/repo";
		const fs = createMemoryFs({
			[join(cwd, ".asterline", "boulder.json")]: boulderJson([
				work({ status: "paused", sessionIds: ["auggie:session-1"] }),
			]),
			[join(cwd, ".asterline", "plans", "plan.md")]: "## TODOs\n- [ ] Resume safely\n",
		});

		// when
		const state = readContinuationState(cwd, "session-1", fs);

		// then
		expect(state?.ledgerPath).toBe(join(cwd, ".asterline", "run-plan", "ledger.jsonl"));
		expect(state?.checklist.nextTaskLabel).toBe("Resume safely");
	});

	it("#given newer completed work for the same session #when state is read #then stale active work is ignored", () => {
		// given
		const cwd = "/repo";
		const fs = createMemoryFs({
			[join(cwd, ".asterline", "boulder.json")]: boulderJson([
				work({ status: "active", sessionIds: ["auggie:session-1"], updatedAt: "2026-07-12T00:00:00Z" }),
				work({ status: "completed", sessionIds: ["auggie:session-1"], updatedAt: "2026-07-13T00:00:00Z" }),
			]),
			[join(cwd, ".asterline", "plans", "plan.md")]: "## TODOs\n- [ ] Stale task\n",
		});

		// when
		const state = readContinuationState(cwd, "session-1", fs);

		// then
		expect(state).toBeNull();
	});

	it("#given plan exists only in absolute worktree #when state is read #then worktree plan governs continuation", () => {
		// given
		const cwd = "/repo";
		const worktreePath = "/worktrees/release";
		const fs = createMemoryFs({
			[join(cwd, ".asterline", "boulder.json")]: boulderJson([
				work({ status: "active", sessionIds: ["auggie:session-1"], worktreePath }),
			]),
			[join(worktreePath, ".asterline", "plans", "plan.md")]: "## TODOs\n- [ ] Worktree task\n",
		});

		// when
		const state = readContinuationState(cwd, "session-1", fs);

		// then
		expect(state?.planPath).toBe(join(worktreePath, ".asterline", "plans", "plan.md"));
		expect(state?.checklist.nextTaskLabel).toBe("Worktree task");
	});
});

type WorkInput = {
	readonly status: "active" | "completed" | "paused" | "abandoned";
	readonly sessionIds: readonly string[];
	readonly updatedAt?: string;
	readonly worktreePath?: string;
};

function work(input: WorkInput): Record<string, unknown> {
	return {
		active_plan: ".asterline/plans/plan.md",
		plan_name: "release-plan",
		status: input.status,
		session_ids: input.sessionIds,
		...(input.updatedAt === undefined ? {} : { updated_at: input.updatedAt }),
		...(input.worktreePath === undefined ? {} : { worktree_path: input.worktreePath }),
	};
}

function boulderJson(works: readonly Record<string, unknown>[]): string {
	return JSON.stringify({
		schema_version: 2,
		works: Object.fromEntries(works.map((candidate, index) => [`work-${index}`, candidate])),
	});
}

function createMemoryFs(files: Readonly<Record<string, string>>): ReadonlyFileSystem {
	return {
		readFileSync(path) {
			const value = files[path];
			if (value === undefined) throw new Error(`Missing fixture: ${path}`);
			return value;
		},
		realpathSync(path) {
			return path;
		},
	};
}
