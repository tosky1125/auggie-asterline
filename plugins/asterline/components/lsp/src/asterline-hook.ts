import { fileURLToPath } from "node:url";

import { normalizeAuggieToolEventFailOpen } from "../../hook-bridge/src/auggie-payload.js";
import { callDiagnosticsViaDaemon, currentRequestContext } from "../../../mcp/lsp/dist/index.js";

type DiagnosticsOutcome =
	| { readonly kind: "clean" }
	| { readonly kind: "diagnostics"; readonly text: string }
	| { readonly kind: "unavailable" };

export type DiagnosticsRunner = (filePath: string) => Promise<string | DiagnosticsOutcome>;

type DiagnosticBlock = {
	readonly filePath: string;
	readonly diagnostics: string;
};

type PostToolUseHookOutput = {
	readonly decision: "block";
	readonly reason: string;
	readonly hookSpecificOutput: {
		readonly hookEventName: "PostToolUse";
		readonly additionalContext: string;
	};
};

const MAX_CONCURRENT_DIAGNOSTICS = 4;
const MAX_FEEDBACK_CHARS = 8_000;
const CLEAN_TEXT = /^(?:no diagnostics found|no issues found)$/i;
const UNAVAILABLE_TEXT = /(?:daemon unreachable|no lsp server|not configured|not installed|command not found|still initializing|request timeout)/i;
const DIAGNOSTIC_START = /(?:error|warning|information|hint)\[[^\]\r\n]+\] \(\d+\) at \d+:\d+:/i;
const SHIPPED_DAEMON_CLI = fileURLToPath(new URL("../../../mcp/lsp/dist/cli.js", import.meta.url));

export async function runLspDiagnostics(filePath: string): Promise<DiagnosticsOutcome> {
	if (process.env["ASTERLINE_LSP_DAEMON_CLI"] === undefined) {
		process.env["ASTERLINE_LSP_DAEMON_CLI"] = SHIPPED_DAEMON_CLI;
	}
	const result: unknown = await callDiagnosticsViaDaemon(filePath, { context: currentRequestContext() });
	return parseDaemonResult(result);
}

export async function runLspPostToolUseHook(
	input: unknown,
	runDiagnostics: DiagnosticsRunner = runLspDiagnostics,
): Promise<string> {
	const event = normalizeAuggieToolEventFailOpen(input);
	if (event === null || event.phase !== "post" || event.state.kind !== "succeeded") return "";
	if (event.tool === "launch-process" || event.affectedPaths.length === 0) return "";

	const blocks = (await collectDiagnostics(event.affectedPaths, runDiagnostics)).filter(
		(result): result is DiagnosticBlock => result !== null,
	);
	if (blocks.length === 0) return "";

	const reason = limitFeedback(blocks.map(formatBlock).join("\n\n"));
	const output: PostToolUseHookOutput = {
		decision: "block",
		reason,
		hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: reason },
	};
	return `${JSON.stringify(output)}\n`;
}

async function collectDiagnostics(
	filePaths: readonly string[],
	runDiagnostics: DiagnosticsRunner,
): Promise<readonly (DiagnosticBlock | null)[]> {
	const uniquePaths = [...new Set(filePaths.filter((path) => path.length > 0))];
	const results: (DiagnosticBlock | null)[] = Array.from({ length: uniquePaths.length }, () => null);
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = nextIndex;
			nextIndex += 1;
			const filePath = uniquePaths[index];
			if (filePath === undefined) return;
			results[index] = await diagnoseFile(filePath, runDiagnostics);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(MAX_CONCURRENT_DIAGNOSTICS, uniquePaths.length) }, () => worker()),
	);
	return results;
}

async function diagnoseFile(filePath: string, runDiagnostics: DiagnosticsRunner): Promise<DiagnosticBlock | null> {
	try {
		const raw = await runDiagnostics(filePath);
		const outcome = typeof raw === "string" ? parseTextOutcome(raw) : raw;
		return outcome.kind === "diagnostics" ? { filePath, diagnostics: outcome.text } : null;
	} catch (error) {
		if (!(error instanceof Error)) return null;
		return null;
	}
}

function parseDaemonResult(value: unknown): DiagnosticsOutcome {
	if (!isRecord(value)) return { kind: "unavailable" };
	const details = value["details"];
	if (isRecord(details) && details["errorKind"] === "missing_dependency") return { kind: "unavailable" };
	const content = value["content"];
	if (!Array.isArray(content)) return { kind: "unavailable" };
	const text = content
		.map((block) => (isRecord(block) && typeof block["text"] === "string" ? block["text"] : ""))
		.filter((part) => part.length > 0)
		.join("\n")
		.trim();
	return parseTextOutcome(text);
}

function parseTextOutcome(value: string): DiagnosticsOutcome {
	const text = value.trim();
	if (text.length === 0 || CLEAN_TEXT.test(text)) return { kind: "clean" };
	if (UNAVAILABLE_TEXT.test(text) && !DIAGNOSTIC_START.test(text)) return { kind: "unavailable" };
	return { kind: "diagnostics", text };
}

function formatBlock(block: DiagnosticBlock): string {
	return `LSP diagnostics after editing ${block.filePath}:\n\n${block.diagnostics}`;
}

function limitFeedback(value: string): string {
	if (value.length <= MAX_FEEDBACK_CHARS) return value;
	const marker = "\n\n[Truncated LSP hook output.]";
	return `${value.slice(0, MAX_FEEDBACK_CHARS - marker.length).trimEnd()}${marker}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
