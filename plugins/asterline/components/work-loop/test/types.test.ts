import { describe, expect, it } from "vitest";

import {
	iso,
	WORK_LOOP_BRIEF,
	WORK_LOOP_CRITERION_STATUSES,
	WORK_LOOP_DIR,
	WORK_LOOP_GOALS,
	WORK_LOOP_LEDGER,
	WORK_LOOP_STEERING_MUTATION_KINDS,
	WORK_LOOP_SUCCESS_CRITERION_USER_MODELS,
	WorkLoopError,
} from "../src/types.ts";

describe("work-loop domain constants", () => {
	describe("when checking workspace paths", () => {
		it("then WORK_LOOP_DIR points to the asterline workspace", () => {
			expect(WORK_LOOP_DIR).toBe(".asterline/work-loop");
		});

		it("then artifact filenames are stable", () => {
			expect(WORK_LOOP_BRIEF).toBe("brief.md");
			expect(WORK_LOOP_GOALS).toBe("goals.json");
			expect(WORK_LOOP_LEDGER).toBe("ledger.jsonl");
		});
	});

	describe("when checking steering mutation kinds", () => {
		it("then includes the new revise_criterion kind", () => {
			expect(WORK_LOOP_STEERING_MUTATION_KINDS).toContain("revise_criterion");
		});

		it("then totals 7 kinds", () => {
			expect(WORK_LOOP_STEERING_MUTATION_KINDS).toHaveLength(7);
		});
	});

	describe("when checking criterion user models", () => {
		it("then exposes 4 user models including adversarial", () => {
			expect(WORK_LOOP_SUCCESS_CRITERION_USER_MODELS).toEqual(["happy", "edge", "regression", "adversarial"]);
		});
	});

	describe("when checking criterion statuses", () => {
		it("then exposes pending/pass/fail/blocked", () => {
			expect(WORK_LOOP_CRITERION_STATUSES).toEqual(["pending", "pass", "fail", "blocked"]);
		});
	});
});

describe("WorkLoopError", () => {
	describe("when constructed with code", () => {
		it("then is an Error instance carrying the code", () => {
			const err = new WorkLoopError("bad", "TEST_CODE");

			expect(err).toBeInstanceOf(Error);
			expect(err.code).toBe("TEST_CODE");
			expect(err.message).toBe("bad");
		});

		it("then accepts optional cause + details", () => {
			const cause = new Error("upstream");
			const err = new WorkLoopError("wrap", "WRAP", { cause, details: { goalId: "G001" } });

			expect(err.cause).toBe(cause);
			expect(err.details).toEqual({ goalId: "G001" });
		});
	});
});

describe("iso()", () => {
	describe("when called", () => {
		it("then returns an ISO 8601 string", () => {
			const s = iso();

			expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});
});
