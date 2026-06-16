import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type HostGoalSnapshotStatus = "active" | "complete" | "cancelled" | "failed" | "unknown";

export interface HostGoalSnapshot {
	available: boolean;
	objective?: string;
	status?: HostGoalSnapshotStatus;
	raw: unknown;
}

export interface HostGoalReconciliation {
	ok: boolean;
	snapshot: HostGoalSnapshot;
	warnings: string[];
	errors: string[];
}

export interface ReconcileHostGoalOptions {
	expectedObjective: string;
	acceptedObjectives?: readonly string[];
	allowedStatuses?: readonly HostGoalSnapshotStatus[];
	requireSnapshot?: boolean;
	requireComplete?: boolean;
}

export class HostGoalSnapshotError extends Error {}
function safeObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): HostGoalSnapshotStatus {
	const status = safeString(value).toLowerCase();
	if (status === "complete" || status === "completed" || status === "done") return "complete";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "failed" || status === "failure") return "failed";
	if (status === "active" || status === "in_progress" || status === "pending" || status === "running") return "active";
	return "unknown";
}

function normalizeObjective(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function parseHostGoalSnapshot(value: unknown): HostGoalSnapshot {
	const root = safeObject(value);
	const goalValue = Object.hasOwn(root, "goal") ? root["goal"] : value;
	if (goalValue === null || goalValue === undefined || goalValue === false) {
		return { available: false, raw: value };
	}

	const goal = safeObject(goalValue);
	const objective = safeString(goal["objective"] ?? goal["goal"] ?? goal["description"] ?? root["objective"]);
	const status = normalizeStatus(goal["status"] ?? root["status"]);

	return {
		available: Boolean(objective || status !== "unknown"),
		...(objective ? { objective } : {}),
		status,
		raw: value,
	};
}

export async function readHostGoalSnapshotInput(
	raw: string | undefined,
	cwd = process.cwd(),
): Promise<HostGoalSnapshot | null> {
	if (!raw?.trim()) return null;
	const trimmed = raw.trim();
	try {
		return parseHostGoalSnapshot(JSON.parse(trimmed));
	} catch {
		const path = resolve(cwd, trimmed);
		if (!existsSync(path)) {
			throw new HostGoalSnapshotError(`host goal snapshot is neither valid JSON nor a readable path: ${trimmed}`);
		}
		try {
			return parseHostGoalSnapshot(JSON.parse(await readFile(path, "utf-8")));
		} catch (error) {
			throw new HostGoalSnapshotError(
				`host goal snapshot path does not contain valid JSON: ${trimmed}${error instanceof Error ? ` (${error.message})` : ""}`,
			);
		}
	}
}

export function reconcileHostGoalSnapshot(
	snapshot: HostGoalSnapshot | null | undefined,
	options: ReconcileHostGoalOptions,
): HostGoalReconciliation {
	const effectiveSnapshot = snapshot ?? { available: false, raw: null };
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!effectiveSnapshot.available) {
		const message =
			"host goal snapshot is absent or reports no active goal; call get_goal and pass its JSON with --host-goal-json.";
		if (options.requireSnapshot) errors.push(message);
		else warnings.push(message);
		return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
	}

	const expected = normalizeObjective(options.expectedObjective);
	const accepted = new Set(
		[expected, ...(options.acceptedObjectives ?? []).map((objective) => normalizeObjective(objective))].filter(
			Boolean,
		),
	);
	const actual = normalizeObjective(effectiveSnapshot.objective ?? "");
	if (!actual) {
		errors.push("host goal snapshot is missing objective text.");
	} else if (!accepted.has(actual)) {
		errors.push(`host goal objective mismatch: expected "${expected}", got "${actual}".`);
	}

	const allowed = options.allowedStatuses ?? (options.requireComplete ? ["complete"] : ["active", "complete"]);
	const actualStatus = effectiveSnapshot.status ?? "unknown";
	if (!allowed.includes(actualStatus)) {
		errors.push(`host goal status mismatch: expected ${allowed.join(" or ")}, got ${actualStatus}.`);
	}
	if (options.requireComplete && actualStatus !== "complete") {
		errors.push(
			'host goal is not complete; call update_goal({status: "complete"}) only after the objective is actually complete, then pass the fresh get_goal JSON.',
		);
	}

	return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
}

export function formatHostGoalReconciliation(reconciliation: HostGoalReconciliation): string {
	const parts = [...reconciliation.errors, ...reconciliation.warnings];
	return parts.join(" ");
}
