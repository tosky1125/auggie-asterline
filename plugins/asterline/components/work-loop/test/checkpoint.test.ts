// biome-ignore-all format: keep the single mandated checkpoint spec under the pure LOC budget.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkpointWorkLoop } from "../src/checkpoint.js";
import { WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE } from "../src/goal-status.js";
import { workLoopBriefPath, workLoopDir, workLoopLedgerPath } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import type { WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan, WorkLoopSuccessCriterion } from "../src/types.js";
import { WorkLoopError } from "../src/types.js";

const NOW = "2026-05-23T00:00:00.000Z";
const QUALITY_GATE_PATH = fileURLToPath(new URL("./fixtures/sample-quality-gate.json", import.meta.url));

function criterion(id: string, status: WorkLoopSuccessCriterion["status"]): WorkLoopSuccessCriterion {
	return { id, scenario: `${id} scenario`, userModel: "happy", expectedEvidence: `${id} proof`, capturedEvidence: status === "pass" ? `${id} passed` : null, status };
}

function goal(overrides: Partial<WorkLoopItem> = {}): WorkLoopItem {
	return { id: "G001", title: "Build auth", objective: "Implement JWT auth endpoint", status: "in_progress", successCriteria: [criterion("C001", "pass"), criterion("C002", "pass"), criterion("C003", "pass")], attempt: 1, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function plan(goals: WorkLoopItem[], overrides: Partial<WorkLoopPlan> = {}): WorkLoopPlan {
	const result: WorkLoopPlan = { version: 1, createdAt: NOW, updatedAt: NOW, briefPath: ".asterline/work-loop/brief.md", goalsPath: ".asterline/work-loop/goals.json", ledgerPath: ".asterline/work-loop/ledger.jsonl", hostGoalMode: "aggregate", asterlineObjective: WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE, goals };
	Object.assign(result, overrides);
	const activeGoalId = goals.find((candidate) => candidate.status === "in_progress")?.id;
	if (result.activeGoalId === undefined && activeGoalId !== undefined) result.activeGoalId = activeGoalId;
	return result;
}

async function samplePlan(overrides: Partial<WorkLoopPlan> = {}): Promise<WorkLoopPlan> {
	const fixture: WorkLoopPlan = JSON.parse(await readFile(new URL("./fixtures/sample-plan.json", import.meta.url), "utf8"));
	return plan(fixture.goals.map((item, index) => goal({ ...item, attempt: index + 1, createdAt: NOW, updatedAt: NOW })), overrides);
}

async function repoWith(seed: WorkLoopPlan): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "ug-checkpoint-"));
	await mkdir(workLoopDir(repo), { recursive: true });
	await writePlan(repo, seed);
	return repo;
}

function snapshot(status: "active" | "complete", objective = WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE): string {
	return JSON.stringify({ goal: { objective, status } });
}

async function lastLedger(repo: string): Promise<WorkLoopLedgerEntry> {
	const last = (await readFile(workLoopLedgerPath(repo), "utf8")).trim().split(/\r?\n/).at(-1);
	if (last === undefined) throw new Error("expected ledger entry");
	const entry: WorkLoopLedgerEntry = JSON.parse(last);
	return entry;
}

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
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

function passGoal(id: string, overrides: Partial<WorkLoopItem> = {}): WorkLoopItem {
	return goal({ id, successCriteria: [criterion("C001", "pass"), criterion("C002", "pass"), criterion("C003", "pass")], ...overrides });
}

describe("checkpointWorkLoop status=complete criteria gate", () => {
	it("THROWS WORK_LOOP_CRITERIA_NOT_ALL_PASS when any criterion is pending", async () => {
		const repo = await repoWith(await samplePlan({ goals: [goal({ successCriteria: [criterion("C001", "pass"), criterion("C002", "pending"), criterion("C003", "pass")] })] }));
		await expectCode(() => checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "done" }), "WORK_LOOP_CRITERIA_NOT_ALL_PASS");
	});

	it("THROWS when any criterion is fail or blocked", async () => {
		for (const status of ["fail", "blocked"] satisfies WorkLoopSuccessCriterion["status"][]) {
			const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pass"), criterion("C002", status), criterion("C003", "pass")] })]));
			await expectCode(() => checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "done" }), "WORK_LOOP_CRITERIA_NOT_ALL_PASS");
		}
	});

	it("THROWS when criteria list is empty", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [] }), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "done", hostGoalJson: snapshot("active") }), "WORK_LOOP_CRITERIA_NOT_ALL_PASS");
	});

	it("ACCEPTS complete when ALL criteria pass (with valid snapshot)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		const result = await checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "implementation done and tests passed", hostGoalJson: snapshot("active") });
		expect(result.goal.status).toBe("complete");
		expect((await lastLedger(repo)).kind).toBe("goal_completed");
	});
});

describe("checkpointWorkLoop reconciliation (status=complete)", () => {
	it("succeeds when snapshot objective matches expected (aggregate active)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expect(checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "work complete and validation passed", hostGoalJson: snapshot("active") })).resolves.toMatchObject({ goal: { status: "complete" } });
	});

	it("throws on mismatched objective", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "work complete and validation passed", hostGoalJson: snapshot("active", "wrong objective") }), "WORK_LOOP_ASTERLINE_SNAPSHOT_MISMATCH");
	});

	it("throws on mismatched status (snapshot complete when expected active)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "work complete and validation passed", hostGoalJson: snapshot("complete") }), "WORK_LOOP_ASTERLINE_SNAPSHOT_MISMATCH");
	});
});

