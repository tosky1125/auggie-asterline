import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	HostGoalSnapshotError,
	formatHostGoalReconciliation,
	parseHostGoalSnapshot,
	readHostGoalSnapshotInput,
	reconcileHostGoalSnapshot,
} from "../src/host-goal-snapshot.ts";

describe("parseHostGoalSnapshot", () => {
	it("returns available snapshot from { goal: { ... } } JSON", () => {
		// given
		const payload = { goal: { objective: "X", status: "active" } };

		// when
		const snapshot = parseHostGoalSnapshot(payload);

		// then
		expect(snapshot.available).toBe(true);
		expect(snapshot.objective).toBe("X");
		expect(snapshot.status).toBe("active");
	});

	it("ignores remaining token budget fields from goal snapshots", () => {
		// given
		const payload = { goal: { objective: "X", status: "active" }, remainingTokens: 123 };

		// when
		const snapshot = parseHostGoalSnapshot(payload);

		// then
		expect("remainingTokens" in snapshot).toBe(false);
	});

	it("returns unavailable snapshot from null", () => {
		// when
		const snapshot = parseHostGoalSnapshot(null);

		// then
		expect(snapshot.available).toBe(false);
	});

	it("returns unavailable snapshot from malformed payload", () => {
		// when
		const snapshot = parseHostGoalSnapshot({ wrong: "shape" });

		// then
		expect(snapshot.available).toBe(false);
		expect(snapshot.status).toBe("unknown");
	});
});

describe("readHostGoalSnapshotInput", () => {
	let dir = "";

	beforeEach(async () => {
		// given
		dir = await mkdtemp(join(tmpdir(), "ug-snap-"));
	});

	it("parses inline JSON string", async () => {
		// when
		const snapshot = await readHostGoalSnapshotInput('{"goal":{"objective":"X","status":"active"}}');

		// then
		expect(snapshot?.available).toBe(true);
		expect(snapshot?.objective).toBe("X");
	});

	it("reads from file path", async () => {
		// given
		const filePath = join(dir, "snap.json");
		await writeFile(filePath, '{"goal":{"objective":"X","status":"complete"}}', "utf8");

		// when
		const snapshot = await readHostGoalSnapshotInput(filePath);

		// then
		expect(snapshot?.available).toBe(true);
		expect(snapshot?.status).toBe("complete");
	});

	it("reads from sample fixture path", async () => {
		// given
		const filePath = join(process.cwd(), "test", "fixtures", "host-goal-snapshot.json");

		// when
		const snapshot = await readHostGoalSnapshotInput(filePath);

		// then
		expect(snapshot?.available).toBe(true);
		expect(snapshot?.objective).toBe("Complete the durable work-loop plan");
	});

	it("throws HostGoalSnapshotError when input is neither JSON nor a path", async () => {
		// when/then
		await expect(readHostGoalSnapshotInput("not json and not a path")).rejects.toThrow(HostGoalSnapshotError);
	});
});

describe("reconcileHostGoalSnapshot", () => {
	it("returns ok=true when snapshot matches expected", () => {
		// when
		const reconciliation = reconcileHostGoalSnapshot(
			{ available: true, objective: "X", status: "active", raw: null },
			{ expectedObjective: "X" },
		);

		// then
		expect(reconciliation.ok).toBe(true);
		expect(reconciliation.errors).toHaveLength(0);
	});

	it("reports error when objective mismatches", () => {
		// when
		const reconciliation = reconcileHostGoalSnapshot(
			{ available: true, objective: "X", status: "active", raw: null },
			{ expectedObjective: "Y" },
		);

		// then
		expect(reconciliation.ok).toBe(false);
		expect(reconciliation.errors.length).toBeGreaterThan(0);
	});

	it("reports error when status mismatches", () => {
		// when
		const reconciliation = reconcileHostGoalSnapshot(
			{ available: true, objective: "X", status: "active", raw: null },
			{ expectedObjective: "X", allowedStatuses: ["complete"] },
		);

		// then
		expect(reconciliation.ok).toBe(false);
		expect(reconciliation.errors.length).toBeGreaterThan(0);
	});
});

describe("formatHostGoalReconciliation", () => {
	it("renders errors joined", () => {
		// given
		const reconciliation = reconcileHostGoalSnapshot(
			{ available: true, objective: "X", status: "active", raw: null },
			{ expectedObjective: "Y", allowedStatuses: ["complete"] },
		);

		// when
		const formatted = formatHostGoalReconciliation(reconciliation);

		// then
		expect(formatted).toMatch(/objective|status/i);
	});
});
