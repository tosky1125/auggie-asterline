import {
	AuggiePayloadError,
	isJsonObject,
	parseJsonEnvelope,
	type JsonObject,
	type JsonValue,
} from "./json-boundary.js"

export { AuggiePayloadError, type JsonObject, type JsonValue } from "./json-boundary.js"

const CANCELLATION = /\b(cancelled|canceled|interrupted)\b/i

export type ToolExecutionState =
	| { readonly kind: "pending" }
	| { readonly kind: "succeeded"; readonly exitCode?: number; readonly stdout?: string; readonly stderr?: string }
	| {
			readonly kind: "failed"
			readonly error?: JsonValue
			readonly exitCode?: number
			readonly stdout?: string
			readonly stderr?: string
	  }
	| { readonly kind: "cancelled"; readonly reason?: JsonValue }
	| { readonly kind: "unknown"; readonly facts: JsonValue }

type CommonEvent = {
	readonly phase: "pre" | "post"
	readonly conversationId: string
	readonly workspaceRoots: readonly string[]
	readonly isMcpTool: boolean
	readonly affectedPaths: readonly string[]
	readonly state: ToolExecutionState
	readonly raw: JsonObject
}
type CommonEventBase = Omit<CommonEvent, "affectedPaths">

export type NormalizedToolEvent =
	| (CommonEvent & {
			readonly tool: "launch-process"
			readonly input: {
				readonly command: string
				readonly cwd?: string
				readonly wait?: boolean
				readonly maxWaitSeconds?: number
			}
		  })
	| (CommonEvent & { readonly tool: "apply_patch"; readonly input: { readonly patch: string } })
	| (CommonEvent & {
			readonly tool: "str-replace-editor"
			readonly input: {
				readonly command: string
				readonly path: string
				readonly edits: readonly { readonly oldText?: string; readonly newText?: string }[]
			}
	  })
	| (CommonEvent & { readonly tool: "save-file"; readonly input: { readonly path: string; readonly content: string } })


function requiredString(record: JsonObject, key: string): string {
	const value = record[key]
	if (typeof value !== "string" || value.length === 0) {
		throw new AuggiePayloadError("expected a non-empty string", `$.${key}`)
	}
	return value
}

function requiredObject(record: JsonObject, key: string): JsonObject {
	const value = record[key]
	if (value === undefined || !isJsonObject(value)) throw new AuggiePayloadError("expected an object", `$.${key}`)
	return value
}

function stringArray(record: JsonObject, key: string): readonly string[] {
	const value = record[key]
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
		throw new AuggiePayloadError("expected an array of non-empty strings", `$.${key}`)
	}
	return value.filter((item): item is string => typeof item === "string")
}

function parseState(envelope: JsonObject, phase: "pre" | "post", tool: string): ToolExecutionState {
	if (phase === "pre") return { kind: "pending" }
	if (!Object.hasOwn(envelope, "tool_output") || !Object.hasOwn(envelope, "tool_error")) {
		throw new AuggiePayloadError("PostToolUse requires tool_output and tool_error")
	}
	const output = envelope["tool_output"]
	const error = envelope["tool_error"]
	if (error !== null) {
		if (typeof error === "string" && CANCELLATION.test(error)) return { kind: "cancelled", reason: error }
		return { kind: "failed", ...(error === undefined ? {} : { error }) }
	}
	if (tool === "launch-process" && typeof output === "string") return parseProcessState(output)
	if (isJsonObject(output) && typeof output["status"] === "string") {
		const status = output["status"]
		if (status === "success" || status === "succeeded" || status === "completed") return { kind: "succeeded" }
		if (status === "failed" || status === "error") return { kind: "failed", error: output }
		if (status === "cancelled" || status === "canceled" || status === "interrupted") {
			return { kind: "cancelled", reason: output }
		}
		return { kind: "unknown", facts: output }
	}
	if (typeof output === "string") return { kind: "succeeded" }
	return { kind: "unknown", facts: output === undefined ? null : output }
}

function parseProcessState(output: string): ToolExecutionState {
	const exitText = tagContent(output, "return-code")
	const stdout = tagContent(output, "output")
	const stderr = tagContent(output, "error")
	const exitCode = exitText === undefined ? undefined : Number(exitText)
	if (exitCode === undefined || !Number.isInteger(exitCode)) return { kind: "unknown", facts: output }
	const details = {
		exitCode,
		...(stdout === undefined ? {} : { stdout }),
		...(stderr === undefined ? {} : { stderr }),
	}
	return exitCode === 0 ? { kind: "succeeded", ...details } : { kind: "failed", ...details }
}

function tagContent(output: string, tag: string): string | undefined {
	const startToken = `<${tag}>`
	const endToken = `</${tag}>`
	const start = output.indexOf(startToken)
	const end = output.indexOf(endToken, start + startToken.length)
	if (start < 0 || end < 0) return undefined
	return output.slice(start + startToken.length, end).replace(/^\n|\n$/g, "")
}

function fileChangePaths(envelope: JsonObject): readonly string[] {
	const changes = envelope["file_changes"]
	if (changes === undefined) return []
	if (!Array.isArray(changes)) throw new AuggiePayloadError("expected an array", "$.file_changes")
	return changes.map((change, index) => {
		if (!isJsonObject(change)) throw new AuggiePayloadError("expected an object", `$.file_changes[${index}]`)
		return requiredString(change, "path")
	})
}

