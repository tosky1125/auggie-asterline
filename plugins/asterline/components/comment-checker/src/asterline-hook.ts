import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
	type NormalizedToolEvent,
	normalizeAuggieToolEventFailOpen,
	type ToolExecutionState,
} from "@asterline/hook-bridge";
import { parseApplyPatchRequests } from "./apply-patch.js";
import { toHookInput } from "./hook-input.js";
import { type CommentCheckerRunner, runCommentChecker } from "./runner.js";
import type { CheckerEdit, CommentCheckRequest } from "./types.js";

export type AsterlinePostToolUseInput = unknown;
export type AsterlineHookOptions = { readonly run?: CommentCheckerRunner };

const MAX_STDIN_CHARS = 1_048_576;
const MAX_HOOK_FEEDBACK_CHARS = 8_000;

export function extractAsterlineCommentCheckRequests(raw: unknown): readonly CommentCheckRequest[] {
	const event = normalizeAuggieToolEventFailOpen(raw);
	if (event === null || event.phase !== "post" || !isSucceeded(event.state)) return [];
	switch (event.tool) {
		case "save-file":
			return event.input.content.length === 0
				? []
				: [
						request(event.tool, "Write", event.input.path, {
							file_path: event.input.path,
							content: event.input.content,
						}),
					];
		case "str-replace-editor":
			return replaceRequests(event);
		case "apply_patch":
			return parseApplyPatchRequests(event.input.patch, event.tool);
		case "launch-process":
			return [];
		default:
			return assertNever(event);
	}
}

export async function runCommentCheckerPostToolUse(raw: unknown, options: AsterlineHookOptions = {}): Promise<string> {
	const event = normalizeAuggieToolEventFailOpen(raw);
	if (event === null || event.workspaceRoots.length === 0) return "";
	const requests = extractAsterlineCommentCheckRequests(event.raw);
	if (requests.length === 0) return "";
	const run = options.run ?? runCommentChecker;
	const warnings: { readonly filePath: string; readonly message: string }[] = [];
	for (const item of requests) {
		const result = await run(
			toHookInput(item, {
				sessionId: event.conversationId,
				cwd: event.workspaceRoots[0] ?? "",
			}),
		);
		switch (result.status) {
			case "pass":
			case "missing":
			case "error":
				break;
			case "warning": {
				const message = normalizeText(result.message);
				if (message.length > 0) warnings.push({ filePath: item.filePath, message });
				break;
			}
			default:
				assertNever(result);
		}
	}
	if (warnings.length === 0) return "";
	return JSON.stringify({
		decision: "block",
		reason: limitText(
			warnings
				.map(({ filePath, message }) => `comment-checker found issues in ${filePath}:\n${message}`)
				.join("\n\n"),
		),
	});
}

export async function runAsterlineHookCli(): Promise<void> {
	const input = await readStdin();
	if (input === undefined || input.trim().length === 0) return;
	const output = await runCommentCheckerPostToolUse(input);
	if (output.length > 0) processStdout.write(`${output}\n`);
}

export function parseAsterlinePostToolUseInput(input: string): unknown | undefined {
	return normalizeAuggieToolEventFailOpen(input)?.raw;
}

function replaceRequests(
	event: Extract<NormalizedToolEvent, { readonly tool: "str-replace-editor" }>,
): readonly CommentCheckRequest[] {
	const edits: CheckerEdit[] = event.input.edits
		.filter((edit) => edit.newText !== undefined && edit.newText.length > 0)
		.map((edit) => ({ old_string: edit.oldText ?? "", new_string: edit.newText ?? "" }));
	if (edits.length === 0) return [];
	const first = edits[0];
	if (edits.length === 1 && first !== undefined) {
		return [
			request(event.tool, "Edit", event.input.path, {
				file_path: event.input.path,
				old_string: first.old_string,
				new_string: first.new_string,
			}),
		];
	}
	return [request(event.tool, "MultiEdit", event.input.path, { file_path: event.input.path, edits })];
}

function request(
	sourceToolName: string,
	toolName: CommentCheckRequest["toolName"],
	filePath: string,
	toolInput: CommentCheckRequest["toolInput"],
): CommentCheckRequest {
	return { sourceToolName, toolName, filePath, toolInput };
}

function isSucceeded(state: ToolExecutionState): boolean {
	switch (state.kind) {
		case "succeeded":
			return true;
		case "pending":
		case "failed":
		case "cancelled":
		case "unknown":
			return false;
		default:
			return assertNever(state);
	}
}

function normalizeText(value: string): string {
	return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function limitText(text: string): string {
	if (text.length <= MAX_HOOK_FEEDBACK_CHARS) return text;
	const marker = "\n\n[Truncated hook output to protect the Auggie context window.]";
	return `${text.slice(0, MAX_HOOK_FEEDBACK_CHARS - marker.length).trimEnd()}${marker}`;
}

function readStdin(): Promise<string | undefined> {
	return new Promise((resolve, reject) => {
		let data = "";
		let withinLimit = true;
		processStdin.setEncoding("utf8");
		processStdin.on("data", (chunk: string) => {
			if (!withinLimit) return;
			data += chunk;
			if (data.length > MAX_STDIN_CHARS) withinLimit = false;
		});
		processStdin.once("error", reject);
		processStdin.once("end", () => resolve(withinLimit ? data : undefined));
	});
}

function assertNever(value: never): never {
	throw new TypeError(`Unreachable variant: ${String(value)}`);
}
