import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workLoopCommand } from "../src/cli-commands.ts";

let testDir: string;
let out: string[];
let err: string[];
let originalAsterlineSessionId: string | undefined;
let originalAsterlineThreadId: string | undefined;
let originalOmoSessionId: string | undefined;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), "ug-cli-json-err-"));
	out = [];
	err = [];
	originalAsterlineSessionId = process.env["ASTERLINE_SESSION_ID"];
	originalAsterlineThreadId = process.env["AUGGIE_SESSION_ID"];
	originalOmoSessionId = process.env["ASTERLINE_WORK_LOOP_SESSION_ID"];
	delete process.env["ASTERLINE_SESSION_ID"];
	delete process.env["AUGGIE_SESSION_ID"];
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
	if (originalAsterlineThreadId === undefined) delete process.env["AUGGIE_SESSION_ID"];
	else process.env["AUGGIE_SESSION_ID"] = originalAsterlineThreadId;
	if (originalOmoSessionId === undefined) delete process.env["ASTERLINE_WORK_LOOP_SESSION_ID"];
	else process.env["ASTERLINE_WORK_LOOP_SESSION_ID"] = originalOmoSessionId;
	await rm(testDir, { recursive: true, force: true });
});

function stdoutJson(): Record<string, unknown> {
	return JSON.parse(out.join(""));
}

describe("workLoopCommand --json error contract", () => {
	it("#given no plan #when status --json #then emits JSON error on stdout, nothing on stderr, exit 1", async () => {
		const code = await workLoopCommand(["status", "--json"]);

		expect(code).toBe(1);
		expect(err.join("")).toBe("");
		expect(stdoutJson()).toMatchObject({
			ok: false,
			error: { code: "WORK_LOOP_PLAN_MISSING", message: expect.stringContaining("No work-loop plan") },
		});
	});

	it("#given no plan #when complete-goals --json #then emits JSON error on stdout, exit 1", async () => {
		const code = await workLoopCommand(["complete-goals", "--json"]);

		expect(code).toBe(1);
		expect(err.join("")).toBe("");
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: "WORK_LOOP_PLAN_MISSING" } });
	});

	it("#given an unknown subcommand #when --json #then emits a JSON error (not help text), exit 1", async () => {
		const code = await workLoopCommand(["wat", "--json"]);

		expect(code).toBe(1);
		expect(out.join("")).not.toContain("Usage:");
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: expect.any(String) } });
	});

	it("#given a malformed required flag #when --json #then surfaces the WorkLoopError code with details on stdout", async () => {
		const code = await workLoopCommand(["criteria", "--json"]);

		expect(code).toBe(1);
		expect(err.join("")).toBe("");
		expect(stdoutJson()).toMatchObject({
			ok: false,
			error: { code: "WORK_LOOP_ARGUMENT_MISSING", details: { flag: "--goal-id" } },
		});
	});
});
