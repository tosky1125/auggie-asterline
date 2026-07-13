import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Readable, Writable } from "node:stream";

import {
	applyGitBashPreToolUseReminder,
	parsePreToolUsePayload,
	runGitBashHookCli,
	type PreToolUsePayload,
} from "../src/asterline-hook.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "asterline-git-bash-hook-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function launchPayload(sessionId = "session-1"): PreToolUsePayload {
	return {
		hook_event_name: "PreToolUse",
		session_id: sessionId,
		tool_input: { command: "pwd", cwd: "C:\\repo" },
		tool_name: "launch-process",
	};
}

function windowsEnv(): NodeJS.ProcessEnv {
	return { OS: "Windows_NT", ComSpec: "C:\\Windows\\System32\\cmd.exe" };
}

function marker(root: string, sessionId: string): string {
	const digest = createHash("sha256").update(sessionId).digest("hex");
	return join(root, "git-bash-reminder", `${digest}.seen`);
}

function captureStdout(): { readonly stdout: Writable; readonly read: () => string } {
	let captured = "";
	const stdout = new Writable({
		write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
			captured += chunk instanceof Buffer ? chunk.toString() : String(chunk);
			callback();
		},
	});
	return { stdout, read: () => captured };
}

describe("applyGitBashPreToolUseReminder", () => {
	it("#given first Windows launch-process #when hook runs #then emits Asterline guidance", () => {
		const output = applyGitBashPreToolUseReminder(launchPayload(), {
			env: windowsEnv(),
			platform: "linux",
			pluginDataRoot: createTemporaryDirectory(),
		});
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("ASTERLINE git_bash MCP");
	});

	it("#given repeated calls in one session #when hook runs #then exactly one claims the marker", () => {
		const pluginDataRoot = createTemporaryDirectory();
		const outputs = Array.from({ length: 8 }, () =>
			applyGitBashPreToolUseReminder(launchPayload(), { env: windowsEnv(), platform: "linux", pluginDataRoot }),
		);
		expect(outputs.filter((output) => output.length > 0)).toHaveLength(1);
	});

	it("#given non-Windows host #when hook runs #then it stays silent", () => {
		const output = applyGitBashPreToolUseReminder(launchPayload(), {
			env: {},
			platform: "darwin",
			pluginDataRoot: createTemporaryDirectory(),
		});
		expect(output).toBe("");
	});

	it("#given both plugin data variables #when hook runs #then ASTERLINE_PLUGIN_DATA wins", () => {
		const root = createTemporaryDirectory();
		const preferred = join(root, "preferred");
		const legacy = join(root, "legacy");
		applyGitBashPreToolUseReminder(launchPayload("precedence"), {
			env: { ...windowsEnv(), ASTERLINE_PLUGIN_DATA: preferred, PLUGIN_DATA: legacy },
			platform: "linux",
		});
		expect(existsSync(marker(preferred, "precedence"))).toBeTrue();
		expect(existsSync(marker(legacy, "precedence"))).toBeFalse();
	});

	it("#given no plugin data override #when hook runs #then fallback is absolute under Augment plugin data", () => {
		const root = createTemporaryDirectory();
		const home = join(root, "home");
		const fallback = join(home, ".augment", "asterline", "plugin-data");
		applyGitBashPreToolUseReminder(launchPayload("fallback"), {
			env: { ...windowsEnv(), HOME: home },
			platform: "linux",
		});
		expect(isAbsolute(fallback)).toBeTrue();
		expect(existsSync(marker(fallback, "fallback"))).toBeTrue();
	});
});

describe("parsePreToolUsePayload", () => {
	it("#given Bash alias or malformed input #when parsed #then both fail open", () => {
		expect(parsePreToolUsePayload("{broken")).toBeNull();
		expect(parsePreToolUsePayload(JSON.stringify({ ...launchPayload(), tool_name: "Bash" }))).toBeNull();
		expect(parsePreToolUsePayload(JSON.stringify({ ...launchPayload(), tool_input: {} }))).toBeNull();
	});
});

describe("runGitBashHookCli", () => {
	it("#given Auggie stdin on Windows #when CLI hook runs #then it writes reminder JSON", async () => {
		const capture = captureStdout();
		await runGitBashHookCli(Readable.from([JSON.stringify(launchPayload())]), capture.stdout, {
			env: windowsEnv(),
			platform: "linux",
			pluginDataRoot: createTemporaryDirectory(),
		});
		expect(capture.read()).toContain("git_bash MCP");
	});
});
