import {
	AuggiePayloadError,
	normalizeAuggieToolEvent,
	type JsonObject,
} from "../../hook-bridge/src/auggie-payload.js";
import { parseJsonEnvelope } from "../../hook-bridge/src/json-boundary.js";

import type { AsterlinePostToolUseInput, AsterlineSessionStartInput } from "./asterline-hook.js";

const SESSION_SOURCES = new Set(["startup", "resume", "clear", "compact"]);

function requiredString(value: JsonObject, key: string): string {
	const field = value[key];
	if (typeof field !== "string" || field.length === 0) throw new AuggiePayloadError("expected a non-empty string", `$.${key}`);
	return field;
}

function workspaceRoot(value: JsonObject): string {
	const roots = value["workspace_roots"];
	if (!Array.isArray(roots) || roots.length === 0 || typeof roots[0] !== "string" || roots[0].length === 0) {
		throw new AuggiePayloadError("expected at least one workspace root", "$.workspace_roots");
	}
	return roots[0];
}

export function parseAuggieSessionStart(raw: unknown): AsterlineSessionStartInput {
	const value = parseJsonEnvelope(raw);
	if (value["hook_event_name"] !== "SessionStart") throw new AuggiePayloadError("unsupported hook event");
	const sourceValue = value["source"];
	const source = typeof sourceValue === "string" && SESSION_SOURCES.has(sourceValue) ? sourceValue : "startup";
	return {
		session_id: requiredString(value, "conversation_id"),
		transcript_path: null,
		cwd: workspaceRoot(value),
		hook_event_name: "SessionStart",
		model: process.env["ASTERLINE_RULES_MODEL"] ?? "gpt-5.5",
		permission_mode: "default",
		source: source === "resume" || source === "clear" || source === "compact" ? source : "startup",
	};
}

export function parseAuggiePostToolUse(raw: unknown): AsterlinePostToolUseInput {
	const event = normalizeAuggieToolEvent(raw);
	if (event.phase !== "post") throw new AuggiePayloadError("expected PostToolUse", "$.hook_event_name");
	const root = event.workspaceRoots[0];
	if (root === undefined) throw new AuggiePayloadError("expected at least one workspace root", "$.workspace_roots");
	const toolResponse = event.state.kind === "succeeded" ? { status: "success" } : { status: "error" };
	return {
		session_id: event.conversationId,
		turn_id: "",
		transcript_path: null,
		cwd: root,
		hook_event_name: "PostToolUse",
		model: process.env["ASTERLINE_RULES_MODEL"] ?? "gpt-5.5",
		permission_mode: "default",
		tool_name: event.tool,
		tool_input: { ...event.input, paths: event.affectedPaths },
		tool_response: toolResponse,
		tool_use_id: "",
	};
}
