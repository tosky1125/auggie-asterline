import { describe, expect, it } from "bun:test"

import {
	AuggiePayloadError,
	normalizeAuggieToolEvent,
	normalizeAuggieToolEventFailOpen,
} from "../src/auggie-payload.js"

const common = {
	conversation_id: "conversation-1",
	workspace_roots: ["/workspace"],
	is_mcp_tool: false,
}

function nestedObject(depth: number): unknown {
	let value: unknown = null
	for (let index = 0; index < depth; index += 1) value = { next: value }
	return value
}

function nestedArray(depth: number): unknown {
	let value: unknown = null
	for (let index = 0; index < depth; index += 1) value = [value]
	return value
}

function preToolPayload(toolInput: unknown) {
	return {
		...common,
		hook_event_name: "PreToolUse",
		tool_name: "save-file",
		tool_input: { path: "nested.txt", file_content: "", deep: toolInput },
	}
}

describe("normalizeAuggieToolEvent", () => {
	it("#given Auggie 0.32 launch-process output #when normalized #then exposes command stdout and exit code", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "launch-process",
			tool_input: { command: "node --version", cwd: "/workspace", wait: true, max_wait_seconds: 5 },
			tool_output:
				"Here are the results from executing the command.\n<return-code>\n0\n</return-code>\n<output>\nv24.16.0\n</output>",
			tool_error: null,
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.tool).toBe("launch-process")
		expect(event.input).toEqual({ command: "node --version", cwd: "/workspace", wait: true, maxWaitSeconds: 5 })
		expect(event.state).toEqual({ kind: "succeeded", exitCode: 0, stdout: "v24.16.0" })
	})

	it("#given Auggie apply_patch PreToolUse input #when normalized #then remains pending with patch paths", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PreToolUse",
			tool_name: "apply_patch",
			tool_input: { input: "*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch" },
			tool_error: null,
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.tool).toBe("apply_patch")
		expect(event.state).toEqual({ kind: "pending" })
		expect(event.affectedPaths).toEqual(["src/app.ts"])
	})

	it("#given exact str-replace-editor fields #when normalized #then preserves ordered old and new text", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "str-replace-editor",
			tool_input: {
				command: "str_replace",
				path: "src/app.ts",
				old_str_1: "const old = 1",
				new_str_1: "const next = 1",
				old_str_2: "old()",
				new_str_2: "next()",
			},
			tool_output: "Successfully edited the file src/app.ts.",
			tool_error: null,
		}

		// when
		const event = normalizeAuggieToolEvent(JSON.stringify(payload))

		// then
		expect(event.tool).toBe("str-replace-editor")
		expect(event.input).toEqual({
			command: "str_replace",
			path: "src/app.ts",
			edits: [
				{ oldText: "const old = 1", newText: "const next = 1" },
				{ oldText: "old()", newText: "next()" },
			],
		})
	})

	it("#given exact save-file failure #when normalized #then reports failure without content loss", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "save-file",
			tool_input: { path: "src/new.ts", file_content: "" },
			tool_output: "",
			tool_error: "Permission denied",
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.input).toEqual({ path: "src/new.ts", content: "" })
		expect(event.state).toEqual({ kind: "failed", error: "Permission denied" })
	})

	it("#given cancelled execution #when normalized #then distinguishes cancellation from failure", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "launch-process",
			tool_input: { command: "sleep 10" },
			tool_output: "",
			tool_error: "Tool execution cancelled by user",
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.state).toEqual({ kind: "cancelled", reason: "Tool execution cancelled by user" })
	})

	it("#given failed process return code #when normalized #then keeps stdout stderr and nonzero exit", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "launch-process",
			tool_input: { command: "false" },
			tool_output: "<return-code>\n7\n</return-code>\n<output>\nout\n</output>\n<error>\nerr\n</error>",
			tool_error: null,
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.state).toEqual({ kind: "failed", exitCode: 7, stdout: "out", stderr: "err" })
	})

	it("#given Auggie file_changes array #when normalized #then merges paths without duplicates", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "save-file",
			tool_input: { path: "src/a.ts", file_content: "a" },
			tool_output: "saved",
			tool_error: null,
			file_changes: [
				{ path: "src/a.ts", changeType: "create", content: "a" },
				{ path: "src/b.ts", changeType: "edit", oldContent: "b", content: "c" },
			],
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.workspaceRoots).toEqual(["/workspace"])
		expect(event.affectedPaths).toEqual(["src/a.ts", "src/b.ts"])
	})

	it("#given unknown structured status #when normalized #then preserves facts without claiming success", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PostToolUse",
			tool_name: "save-file",
			tool_input: { path: "src/a.ts", file_content: "a" },
			tool_output: { status: "deferred", ticket: 42 },
			tool_error: null,
		}

		// when
		const event = normalizeAuggieToolEvent(payload)

		// then
		expect(event.state).toEqual({ kind: "unknown", facts: { status: "deferred", ticket: 42 } })
	})

	it("#given malformed missing fields or tool aliases #when normalized #then raises typed errors", () => {
		// given
		const missingInput = { ...common, hook_event_name: "PostToolUse", tool_name: "save-file" }
		const alias = { ...common, hook_event_name: "PreToolUse", tool_name: "Save-File", tool_input: {} }

		// when

		// then
		expect(() => normalizeAuggieToolEvent(missingInput)).toThrow(AuggiePayloadError)
		expect(() => normalizeAuggieToolEvent(alias)).toThrow(AuggiePayloadError)
	})

	it("#given prototype-bearing or oversized payload #when normalized #then rejects the boundary", () => {
		// given
		const malicious = {
			...common,
			hook_event_name: "PreToolUse",
			tool_name: "save-file",
			tool_input: { __proto__: { polluted: true } },
		}
		const oversized = "x".repeat(1_048_577)

		// when

		// then
		expect(() => normalizeAuggieToolEvent(malicious)).toThrow(AuggiePayloadError)
		expect(() => normalizeAuggieToolEvent(oversized)).toThrow(AuggiePayloadError)
	})

	it("#given a deeply nested object #when strictly normalized #then rejects with a typed boundary error", () => {
		// given
		const payload = preToolPayload(nestedObject(100))

		// when

		// then
		expect(() => normalizeAuggieToolEvent(payload)).toThrow(AuggiePayloadError)
	})

	it("#given a deeply nested array #when strictly normalized #then rejects with a typed boundary error", () => {
		// given
		const payload = preToolPayload(nestedArray(100))

		// when

		// then
		expect(() => normalizeAuggieToolEvent(payload)).toThrow(AuggiePayloadError)
	})

	it("#given a deeply nested object #when explicit fail-open normalization runs #then returns null", () => {
		// given
		const payload = preToolPayload(nestedObject(100))

		// when
		const event = normalizeAuggieToolEventFailOpen(payload)

		// then
		expect(event).toBeNull()
	})

	it("#given a deeply nested array #when explicit fail-open normalization runs #then returns null", () => {
		// given
		const payload = preToolPayload(nestedArray(100))

		// when
		const event = normalizeAuggieToolEventFailOpen(payload)

		// then
		expect(event).toBeNull()
	})

	it("#given malformed JSON #when explicit fail-open helper runs #then returns null", () => {
		// given
		const raw = "{broken"

		// when
		const event = normalizeAuggieToolEventFailOpen(raw)

		// then
		expect(event).toBeNull()
	})

	it("#given a normalized event #when JSON roundtripped #then contract remains lossless", () => {
		// given
		const payload = {
			...common,
			hook_event_name: "PreToolUse",
			tool_name: "save-file",
			tool_input: { path: "src/new.ts", file_content: "hello" },
		}

		// when
		const event = normalizeAuggieToolEvent(payload)
		const roundtrip = JSON.parse(JSON.stringify(event))

		// then
		expect(roundtrip).toEqual(event)
	})
})