function patchPaths(patch: string): readonly string[] {
	const paths: string[] = []
	for (const line of patch.split("\n")) {
		const match = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line)
		const path = match?.[1]
		if (path !== undefined && path.length > 0) paths.push(path)
	}
	return paths
}

function parseEdits(input: JsonObject): readonly { readonly oldText?: string; readonly newText?: string }[] {
	const edits: { readonly oldText?: string; readonly newText?: string }[] = []
	const numbered = Object.keys(input)
		.filter((key) => /^(old_str|insert_line)_\d+$/.test(key))
		.map((key) => Number(key.slice(key.lastIndexOf("_") + 1)))
		.filter((value, index, values) => values.indexOf(value) === index)
		.sort((left, right) => left - right)
	if (Object.hasOwn(input, "old_str") || Object.hasOwn(input, "new_str")) {
		edits.push(editPair(input["old_str"], input["new_str"], "plain"))
	}
	for (const index of numbered) edits.push(editPair(input[`old_str_${index}`], input[`new_str_${index}`], String(index)))
	if (edits.length === 0) throw new AuggiePayloadError("expected edit text fields", "$.tool_input")
	return edits
}

function editPair(oldText: JsonValue | undefined, newText: JsonValue | undefined, suffix: string) {
	if (oldText !== undefined && typeof oldText !== "string") {
		throw new AuggiePayloadError("expected a string", `$.tool_input.old_str_${suffix}`)
	}
	if (newText !== undefined && typeof newText !== "string") {
		throw new AuggiePayloadError("expected a string", `$.tool_input.new_str_${suffix}`)
	}
	if (oldText === undefined && newText === undefined) {
		throw new AuggiePayloadError("missing edit text", `$.tool_input.${suffix}`)
	}
	return { ...(oldText === undefined ? {} : { oldText }), ...(newText === undefined ? {} : { newText }) }
}

export function normalizeAuggieToolEvent(raw: unknown): NormalizedToolEvent {
	const envelope = parseJsonEnvelope(raw)
	const eventName = requiredString(envelope, "hook_event_name")
	if (eventName !== "PreToolUse" && eventName !== "PostToolUse") {
		throw new AuggiePayloadError("unsupported hook event", "$.hook_event_name")
	}
	const phase = eventName === "PreToolUse" ? "pre" : "post"
	const tool = requiredString(envelope, "tool_name")
	const input = requiredObject(envelope, "tool_input")
	const isMcpTool = envelope["is_mcp_tool"]
	if (typeof isMcpTool !== "boolean") {
		throw new AuggiePayloadError("expected a boolean", "$.is_mcp_tool")
	}
	const common: CommonEventBase = {
		phase,
		conversationId: requiredString(envelope, "conversation_id"),
		workspaceRoots: stringArray(envelope, "workspace_roots"),
		isMcpTool,
		state: parseState(envelope, phase, tool),
		raw: envelope,
	}
	const changedPaths = fileChangePaths(envelope)
	switch (tool) {
		case "launch-process": {
			const cwdValue = input["cwd"]
			const waitValue = input["wait"]
			const maxWaitValue = input["max_wait_seconds"]
			if (cwdValue !== undefined && (typeof cwdValue !== "string" || cwdValue.length === 0)) {
				throw new AuggiePayloadError("expected a non-empty string", "$.tool_input.cwd")
			}
			if (waitValue !== undefined && typeof waitValue !== "boolean") {
				throw new AuggiePayloadError("expected a boolean", "$.tool_input.wait")
			}
			if (
				maxWaitValue !== undefined &&
				(typeof maxWaitValue !== "number" || !Number.isInteger(maxWaitValue) || maxWaitValue < 0)
			) {
				throw new AuggiePayloadError("expected a non-negative integer", "$.tool_input.max_wait_seconds")
			}
			return {
				...common,
				tool,
				input: {
					command: requiredString(input, "command"),
					...(cwdValue === undefined ? {} : { cwd: cwdValue }),
					...(waitValue === undefined ? {} : { wait: waitValue }),
					...(maxWaitValue === undefined ? {} : { maxWaitSeconds: maxWaitValue }),
				},
				affectedPaths: changedPaths,
			}
		}
		case "apply_patch": {
			const patch = requiredString(input, "input")
			return { ...common, tool, input: { patch }, affectedPaths: [...new Set([...patchPaths(patch), ...changedPaths])] }
		}
		case "str-replace-editor": {
			const path = requiredString(input, "path")
			return {
				...common,
				tool,
				input: { command: requiredString(input, "command"), path, edits: parseEdits(input) },
				affectedPaths: [...new Set([path, ...changedPaths])],
			}
		}
		case "save-file": {
			const path = requiredString(input, "path")
			const content = input["file_content"]
			if (typeof content !== "string") {
				throw new AuggiePayloadError("expected a string", "$.tool_input.file_content")
			}
			return {
				...common,
				tool,
				input: { path, content },
				affectedPaths: [...new Set([path, ...changedPaths])],
			}
		}
		default:
			throw new AuggiePayloadError("unsupported tool name", "$.tool_name")
	}
}

export function normalizeAuggieToolEventFailOpen(raw: unknown): NormalizedToolEvent | null {
	try {
		return normalizeAuggieToolEvent(raw)
	} catch (error) {
		if (error instanceof AuggiePayloadError) return null
		throw error
	}
}
