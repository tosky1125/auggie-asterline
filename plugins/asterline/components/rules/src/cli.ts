#!/usr/bin/env node
import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
	type AsterlinePostCompactInput,
	type AsterlinePostToolUseInput,
	type AsterlineRulesHookOptions,
	type AsterlineSessionStartInput,
	type AsterlineUserPromptSubmitInput,
	runPostCompactHook,
	runPostToolUseHook,
	runSessionStartHook,
	runUserPromptSubmitHook,
} from "./asterline-hook.js";

const command = process.argv[2];
const subcommand = process.argv[3];
type HookCliEventName = "SessionStart" | "UserPromptSubmit" | "PostToolUse" | "PostCompact";

if (command === "hook" && subcommand === "session-start") {
	await runHookCli("SessionStart");
} else if (command === "hook" && subcommand === "user-prompt-submit") {
	await runHookCli("UserPromptSubmit");
} else if (command === "hook" && subcommand === "post-tool-use") {
	await runHookCli("PostToolUse");
} else if (command === "hook" && subcommand === "post-compact") {
	await runHookCli("PostCompact");
} else {
	process.stderr.write("Usage: asterline-rules hook [session-start|user-prompt-submit|post-tool-use|post-compact]\n");
	process.exitCode = 1;
}

async function runHookCli(eventName: HookCliEventName): Promise<void> {
	const raw = await readStdin();
	if (raw.trim().length === 0) return;
	const parsed = parseHookInput(raw);
	if (!parsed) return;
	const pluginDataRoot = process.env["PLUGIN_DATA"];
	const options: AsterlineRulesHookOptions = pluginDataRoot === undefined ? {} : { pluginDataRoot };
	const output = await runHook(eventName, parsed, options);
	if (output.length > 0) {
		processStdout.write(output);
	}
}

async function runHook(eventName: HookCliEventName, parsed: unknown, options: AsterlineRulesHookOptions): Promise<string> {
	switch (eventName) {
		case "SessionStart":
			return isAsterlineSessionStartInput(parsed) ? await runSessionStartHook(parsed, options) : "";
		case "UserPromptSubmit":
			return isAsterlineUserPromptSubmitInput(parsed) ? await runUserPromptSubmitHook(parsed, options) : "";
		case "PostToolUse":
			return isAsterlinePostToolUseInput(parsed) ? await runPostToolUseHook(parsed, options) : "";
		case "PostCompact":
			return isAsterlinePostCompactInput(parsed) ? await runPostCompactHook(parsed, options) : "";
	}
}

function parseHookInput(raw: string): unknown | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed;
	} catch {
		return undefined;
	}
}

function isAsterlineSessionStartInput(value: unknown): value is AsterlineSessionStartInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "SessionStart" &&
		typeof value["session_id"] === "string" &&
		isStringOrNull(value["transcript_path"]) &&
		typeof value["cwd"] === "string" &&
		typeof value["model"] === "string" &&
		typeof value["permission_mode"] === "string" &&
		typeof value["source"] === "string"
	);
}

function isAsterlineUserPromptSubmitInput(value: unknown): value is AsterlineUserPromptSubmitInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "UserPromptSubmit" &&
		typeof value["session_id"] === "string" &&
		typeof value["turn_id"] === "string" &&
		isStringOrNull(value["transcript_path"]) &&
		typeof value["cwd"] === "string" &&
		typeof value["model"] === "string" &&
		typeof value["permission_mode"] === "string" &&
		typeof value["prompt"] === "string"
	);
}

function isAsterlinePostToolUseInput(value: unknown): value is AsterlinePostToolUseInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "PostToolUse" &&
		typeof value["session_id"] === "string" &&
		typeof value["turn_id"] === "string" &&
		isStringOrNull(value["transcript_path"]) &&
		typeof value["cwd"] === "string" &&
		typeof value["model"] === "string" &&
		typeof value["permission_mode"] === "string" &&
		typeof value["tool_name"] === "string" &&
		typeof value["tool_use_id"] === "string"
	);
}

function isAsterlinePostCompactInput(value: unknown): value is AsterlinePostCompactInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "PostCompact" &&
		typeof value["session_id"] === "string" &&
		typeof value["turn_id"] === "string" &&
		isStringOrNull(value["transcript_path"]) &&
		typeof value["cwd"] === "string" &&
		typeof value["model"] === "string" &&
		(value["trigger"] === "manual" || value["trigger"] === "auto")
	);
}

function isStringOrNull(value: unknown): value is string | null {
	return typeof value === "string" || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		processStdin.setEncoding("utf8");
		processStdin.on("data", (chunk: string) => {
			data += chunk;
		});
		processStdin.once("error", reject);
		processStdin.once("end", () => {
			resolve(data);
		});
	});
}
