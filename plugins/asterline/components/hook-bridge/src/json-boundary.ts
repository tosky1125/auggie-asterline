const MAX_PAYLOAD_UNITS = 1_048_576
const MAX_NESTING_DEPTH = 64
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])

export type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[]
export type JsonObject = { readonly [key: string]: JsonValue }

export class AuggiePayloadError extends Error {
	readonly name = "AuggiePayloadError"

	constructor(message: string, readonly path = "$") {
		super(`${path}: ${message}`)
	}
}

type ParseBudget = { remaining: number }
type ParseFrame = { readonly path: string; readonly depth: number; readonly budget: ParseBudget }

function parseJsonValue(value: unknown, frame: ParseFrame): JsonValue {
	if (frame.depth > MAX_NESTING_DEPTH) throw new AuggiePayloadError("payload exceeds nesting limit", frame.path)
	frame.budget.remaining -= 1
	if (frame.budget.remaining < 0) throw new AuggiePayloadError("payload exceeds size limit", frame.path)
	if (value === null || typeof value === "boolean") return value
	if (typeof value === "string") {
		frame.budget.remaining -= value.length
		if (frame.budget.remaining < 0) throw new AuggiePayloadError("payload exceeds size limit", frame.path)
		return value
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new AuggiePayloadError("number must be finite", frame.path)
		return value
	}
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			parseJsonValue(item, { path: `${frame.path}[${index}]`, depth: frame.depth + 1, budget: frame.budget }),
		)
	}
	if (!isPlainRecord(value)) throw new AuggiePayloadError("expected a plain JSON object", frame.path)
	const parsed: Record<string, JsonValue> = {}
	for (const [key, item] of Object.entries(value)) {
		const path = `${frame.path}.${key}`
		if (DANGEROUS_KEYS.has(key)) throw new AuggiePayloadError("dangerous object key", path)
		frame.budget.remaining -= key.length
		parsed[key] = parseJsonValue(item, { path, depth: frame.depth + 1, budget: frame.budget })
	}
	return parsed
}

export function parseJsonEnvelope(raw: unknown): JsonObject {
	if (typeof raw === "string" && raw.length > MAX_PAYLOAD_UNITS) {
		throw new AuggiePayloadError("payload exceeds size limit")
	}
	let decoded: unknown = raw
	if (typeof raw === "string") {
		try {
			decoded = JSON.parse(raw)
		} catch (error) {
			if (error instanceof SyntaxError) throw new AuggiePayloadError("invalid JSON")
			throw error
		}
	}
	const value = parseJsonValue(decoded, { path: "$", depth: 0, budget: { remaining: MAX_PAYLOAD_UNITS } })
	if (!isJsonObject(value)) throw new AuggiePayloadError("expected an object envelope")
	return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
