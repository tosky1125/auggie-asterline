import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workLoopCommand } from "../src/cli-commands.ts";
import { WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE } from "../src/goal-status.js";

let testDir: string;
let out: string[];
let err: string[];
let originalAsterlineSessionId: string | undefined;
let originalAsterlineThreadId: string | undefined;
let originalOmoSessionId: string | undefined;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), "ug-cli-"));
	out = [];
	err = [];
	originalAsterlineSessionId = process.env["ASTERLINE_SESSION_ID"];
	originalAsterlineThreadId = process.env["ASTERLINE_THREAD_ID"];
	originalOmoSessionId = process.env["ASTERLINE_WORK_LOOP_SESSION_ID"];
	delete process.env["ASTERLINE_SESSION_ID"];
	delete process.env["ASTERLINE_THREAD_ID"];
	delete process.env["ASTERLINE_WORK_LOOP_SESSION_ID"];
	vi.spyOn(process, "cwd").mockReturnValue(testDir);
	vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		out.push(chunk.toString());
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		err.push(chunk.toString());
		return true;
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	if (originalAsterlineSessionId === undefined) delete process.env["ASTERLINE_SESSION_ID"];
	else process.env["ASTERLINE_SESSION_ID"] = originalAsterlineSessionId;
	if (originalAsterlineThreadId === undefined) delete process.env["ASTERLINE_THREAD_ID"];
	else process.env["ASTERLINE_THREAD_ID"] = originalAsterlineThreadId;
	if (originalOmoSessionId === undefined) delete process.env["ASTERLINE_WORK_LOOP_SESSION_ID"];
	else process.env["ASTERLINE_WORK_LOOP_SESSION_ID"] = originalOmoSessionId;
	await rm(testDir, { recursive: true, force: true });
});

function resetOutput(): void {
	out = [];
	err = [];
}
function stdoutJson(): Record<string, unknown> {
	return JSON.parse(out.join(""));
}
function asterlineSnapshot(status: "active" | "complete" = "active"): string {
	return JSON.stringify({ goal: { objective: WORK_LOOP_AGGREGATE_ASTERLINE_OBJECTIVE, status } });
}
function qualityGate(): string {
	return JSON.stringify({
		aiSlopCleaner: { status: "passed", evidence: "no-op" },
		verification: { status: "passed", commands: ["vitest"], evidence: "green" },
		codeReview: { recommendation: "APPROVE", architectStatus: "CLEAR", evidence: "small test fixture" },
		criteriaCoverage: { totalCriteria: 3, passCount: 3, adversarialClassesCovered: ["stale_state"] },
	});
}

async function createPlan(brief = "- Goal A\n- Goal B"): Promise<Record<string, unknown>> {
	resetOutput();
	expect(await workLoopCommand(["create-goals", "--brief", brief, "--json"])).toBe(0);
	const parsed = stdoutJson();
	resetOutput();
	return parsed;
}

async function passCriterion(goalId: string, criterionId: string): Promise<void> {
	expect(
		await workLoopCommand([
			"record-evidence",
			"--goal-id",
			goalId,
			"--criterion-id",
			criterionId,
			"--status",
			"pass",
			"--evidence",
			`${criterionId} observable proof`,
		]),
	).toBe(0);
	resetOutput();
}

describe("workLoopCommand help", () => {
	it("prints usage when no subcommand", async () => {
		expect(await workLoopCommand([])).toBe(0);
		expect(out.join("")).toContain("asterline work-loop");
	});
});

