import { describe, expect, it } from "vitest";

import {
	normalizeWorkLoopSessionId,
	repoRelative,
	workLoopBriefPath,
	workLoopDir,
	workLoopGoalsPath,
	workLoopLedgerPath,
} from "../src/paths.ts";

describe("workLoopDir(repo)", () => {
	it("returns repo + '/.asterline/work-loop'", () => {
		// when/then
		expect(workLoopDir("/repo")).toBe("/repo/.asterline/work-loop");
	});

	it("#given a session id #when resolving the loop dir #then scopes artifacts under that session", () => {
		// when/then
		expect(workLoopDir("/repo", { sessionId: "sess_abc" })).toBe("/repo/.asterline/work-loop/sess_abc");
	});
});

describe("work-loop*Path helpers", () => {
	it("compose artifact filenames under workLoopDir", () => {
		// when/then
		expect(workLoopBriefPath("/r")).toBe("/r/.asterline/work-loop/brief.md");
		expect(workLoopGoalsPath("/r")).toBe("/r/.asterline/work-loop/goals.json");
		expect(workLoopLedgerPath("/r")).toBe("/r/.asterline/work-loop/ledger.jsonl");
	});

	it("#given a session id #when composing artifact filenames #then returns session-scoped paths", () => {
		// when/then
		expect(workLoopBriefPath("/r", { sessionId: "session-A" })).toBe("/r/.asterline/work-loop/session-A/brief.md");
		expect(workLoopGoalsPath("/r", { sessionId: "session-A" })).toBe("/r/.asterline/work-loop/session-A/goals.json");
		expect(workLoopLedgerPath("/r", { sessionId: "session-A" })).toBe("/r/.asterline/work-loop/session-A/ledger.jsonl");
	});
});

describe("normalizeWorkLoopSessionId", () => {
	it("#given traversal-like input #when parsed #then rejects the colliding session id", () => {
		// when/then
		expect(() => normalizeWorkLoopSessionId("../bad/id")).toThrowError(/Session id/u);
	});

	it("#given blank input #when normalized #then returns null", () => {
		// when/then
		expect(normalizeWorkLoopSessionId("  ")).toBeNull();
	});
});

describe("repoRelative", () => {
	it("strips repo prefix when path is inside repo", () => {
		// when/then
		expect(repoRelative("/repo/.asterline/work-loop/goals.json", "/repo")).toBe(".asterline/work-loop/goals.json");
	});

	it("returns absolute when path is outside repo", () => {
		// when/then
		expect(repoRelative("/elsewhere/file", "/repo")).toBe("/elsewhere/file");
	});
});
