import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE } from "../src/goal-status.js";
import { workLoopDir, workLoopLedgerPath } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import { recordFinalReviewBlockers } from "../src/review-blockers.js";
import type { WorkLoopItem, WorkLoopPlan, WorkLoopSuccessCriterion } from "../src/types.js";
import { WorkLoopError } from "../src/types.js";

const NOW = "2026-05-23T00:00:00.000Z";
const VALID_SNAPSHOT_JSON = JSON.stringify({
	goal: { objective: WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE, status: "active" },
});

const validArgs = {
	goalId: "G002",
	title: "Resolve final code-review blockers",
	objective: "Address the BLOCK findings from the architect",
	evidence: "review verdict: REQUEST_CHANGES (3 issues)",
	hostGoalJson: VALID_SNAPSHOT_JSON,
};

function makeCriterion(overrides: Partial<WorkLoopSuccessCriterion> = {}): WorkLoopSuccessCriterion {
	return {
		id: "C001",
		scenario: "happy path",
		userModel: "happy",
		expectedEvidence: "observable proof",
		capturedEvidence: null,
		status: "pending",
		...overrides,
	};
}

function makeGoal(overrides: Partial<WorkLoopItem> = {}): WorkLoopItem {
	return {
		id: "G001",
		title: "Build durable plan",
		objective: "Complete one work-loop story",
		status: "pending",
		successCriteria: [makeCriterion()],
		attempt: 1,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

function makePlan(overrides: Partial<WorkLoopPlan> = {}): WorkLoopPlan {
	return {
		version: 1,
		createdAt: NOW,
		updatedAt: NOW,
		briefPath: ".asterline/work-loop/brief.md",
		goalsPath: ".asterline/work-loop/goals.json",
		ledgerPath: ".asterline/work-loop/ledger.jsonl",
		hostGoalMode: "aggregate",
		asterlineObjective: WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE,
		goals: [makeGoal({ status: "in_progress" })],
		...overrides,
	};
}

async function bootstrapRepo(plan: WorkLoopPlan): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "ug-review-blockers-"));
	await mkdir(workLoopDir(repo), { recursive: true });
	await writePlan(repo, plan);
	return repo;
}

async function ledgerKinds(repo: string): Promise<string[]> {
	const raw = await readFile(workLoopLedgerPath(repo), "utf8");
	return raw
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line).kind);
}

async function expectWorkLoopCode(action: () => Promise<unknown>, code: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		expect(error).toBeInstanceOf(WorkLoopError);
		if (!(error instanceof WorkLoopError)) throw error;
		expect(error.code).toBe(code);
		return;
	}
	throw new Error("Expected WorkLoopError");
}

function finalPlan(): WorkLoopPlan {
	return makePlan({
		activeGoalId: "G002",
		goals: [
			makeGoal({ id: "G001", status: "complete" }),
			makeGoal({ id: "G002", status: "in_progress", title: "ship it", objective: "Finish final story" }),
		],
	});
}

describe("recordFinalReviewBlockers happy path", () => {
	it("marks the final goal review_blocked + appends new pending goal", async () => {
		const repo = await bootstrapRepo(finalPlan());

		const result = await recordFinalReviewBlockers(repo, validArgs);

		expect(result.blockedGoal.status).toBe("review_blocked");
		expect(result.blockedGoal.evidence).toBe(validArgs.evidence);
		expect(result.newGoal).toMatchObject({ id: "G003", status: "pending", title: validArgs.title });
		expect(result.newGoal.successCriteria.length).toBeGreaterThanOrEqual(3);
		expect(result.plan.activeGoalId).toBeUndefined();
		expect(result.ledgerEntries.length).toBeGreaterThanOrEqual(3);
	});

	it("seeded successCriteria cover happy/edge/regression on the blocker-resolution goal", async () => {
		const repo = await bootstrapRepo(finalPlan());

		const result = await recordFinalReviewBlockers(repo, validArgs);

		expect(result.newGoal.successCriteria.map((criterion) => criterion.userModel).sort()).toEqual([
			"edge",
			"happy",
			"regression",
		]);
	});
});

describe("recordFinalReviewBlockers error cases", () => {
	it("throws WORK_LOOP_GOAL_NOT_FOUND for unknown goalId", async () => {
		const repo = await bootstrapRepo(finalPlan());
		await expectWorkLoopCode(
			() => recordFinalReviewBlockers(repo, { ...validArgs, goalId: "G999" }),
			"WORK_LOOP_GOAL_NOT_FOUND",
		);
	});

	it("throws WORK_LOOP_GOAL_NOT_IN_PROGRESS when goal.status !== in_progress", async () => {
		const repo = await bootstrapRepo(
			makePlan({
				goals: [makeGoal({ id: "G001", status: "in_progress" }), makeGoal({ id: "G002", status: "pending" })],
			}),
		);
		await expectWorkLoopCode(() => recordFinalReviewBlockers(repo, validArgs), "WORK_LOOP_GOAL_NOT_IN_PROGRESS");
	});

	it("throws WORK_LOOP_NOT_FINAL_GOAL when other unresolved goals remain", async () => {
		const repo = await bootstrapRepo(
			makePlan({
				goals: [makeGoal({ id: "G001", status: "in_progress" }), makeGoal({ id: "G002", status: "pending" })],
			}),
		);
		await expectWorkLoopCode(
			() => recordFinalReviewBlockers(repo, { ...validArgs, goalId: "G001" }),
			"WORK_LOOP_NOT_FINAL_GOAL",
		);
	});

	it("throws WORK_LOOP_ASTERLINE_SNAPSHOT_MISMATCH when objective mismatches", async () => {
		const repo = await bootstrapRepo(finalPlan());
		const hostGoalJson = JSON.stringify({ goal: { objective: "wrong", status: "active" } });

		await expectWorkLoopCode(
			() => recordFinalReviewBlockers(repo, { ...validArgs, hostGoalJson }),
			"WORK_LOOP_ASTERLINE_SNAPSHOT_MISMATCH",
		);
	});
});

describe("recordFinalReviewBlockers ledger entries", () => {
	it("appends goal_review_blocked + goal_added + blocker_recorded events", async () => {
		const repo = await bootstrapRepo(finalPlan());

		await recordFinalReviewBlockers(repo, validArgs);

		expect(await ledgerKinds(repo)).toEqual(["goal_review_blocked", "goal_added", "blocker_recorded"]);
	});
});
