import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { workLoopDir, workLoopGoalsPath, workLoopLedgerPath } from "../src/paths.js";
import {
	appendLedger,
	readSteeringLedgerEntries,
	readWorkLoopPlan,
	withWorkLoopMutationLock,
	writePlan,
} from "../src/plan-io.js";
import type { WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan } from "../src/types.js";
import { WorkLoopError } from "../src/types.js";

const NOW = "2026-05-23T00:00:00.000Z";
const STABLE_OBJECTIVE =
	"Complete the durable work-loop plan in .asterline/work-loop/goals.json, including later accepted/appended stories, under the original brief constraints; use .asterline/work-loop/ledger.jsonl as the audit trail.";

function makeGoal(overrides: Partial<WorkLoopItem> = {}): WorkLoopItem {
	return {
		id: "G001",
		title: "Build auth service",
		objective: "Implement JWT auth endpoint",
		status: "pending",
		successCriteria: [],
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
		asterlineObjective: STABLE_OBJECTIVE,
		asterlineObjectiveAliases: [],
		goals: [makeGoal()],
		...overrides,
	};
}

function entry(kind: WorkLoopLedgerEntry["kind"], goalId = "G001"): WorkLoopLedgerEntry {
	return { at: NOW, kind, goalId };
}

async function makeRepo(): Promise<string> {
	return mkdtemp(join(tmpdir(), "ug-io-"));
}

async function writeRawPlan(repoRoot: string, plan: WorkLoopPlan): Promise<void> {
	await mkdir(workLoopDir(repoRoot), { recursive: true });
	await writeFile(workLoopGoalsPath(repoRoot), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

async function readLedgerLines(repoRoot: string): Promise<string[]> {
	const raw = await readFile(workLoopLedgerPath(repoRoot), "utf8");
	return raw.split(/\r?\n/).filter(Boolean);
}

describe("readWorkLoopPlan", () => {
	let repoRoot = "";

	beforeEach(async () => {
		// given
		repoRoot = await makeRepo();
	});

	it("throws WorkLoopError when goals.json is missing", async () => {
		// when/then
		await expect(readWorkLoopPlan(repoRoot)).rejects.toThrow(WorkLoopError);
		await expect(readWorkLoopPlan(repoRoot)).rejects.toThrow("components/work-loop/dist/cli.js");
	});

	it("returns parsed plan when fixture is present", async () => {
		// given
		await mkdir(workLoopDir(repoRoot), { recursive: true });
		await copyFile(join(process.cwd(), "test", "fixtures", "sample-plan.json"), workLoopGoalsPath(repoRoot));

		// when
		const plan = await readWorkLoopPlan(repoRoot);

		// then
		expect(plan.version).toBe(1);
		expect(plan.hostGoalMode).toBe("aggregate");
		expect(plan.goals).toHaveLength(3);
		expect(plan.goals[0]?.successCriteria).toHaveLength(3);
	});

	it("migrates legacy aggregate objective on read + writes aggregate_objective_migrated ledger entry + retains alias", async () => {
		// given
		const legacyObjective = "Complete all work-loop stories in .asterline/work-loop/goals.json: G001 Build auth service";
		await writeRawPlan(repoRoot, makePlan({ asterlineObjective: legacyObjective }));

		// when
		const plan = await readWorkLoopPlan(repoRoot);

		// then
		expect(plan.asterlineObjective).toBe(STABLE_OBJECTIVE);
		expect(plan.asterlineObjectiveAliases).toContain(legacyObjective);
		const persisted = JSON.parse(await readFile(workLoopGoalsPath(repoRoot), "utf8"));
		expect(persisted).toMatchObject({ asterlineObjective: STABLE_OBJECTIVE, asterlineObjectiveAliases: [legacyObjective] });
		const lines = await readLedgerLines(repoRoot);
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
			kind: "aggregate_objective_migrated",
			before: { asterlineObjective: legacyObjective },
		});
	});
});

describe("writePlan", () => {
	it("writes goals.json atomically with no temp file left behind", async () => {
		// given
		const repoRoot = await makeRepo();

		// when
		await writePlan(repoRoot, makePlan());

		// then
		const raw = await readFile(workLoopGoalsPath(repoRoot), "utf8");
		expect(JSON.parse(raw)).toMatchObject({ version: 1, goals: [{ id: "G001" }] });
		expect((await readdir(workLoopDir(repoRoot))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("overwrites existing file", async () => {
		// given
		const repoRoot = await makeRepo();
		await writePlan(repoRoot, makePlan({ asterlineObjective: "first" }));

		// when
		await writePlan(repoRoot, makePlan({ asterlineObjective: "second" }));

		// then
		expect(JSON.parse(await readFile(workLoopGoalsPath(repoRoot), "utf8"))).toMatchObject({
			asterlineObjective: "second",
		});
	});
});

describe("appendLedger", () => {
	it("appends a single JSONL line to ledger.jsonl", async () => {
		// given
		const repoRoot = await makeRepo();
		const ledgerEntry = entry("goal_started");

		// when
		await appendLedger(repoRoot, ledgerEntry);

		// then
		expect(await readLedgerLines(repoRoot)).toEqual([JSON.stringify(ledgerEntry)]);
	});

	it("creates ledger.jsonl if missing", async () => {
		// given
		const repoRoot = await makeRepo();

		// when
		await appendLedger(repoRoot, entry("goal_completed"));

		// then
		expect(await readFile(workLoopLedgerPath(repoRoot), "utf8")).toContain("goal_completed");
	});

	it("preserves prior entries", async () => {
		// given
		const repoRoot = await makeRepo();
		const first = entry("goal_started");
		const second = entry("goal_completed");

		// when
		await appendLedger(repoRoot, first);
		await appendLedger(repoRoot, second);

		// then
		expect(await readLedgerLines(repoRoot)).toEqual([JSON.stringify(first), JSON.stringify(second)]);
	});
});

describe("readSteeringLedgerEntries", () => {
	it("returns only steering-related event kinds", async () => {
		// given
		const repoRoot = await makeRepo();
		await appendLedger(repoRoot, entry("steering_accepted"));
		await appendLedger(repoRoot, entry("goal_started"));
		await appendLedger(repoRoot, entry("steering_rejected"));
		await appendLedger(repoRoot, entry("criteria_revised"));

		// when
		const entries = await readSteeringLedgerEntries(repoRoot);

		// then
		expect(entries.map((item) => item.kind)).toEqual(["steering_accepted", "steering_rejected", "criteria_revised"]);
	});

	it("returns empty array when ledger missing", async () => {
		// given
		const repoRoot = await makeRepo();

		// when/then
		await expect(readSteeringLedgerEntries(repoRoot)).resolves.toEqual([]);
	});
});

describe("withWorkLoopMutationLock", () => {
	it("serializes concurrent invocations", async () => {
		// given
		const repoRoot = await makeRepo();
		const counterPath = join(repoRoot, "counter.txt");
		let active = 0;
		let maxActive = 0;
		await writeFile(counterPath, "0", "utf8");

		// when
		await Promise.all(
			[1, 2, 3].map((_) =>
				withWorkLoopMutationLock(repoRoot, async () => {
					active += 1;
					maxActive = Math.max(maxActive, active);
					const current = Number(await readFile(counterPath, "utf8"));
					await Promise.resolve();
					await writeFile(counterPath, String(current + 1), "utf8");
					active -= 1;
				}),
			),
		);

		// then
		expect(maxActive).toBe(1);
		expect(await readFile(counterPath, "utf8")).toBe("3");
	});
});
