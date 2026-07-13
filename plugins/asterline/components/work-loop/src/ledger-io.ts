import { createReadStream } from "node:fs";
import { appendFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import { ensureWorkLoopDir, type WorkLoopScope, workLoopLedgerPath } from "./paths.js";
import type { WorkLoopLedgerEntry } from "./types.js";

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function isSteeringKind(value: unknown): value is WorkLoopLedgerEntry["kind"] {
	return value === "steering_accepted" || value === "steering_rejected" || value === "criteria_revised";
}

export async function appendLedger(repoRoot: string, entry: WorkLoopLedgerEntry, scope?: WorkLoopScope): Promise<void> {
	await ensureWorkLoopDir(repoRoot, scope);
	await appendFile(workLoopLedgerPath(repoRoot, scope), `${JSON.stringify(entry)}\n`, "utf8");
}

async function* ledgerLines(repoRoot: string, scope?: WorkLoopScope): AsyncGenerator<string> {
	const stream = createReadStream(workLoopLedgerPath(repoRoot, scope), { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
	try {
		for await (const line of lines) if (line.trim().length > 0) yield line;
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
	} finally {
		lines.close();
		stream.destroy();
	}
}

function parseLedgerEntry(line: string): WorkLoopLedgerEntry {
	const value: unknown = JSON.parse(line);
	if (isLedgerEntry(value)) return value;
	throw new TypeError("Invalid work-loop ledger entry.");
}

function isLedgerEntry(value: unknown): value is WorkLoopLedgerEntry {
	return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value && "at" in value;
}

export async function readSteeringLedgerEntries(repoRoot: string, scope?: WorkLoopScope): Promise<WorkLoopLedgerEntry[]> {
	const entries: WorkLoopLedgerEntry[] = [];
	for await (const line of ledgerLines(repoRoot, scope)) {
		const entry = parseLedgerEntry(line);
		if (isSteeringKind(entry.kind)) entries.push(entry);
	}
	return entries;
}

export async function findAcceptedSteeringLedgerEntry(
	repoRoot: string,
	key: string,
	scope?: WorkLoopScope,
): Promise<WorkLoopLedgerEntry | undefined> {
	const probe = JSON.stringify(key);
	for await (const line of ledgerLines(repoRoot, scope)) {
		if (!line.includes(probe)) continue;
		const entry = parseLedgerEntry(line);
		if (!isSteeringKind(entry.kind) || entry.steering?.invariant.accepted !== true) continue;
		if (entry.idempotencyKey === key || entry.steering.idempotencyKey === key || entry.steering.promptSignature === key) return entry;
	}
	return undefined;
}
