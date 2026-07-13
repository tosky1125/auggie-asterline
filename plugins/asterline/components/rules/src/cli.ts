#!/usr/bin/env node
import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
	type AsterlineRulesHookOptions,
	runPostToolUseHook,
	runSessionStartHook,
} from "./asterline-hook.js";
import { AuggiePayloadError } from "../../hook-bridge/src/auggie-payload.js";
import { parseAuggiePostToolUse, parseAuggieSessionStart } from "./auggie-hook-input.js";

const command = process.argv[2];
const subcommand = process.argv[3];
type HookCliEventName = "SessionStart" | "PostToolUse";

if (command === "hook" && subcommand === "session-start") {
	await runHookCli("SessionStart");
} else if (command === "hook" && subcommand === "post-tool-use") {
	await runHookCli("PostToolUse");
} else {
	process.stderr.write("Usage: asterline-rules hook [session-start|post-tool-use]\n");
	process.exitCode = 1;
}

async function runHookCli(eventName: HookCliEventName): Promise<void> {
	const raw = await readStdin();
	if (raw.trim().length === 0) return;
	const pluginDataRoot = process.env["PLUGIN_DATA"];
	const options: AsterlineRulesHookOptions = pluginDataRoot === undefined ? {} : { pluginDataRoot };
	try {
		const output = await runHook(eventName, raw, options);
		if (output.length > 0) processStdout.write(output);
	} catch (error) {
		if (error instanceof AuggiePayloadError) return;
		throw error;
	}
}

async function runHook(eventName: HookCliEventName, raw: string, options: AsterlineRulesHookOptions): Promise<string> {
	switch (eventName) {
		case "SessionStart":
			return runSessionStartHook(parseAuggieSessionStart(raw), options);
		case "PostToolUse":
			return runPostToolUseHook(parseAuggiePostToolUse(raw), options);
	}
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