describe("workLoopCommand create-goals", () => {
	it("creates plan + writes 3 artifacts + seeds criteria per goal", async () => {
		const code = await workLoopCommand(["create-goals", "--brief", "- Goal A\n- Goal B", "--json"]);

		expect(code).toBe(0);
		const parsed = stdoutJson();
		expect(parsed).toMatchObject({ ok: true });
		expect(parsed).toHaveProperty("plan.goals.0.successCriteria.0.id", "C001");
		expect(await readFile(join(testDir, ".asterline/work-loop/brief.md"), "utf8")).toContain("Goal A");
		expect(await readFile(join(testDir, ".asterline/work-loop/goals.json"), "utf8")).toContain("successCriteria");
		expect(await readFile(join(testDir, ".asterline/work-loop/ledger.jsonl"), "utf8")).toContain("plan_created");
	});

	it("#given completed default aggregate #when creating another default plan #then guides to a fresh session", async () => {
		await createPlan("- Finished");
		for (const criterionId of ["C001", "C002", "C003"]) await passCriterion("G001-finished", criterionId);
		expect(
			await workLoopCommand([
				"checkpoint",
				"--goal-id",
				"G001-finished",
				"--status",
				"complete",
				"--evidence",
				"done",
				"--host-goal-json",
				asterlineSnapshot("complete"),
				"--quality-gate-json",
				qualityGate(),
			]),
		).toBe(0);
		resetOutput();

		expect(await workLoopCommand(["create-goals", "--brief", "- New task"])).toBe(1);

		expect(err.join("")).toContain("Existing work-loop aggregate is already complete");
		expect(err.join("")).toContain("create-goals --session-id <new-id>");
		expect(err.join("")).toContain("--force only");
	});

	it("#given two session ids #when creating goals #then writes isolated session-scoped plans", async () => {
		expect(await workLoopCommand(["create-goals", "--session-id", "session-A", "--brief", "- Alpha", "--json"])).toBe(
			0,
		);
		resetOutput();

		expect(await workLoopCommand(["create-goals", "--session-id", "session-B", "--brief", "- Beta", "--json"])).toBe(
			0,
		);
		resetOutput();

		expect(await readFile(join(testDir, ".asterline/work-loop/session-A/goals.json"), "utf8")).toContain("Alpha");
		expect(await readFile(join(testDir, ".asterline/work-loop/session-B/goals.json"), "utf8")).toContain("Beta");

		expect(await workLoopCommand(["status", "--session-id", "session-A", "--json"])).toBe(0);
		expect(stdoutJson()).toMatchObject({
			plan: { goalsPath: ".asterline/work-loop/session-A/goals.json", goals: [{ title: "Alpha" }] },
		});
		expect(out.join("")).not.toContain("Beta");
	});

	it("#given Asterline thread env #when creating goals #then uses the thread as the session scope", async () => {
		process.env["ASTERLINE_THREAD_ID"] = "thread-123";

		expect(await workLoopCommand(["create-goals", "--brief", "- Thread scoped", "--json"])).toBe(0);
		resetOutput();

		expect(await readFile(join(testDir, ".asterline/work-loop/thread-123/goals.json"), "utf8")).toContain("Thread scoped");
		expect(await workLoopCommand(["status", "--json"])).toBe(0);
		expect(stdoutJson()).toHaveProperty("plan.goalsPath", ".asterline/work-loop/thread-123/goals.json");
	});

	it("#given Asterline thread env and explicit session id #when creating goals #then the explicit session wins", async () => {
		process.env["ASTERLINE_THREAD_ID"] = "thread-123";

		expect(
			await workLoopCommand(["create-goals", "--session-id", "manual-456", "--brief", "- Manual scoped", "--json"]),
		).toBe(0);

		expect(await readFile(join(testDir, ".asterline/work-loop/manual-456/goals.json"), "utf8")).toContain("Manual scoped");
	});
});

describe("workLoopCommand status", () => {
	it("prints plan summary including criteria counts", async () => {
		await createPlan();

		expect(await workLoopCommand(["status"])).toBe(0);
		expect(out.join("")).toContain("criteria: 0/6 pass");
	});
});

describe("workLoopCommand record-evidence", () => {
	it("records evidence + returns updated criterion", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"record-evidence",
				"--goal-id",
				"G001-goal-a",
				"--criterion-id",
				"C001",
				"--status",
				"pass",
				"--evidence",
				"curl passed",
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toMatchObject({
			ok: true,
			criterion: { id: "C001", status: "pass", capturedEvidence: "curl passed" },
		});
	});

	it("returns 1 + error on unknown goal-id", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"record-evidence",
				"--goal-id",
				"G404",
				"--criterion-id",
				"C001",
				"--status",
				"pass",
				"--evidence",
				"x",
			]),
		).toBe(1);
		expect(err.join("")).toContain("[work-loop]");
	});

	it("returns 1 + error on missing flags", async () => {
		expect(
			await workLoopCommand(["record-evidence", "--criterion-id", "C001", "--status", "pass", "--evidence", "x"]),
		).toBe(1);
		expect(err.join("")).toContain("Missing --goal-id");
	});
});

