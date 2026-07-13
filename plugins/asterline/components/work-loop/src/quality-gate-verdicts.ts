import { invalid, section, textField } from "./quality-gate-fields.js";

export function passedVerdict(value: unknown, field: string): "passed" {
	return value === "passed" ? "passed" : invalid(`${field} must be passed.`, field);
}

export function codeQualityStatusField(value: unknown, field: string): "CLEAR" | "WATCH" {
	return value === "CLEAR" || value === "WATCH" ? value : invalid(`${field} must be CLEAR or WATCH.`, field);
}

export function adversarialVerdict(value: unknown, field: string): { verdict: "passed" | "not_applicable"; reason?: string } {
	const row = section(value, field);
	if (row["verdict"] === "passed") return { verdict: "passed" };
	if (row["verdict"] === "not_applicable") return { verdict: "not_applicable", reason: textField(row["reason"], `${field}.reason`) };
	return invalid(`${field}.verdict must be passed or not_applicable.`, `${field}.verdict`);
}
