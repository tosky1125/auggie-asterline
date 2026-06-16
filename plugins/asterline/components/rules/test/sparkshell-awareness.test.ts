import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runSessionStartHook, runUserPromptSubmitHook } from "../src/asterline-hook.js";
import { formatAdditionalContextOutput } from "../src/hook-output.js";

type HookOutput = {
	readonly hookSpecificOutput?: {
		readonly additionalContext?: string;
	};
};

function parseAdditionalContext(output: string): string {
	expect(output.trim().length).toBeGreaterThan(0);
	const parsed = parseHookOutput(JSON.parse(output));
	return parsed.hookSpecificOutput?.additionalContext ?? "";
}

function parseHookOutput(value: unknown): HookOutput {
	if (typeof value !== "object" || value === null) {
		return {};
	}
	const record = value;
	if (!("hookSpecificOutput" in record)) {
		return {};
	}
	const hookSpecificOutput = record.hookSpecificOutput;
	if (typeof hookSpecificOutput !== "object" || hookSpecificOutput === null) {
		return {};
	}
	if (!("additionalContext" in hookSpecificOutput)) {
		return { hookSpecificOutput: {} };
	}
	const additionalContext = hookSpecificOutput.additionalContext;
	if (typeof additionalContext !== "string") {
		return { hookSpecificOutput: {} };
	}
	return {
		hookSpecificOutput: {
			additionalContext,
		},
	};
}

const fixtureRoot = mkdtempSync(join(tmpdir(), "asterline-sparkshell-asterline-bin-"));
const omoOnPathDir = join(fixtureRoot, "path-bin");
const emptyHomeDir = join(fixtureRoot, "empty-home");
const localBinHomeDir = join(fixtureRoot, "local-bin-home");
mkdirSync(omoOnPathDir, { recursive: true });
mkdirSync(emptyHomeDir, { recursive: true });
mkdirSync(join(localBinHomeDir, ".local", "bin"), { recursive: true });
writeFileSync(join(omoOnPathDir, "asterline"), "#!/bin/sh\n");
writeFileSync(join(localBinHomeDir, ".local", "bin", "asterline"), "#!/bin/sh\n");

describe("Asterline Sparkshell awareness", () => {
	afterAll(() => {
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	it("#given active Asterline app server env with asterline on PATH #when SessionStart runs #then emits Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE: "Asterline Desktop",
			ASTERLINE_SHELL: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
			PATH: omoOnPathDir,
			HOME: emptyHomeDir,
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-active",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(parseAdditionalContext(output)).toContain("asterline sparkshell <command>");
		expect(parseAdditionalContext(output)).toContain("ASTERLINE_SPARKSHELL_SESSION_CONTEXT");
		expect(parseAdditionalContext(output)).toContain("ASTERLINE_SPARKSHELL_CONDENSE");
		expect(parseAdditionalContext(output)).toContain("ASTERLINE_SPARKSHELL_SPARK");
		expect(parseAdditionalContext(output)).toContain("[sparkshell caption]");
		expect(parseAdditionalContext(output)).not.toContain("[REDACTED]");
	});

	it("#given inactive env #when SessionStart runs #then emits no Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-inactive",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(output).toBe("");
	});

	it("#given Asterline CLI appserver socket env #when SessionStart runs #then emits Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET: "/tmp/app-server-control.sock",
			ASTERLINE_THREAD_ID: "thread-sparkshell-cli",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
			PATH: omoOnPathDir,
			HOME: emptyHomeDir,
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-cli-wrapper",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(parseAdditionalContext(output)).toContain("asterline sparkshell <command>");
	});

	it("#given active Asterline app env without a resolvable asterline command #when SessionStart runs #then emits no Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE: "Asterline Desktop",
			ASTERLINE_SHELL: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
			PATH: join(fixtureRoot, "missing-path-entry"),
			HOME: emptyHomeDir,
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-unresolvable",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(output).toBe("");
	});

	it("#given asterline only under HOME/.local/bin #when SessionStart runs #then emits guidance with the absolute asterline path", async () => {
		// given
		const env = {
			ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE: "Asterline Desktop",
			ASTERLINE_SHELL: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
			PATH: join(fixtureRoot, "missing-path-entry"),
			HOME: localBinHomeDir,
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-local-bin",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		const context = parseAdditionalContext(output);
		expect(context).toContain(`${join(localBinHomeDir, ".local", "bin", "asterline")} sparkshell <command>`);
		expect(context).not.toContain("`asterline sparkshell <command>`");
	});

	it("#given explicit force-on env #when SessionStart runs #then emits Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_SPARKSHELL_AWARENESS: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-force-on",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(parseAdditionalContext(output)).toContain("asterline sparkshell <command>");
	});

	it("#given explicit force-off env with active Asterline app context #when SessionStart runs #then emits no Sparkshell guidance", async () => {
		// given
		const env = {
			ASTERLINE_SPARKSHELL_AWARENESS: "0",
			ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE: "Asterline Desktop",
			ASTERLINE_SHELL: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
		};

		// when
		const output = await runSessionStartHook(
			{
				session_id: "session-sparkshell-force-off",
				transcript_path: null,
				cwd: process.cwd(),
				hook_event_name: "SessionStart",
				model: "gpt-5.5",
				permission_mode: "default",
				source: "startup",
			},
			{ env },
		);

		// then
		expect(output).toBe("");
	});

	it("#given Sparkshell awareness already emitted for a session #when UserPromptSubmit runs #then emits no duplicate guidance", async () => {
		// given
		const pluginDataRoot = mkdtempSync(join(tmpdir(), "asterline-sparkshell-awareness-"));
		const env = {
			ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE: "Asterline Desktop",
			ASTERLINE_SHELL: "1",
			ASTERLINE_RULES_ENABLED_SOURCES: ".asterline/rules",
			PATH: omoOnPathDir,
			HOME: emptyHomeDir,
		};
		try {
			const firstOutput = await runSessionStartHook(
				{
					session_id: "session-sparkshell-dedupe",
					transcript_path: null,
					cwd: process.cwd(),
					hook_event_name: "SessionStart",
					model: "gpt-5.5",
					permission_mode: "default",
					source: "startup",
				},
				{ env, pluginDataRoot },
			);
			expect(parseAdditionalContext(firstOutput)).toContain("asterline sparkshell <command>");

			// when
			const secondOutput = await runUserPromptSubmitHook(
				{
					session_id: "session-sparkshell-dedupe",
					turn_id: "turn-1",
					transcript_path: null,
					cwd: process.cwd(),
					hook_event_name: "UserPromptSubmit",
					model: "gpt-5.5",
					permission_mode: "default",
					prompt: "continue",
				},
				{ env, pluginDataRoot },
			);

			// then
			expect(secondOutput).toBe("");
		} finally {
			rmSync(pluginDataRoot, { recursive: true, force: true });
		}
	});

	it("#given explicit force-on env #when hook output is formatted #then awareness remains valid hook JSON", () => {
		// given
		const context = [
			"## Sparkshell Runtime",
			"",
			"- Prefer `asterline sparkshell <command>` for shell-native inspection.",
		].join("\n");

		// when
		const output = formatAdditionalContextOutput("SessionStart", context);

		// then
		expect(parseAdditionalContext(output)).toContain("## Sparkshell Runtime");
	});
});