describe("workLoopCommand criteria", () => {
	it("lists criteria for a goal", async () => {
		await createPlan();

		expect(await workLoopCommand(["criteria", "--goal-id", "G001-goal-a"])).toBe(0);
		expect(out.join("")).toContain("C001");
		expect(out.join("")).toContain("happy");
	});

	it("supports --json output", async () => {
		await createPlan();

		expect(await workLoopCommand(["criteria", "--goal-id", "G001-goal-a", "--json"])).toBe(0);
		expect(stdoutJson()).toMatchObject({ ok: true, goalId: "G001-goal-a" });
		expect(stdoutJson()).toHaveProperty("criteria.0.id", "C001");
	});
});

describe("workLoopCommand checkpoint", () => {
	it("REJECTS status=complete when criteria pending", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"checkpoint",
				"--goal-id",
				"G001-goal-a",
				"--status",
				"complete",
				"--evidence",
				"x",
				"--host-goal-json",
				asterlineSnapshot(),
			]),
		).toBe(1);
		expect(err.join("").toLowerCase()).toContain("criteria");
	});

	it("ACCEPTS when all criteria pass", async () => {
		await createPlan();
		await passCriterion("G001-goal-a", "C001");
		await passCriterion("G001-goal-a", "C002");
		await passCriterion("G001-goal-a", "C003");

		expect(
			await workLoopCommand([
				"checkpoint",
				"--goal-id",
				"G001-goal-a",
				"--status",
				"complete",
				"--evidence",
				"implementation done and validation passed",
				"--host-goal-json",
				asterlineSnapshot(),
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toHaveProperty("goal.status", "complete");
	});

	it("#given failed checkpoint without host goal json #when recorded through CLI #then marks the goal failed", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"checkpoint",
				"--goal-id",
				"G001-goal-a",
				"--status",
				"failed",
				"--evidence",
				"implementation failed and validation captured",
				"--json",
			]),
		).toBe(0);

		expect(stdoutJson()).toMatchObject({ ok: true, goal: { id: "G001-goal-a", status: "failed" } });
	});

	it("#given blocked checkpoint without host goal json #when recorded through CLI #then marks the goal blocked", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"checkpoint",
				"--goal-id",
				"G002-goal-b",
				"--status",
				"blocked",
				"--evidence",
				"waiting for external approval",
				"--json",
			]),
		).toBe(0);

		expect(stdoutJson()).toMatchObject({ ok: true, goal: { id: "G002-goal-b", status: "blocked" } });
	});
});

describe("workLoopCommand steer", () => {
	it("dispatches to the steering engine", async () => {
		await createPlan();

		expect(
			await workLoopCommand([
				"steer",
				"--kind",
				"add_subgoal",
				"--title",
				"Extra",
				"--objective",
				"Do extra",
				"--evidence",
				"user requested it",
				"--rationale",
				"keeps plan accurate",
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toMatchObject({
			ok: true,
			accepted: true,
			plan: {
				goals: [
					{ id: "G001-goal-a" },
					{ id: "G002-goal-b" },
					{ id: "G003", title: "Extra", successCriteria: [{ id: "C001" }, { id: "C002" }, { id: "C003" }] },
				],
			},
		});
	});
});

describe("workLoopCommand add-goal", () => {
	it("appends a pending goal", async () => {
		await createPlan();

		expect(await workLoopCommand(["add-goal", "--title", "Later", "--objective", "Do later", "--json"])).toBe(0);
		expect(stdoutJson()).toMatchObject({ ok: true, goal: { title: "Later", status: "pending" } });
	});
});

describe("workLoopCommand unknown", () => {
	it("returns 1 + prints help on unknown subcommand", async () => {
		expect(await workLoopCommand(["wat"])).toBe(1);
		expect(out.join("")).toContain("asterline work-loop");
	});
});

describe("workLoopCommand error handling", () => {
	it("returns 1 + prints [work-loop] prefix on WorkLoopError", async () => {
		expect(await workLoopCommand(["status"])).toBe(1);
		expect(err.join("")).toContain("[work-loop]");
	});

	it("#given no --json #when an error occurs #then writes only to stderr and leaves stdout empty", async () => {
		expect(await workLoopCommand(["status"])).toBe(1);
		expect(out.join("")).toBe("");
		expect(err.join("")).toContain("[work-loop]");
	});
});
