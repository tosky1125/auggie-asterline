import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateQualityGate } from "../src/quality-gate.js";
import { WorkLoopError } from "../src/types.js";

const CRITERIA = [
	{ goalId: "G001", criterionId: "C001" },
	{ goalId: "G001", criterionId: "C002" },
	{ goalId: "G001", criterionId: "C003" },
] as const;
const TEMP_ROOTS = new Set<string>();
type GateFixture = { readonly root: string; readonly attempt: string };
type GateOverrides = { readonly surfaceRefs?: readonly string[]; readonly adversarialRef?: string; readonly artifactPath?: string; readonly totalCriteria?: number; readonly passCount?: number };

afterEach(() => {
	for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
	TEMP_ROOTS.clear();
});

function gate(fixture: GateFixture, overrides: GateOverrides = {}): Record<string, unknown> {
	const { root, attempt } = fixture;
	const refs = overrides.surfaceRefs ?? ["C001", "C002"];
	const artifact = overrides.artifactPath ?? relative(root, join(attempt, "qa.log"));
	const report = relative(root, join(attempt, "review.md"));
	return {
		codeReview: { by: "judge", recommendation: "APPROVE", codeQualityStatus: "CLEAR", reportPath: report, evidence: "review passed", blockers: [] },
		manualQa: {
			by: "operator",
			status: "passed",
			evidence: "manual QA passed",
			surfaceEvidence: refs.map((criterionRef, index) => ({ id: `S${index + 1}`, criterionRef, surface: "cli", invocation: "node --test", verdict: "passed", artifactRefs: ["A1"] })),
			adversarialCases: [{ id: "X1", criterionRef: overrides.adversarialRef ?? "C003", scenario: "malformed input", expectedBehavior: "typed rejection", verdict: "passed", artifactRefs: ["A1"] }],
			artifactRefs: [{ id: "A1", kind: "cli-transcript", description: "QA transcript", path: artifact }],
		},
		gateReview: { by: "skeptic", recommendation: "APPROVE", reportPath: report, evidence: "gate passed", blockers: [] },
		iteration: { fullRerun: true, status: "passed", rerunCommands: ["node --test"], evidence: "rerun passed" },
		criteriaCoverage: { totalCriteria: overrides.totalCriteria ?? 3, passCount: overrides.passCount ?? 3, originalIntent: "ship safely", desiredOutcome: "verified delivery", userOutcomeReview: "met", adversarialClassesCovered: ["malformed_input"] },
	};
}

function fixture(): GateFixture {
	const root = mkdtempSync(join(tmpdir(), "work-loop-gate-security-"));
	TEMP_ROOTS.add(root);
	const attempt = join(root, ".asterline", "evidence", "work-loop", "session", "G001", "a1");
	mkdirSync(attempt, { recursive: true });
	writeFileSync(join(attempt, "qa.log"), "QA passed\n");
	writeFileSync(join(attempt, "review.md"), "Review passed\n");
	return { root, attempt };
}

function validate(input: unknown, fixture: GateFixture, criteria = CRITERIA): void {
	const { root, attempt } = fixture;
	validateQualityGate(input, {
		repoRoot: root,
		currentAttemptDir: relative(root, attempt),
		criteria,
		fs: { existsSync, lstatSync, realpathSync },
	});
}

function expectInvalid(action: () => void, field: string): void {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(WorkLoopError);
		if (!(error instanceof WorkLoopError)) throw error;
		expect(error.message).toContain(field);
		return;
	}
	throw new Error("Expected WorkLoopError");
}

describe("quality-gate artifact boundary", () => {
	it("Given a directory artifact When the gate validates Then it rejects the non-regular file", () => {
		const current = fixture();
		const { root, attempt } = current;
		mkdirSync(join(attempt, "qa-dir"));
		const input = gate(current, { artifactPath: relative(root, join(attempt, "qa-dir")) });
		expectInvalid(() => validate(input, current), "regular non-symlink");
	});

	it("Given a symlink artifact When the gate validates Then it rejects the link", () => {
		const current = fixture();
		const { root, attempt } = current;
		symlinkSync(join(attempt, "qa.log"), join(attempt, "qa-link"));
		const input = gate(current, { artifactPath: relative(root, join(attempt, "qa-link")) });
		expectInvalid(() => validate(input, current), "regular non-symlink");
	});

	it("Given an in-attempt path through an escaping parent symlink When the gate validates Then realpath containment rejects it", () => {
		const current = fixture();
		const { root, attempt } = current;
		const outside = mkdtempSync(join(tmpdir(), "work-loop-gate-outside-"));
		TEMP_ROOTS.add(outside);
		writeFileSync(join(outside, "qa.log"), "forged QA\n");
		symlinkSync(outside, join(attempt, "escape"));
		const input = gate(current, { artifactPath: relative(root, join(attempt, "escape", "qa.log")) });
		expectInvalid(() => validate(input, current), "current attempt");
	});
});

describe("quality-gate plan criterion coverage", () => {
	it("Given exact plan coverage When the gate validates Then it accepts the derived counts and refs", () => {
		const current = fixture();
		expect(() => validate(gate(current), current)).not.toThrow();
	});

	it("Given fabricated coverage totals When the gate validates Then it rejects totals that differ from the plan", () => {
		const current = fixture();
		expectInvalid(() => validate(gate(current, { totalCriteria: 999, passCount: 999 }), current), "criteriaCoverage.totalCriteria");
	});

	it("Given a missing criterionRef When the gate validates Then it rejects incomplete plan coverage", () => {
		const current = fixture();
		expectInvalid(() => validate(gate(current, { surfaceRefs: ["C001"] }), current), "criterionRef");
	});

	it("Given an unknown criterionRef When the gate validates Then it rejects the foreign criterion", () => {
		const current = fixture();
		expectInvalid(() => validate(gate(current, { surfaceRefs: ["C001", "C999"] }), current), "unknown");
	});

	it("Given a duplicate criterionRef When the gate validates Then it rejects duplicate coverage", () => {
		const current = fixture();
		expectInvalid(() => validate(gate(current, { surfaceRefs: ["C001", "C001"] }), current), "duplicate");
	});

	it("Given repeated criterion ids across goals When refs are qualified Then exact plan coverage is unambiguous", () => {
		const current = fixture();
		const criteria = [{ goalId: "G001", criterionId: "C001" }, { goalId: "G002", criterionId: "C001" }, { goalId: "G002", criterionId: "C002" }] as const;
		const input = gate(current, { surfaceRefs: ["G001:C001", "G002:C001"], adversarialRef: "G002:C002" });
		expect(() => validate(input, current, criteria)).not.toThrow();
	});

	it("Given repeated criterion ids across goals When a bare ref is used Then the ambiguous ref is rejected", () => {
		const current = fixture();
		const criteria = [{ goalId: "G001", criterionId: "C001" }, { goalId: "G002", criterionId: "C001" }, { goalId: "G002", criterionId: "C002" }] as const;
		const input = gate(current, { surfaceRefs: ["C001", "G002:C001"], adversarialRef: "G002:C002" });
		expectInvalid(() => validate(input, current, criteria), "ambiguous");
	});
});