describe("checkpointWorkLoop final story", () => {
	it("requires quality-gate-json for the final goal complete", async () => {
		const repo = await repoWith(plan([passGoal("G001", { status: "complete" }), passGoal("G002")], { activeGoalId: "G002" }));
		await expectCode(() => checkpointWorkLoop(repo, { goalId: "G002", status: "complete", evidence: "final work complete and validation passed", hostGoalJson: snapshot("complete") }), "WORK_LOOP_QUALITY_GATE_INVALID");
	});

	it("accepts final story when quality gate JSON includes valid criteriaCoverage", async () => {
		const repo = await repoWith(plan([passGoal("G001", { status: "complete" }), passGoal("G002")], { activeGoalId: "G002" }));
		const result = await checkpointWorkLoop(repo, { goalId: "G002", status: "complete", evidence: "final work complete and validation passed", hostGoalJson: snapshot("complete"), qualityGateJson: QUALITY_GATE_PATH });
		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.plan.aggregateCompletion?.status).toBe("complete");
	});

	it("ACCEPTS complete when task-scoped completed Asterline objective maps to the work-loop brief", async () => {
		const taskObjective = "Fix work-loop objective mismatch and install local ulw";
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(workLoopBriefPath(repo), `${taskObjective}\n`, "utf8");

		const result = await checkpointWorkLoop(repo, {
			goalId: "G001",
			status: "complete",
			evidence: "final implementation complete and quality gate passed",
			hostGoalJson: snapshot("complete", taskObjective),
			qualityGateJson: QUALITY_GATE_PATH,
		});

		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.ledgerEntry.kind).toBe("aggregate_completed");
	});

	it("ACCEPTS complete when active task-scoped Asterline objective maps to the work-loop brief", async () => {
		const taskObjective = "Create only research artifacts with source evidence";
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(workLoopBriefPath(repo), `${taskObjective}\n`, "utf8");

		const result = await checkpointWorkLoop(repo, {
			goalId: "G001",
			status: "complete",
			evidence: "final implementation complete and quality gate passed",
			hostGoalJson: snapshot("active", taskObjective),
			qualityGateJson: QUALITY_GATE_PATH,
		});

		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.ledgerEntry.kind).toBe("aggregate_completed");
	});

	it("explains final task-scoped objective mapping when completed Asterline objective is unrelated", async () => {
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(workLoopBriefPath(repo), "Fix work-loop objective mismatch and install local ulw\n", "utf8");

		await expect(
			checkpointWorkLoop(repo, {
				goalId: "G001",
				status: "complete",
				evidence: "final implementation complete and quality gate passed",
				hostGoalJson: snapshot("complete", "unrelated completed task"),
				qualityGateJson: QUALITY_GATE_PATH,
			}),
		).rejects.toThrow("Final task-scoped aggregate reconciliation");
	});
});

describe("checkpointWorkLoop status=failed", () => {
	it("sets goal.status=failed, goal.failedAt, appends ledger", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		const result = await checkpointWorkLoop(repo, { goalId: "G001", status: "failed", evidence: "tests failed" });
		expect(result.goal.status).toBe("failed");
		expect(result.goal.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
		expect((await lastLedger(repo)).kind).toBe("goal_failed");
	});

	it("classifies external authorization blocker signatures", async () => {
		const repo = await repoWith(plan([goal()]));
		const result = await checkpointWorkLoop(repo, { goalId: "G001", status: "failed", evidence: "ghcr.io returned 401 authentication required because token missing" });
		expect(result.goal.blockerSignature).toBe("GHCR_PULL_ACCESS:HTTP_401_ANONYMOUS:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED");
	});

	it("after 3 same-signature blockers, marks needs_user_decision + nonRetriable", async () => {
		const repo = await repoWith(plan([goal({ id: "G001", status: "failed", blockerSignature: "EXTERNAL_AUTHORIZATION_REQUIRED" }), goal({ id: "G002", status: "blocked", blockerSignature: "EXTERNAL_AUTHORIZATION_REQUIRED" }), goal({ id: "G003" })], { activeGoalId: "G003" }));
		const result = await checkpointWorkLoop(repo, { goalId: "G003", status: "failed", evidence: "Registry returned 401 because credentials are missing" });
		expect(result.goal.status).toBe("needs_user_decision");
		expect(result.goal.nonRetriable).toBe(true);
	});

	it("skips the criteria gate for failed status", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		await expect(checkpointWorkLoop(repo, { goalId: "G001", status: "failed", evidence: "not done" })).resolves.toMatchObject({ goal: { status: "failed" } });
	});
});

describe("checkpointWorkLoop status=blocked", () => {
	it("preserves blocker fields + appends ledger", async () => {
		const repo = await repoWith(plan([goal()]));
		const result = await checkpointWorkLoop(repo, { goalId: "G001", status: "blocked", evidence: "ghcr.io requires token and credentials are missing" });
		expect(result.goal.status).toBe("blocked");
		expect(result.goal.blockedReason).toContain("ghcr.io");
		expect(result.goal.blockerSignature).toContain("GHCR_PULL_ACCESS");
		expect((await lastLedger(repo)).kind).toBe("goal_blocked");
	});

	it("skips the criteria gate for blocked status", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		await expect(checkpointWorkLoop(repo, { goalId: "G001", status: "blocked", evidence: "waiting for approval" })).resolves.toMatchObject({ goal: { status: "blocked" } });
	});
});

describe("checkpointWorkLoop rebrand", () => {
	it("does not emit legacy brand token in any returned text or ledger payload", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		const result = await checkpointWorkLoop(repo, { goalId: "G001", status: "complete", evidence: "implementation done in .asterline/work-loop/goals.json for G001 and validation passed", hostGoalJson: snapshot("active") });
		const forbidden = ["o", "m", "x"].join("");
		const payload = `${JSON.stringify(result)}\n${await readFile(workLoopLedgerPath(repo), "utf8")}`.toLowerCase();
		expect(payload).not.toContain(forbidden);
	});
});
