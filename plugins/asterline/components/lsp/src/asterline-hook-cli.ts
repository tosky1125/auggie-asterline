import type { Readable } from "node:stream";

import { disposeDefaultLspManager } from "../../../mcp/lsp/dist/index.js";

import { runLspPostToolUseHook } from "./asterline-hook.js";

const MAX_STDIN_CHARS = 1_100_000;

export async function runPostToolUseHookCli(input: Readable = process.stdin): Promise<void> {
	try {
		const raw = await readStdin(input);
		if (raw === null || raw.trim().length === 0) return;
		const output = await runLspPostToolUseHook(raw);
		if (output.length > 0) process.stdout.write(output);
	} catch (error) {
		if (error instanceof Error) return;
		throw error;
	} finally {
		await disposeDefaultLspManager();
	}
}

async function readStdin(input: Readable): Promise<string | null> {
	input.setEncoding("utf8");
	let raw = "";
	for await (const chunk of input) {
		if (typeof chunk !== "string") return null;
		raw += chunk;
		if (raw.length > MAX_STDIN_CHARS) return null;
	}
	return raw;
}
