import type { WorkLoopItem, WorkLoopPlan } from "./types.js";
import { isRecord } from "./quality-gate-fields.js";

const BLOCKER_FIELD_KEYS = "blocker blockerSignature blockerEvidence blockerOccurrences blockedAt".split(" ");
const URL_PATTERN = /https?:\/\/\S+/g;
const PUNCTUATION_PATTERN = /[`"'()[\]{}:,;]/g;
const WHITESPACE_PATTERN = /\s+/g;
const AUTH_PATTERN = /\b(auth\w*|credential\w*|token|permission\w*|scope\w*|access|unauthorized|forbidden|401|403)\b/;
const MISSING_PATTERN = /\b(unset|missing|required|requires|without|omit\w*|not set|not available|no read packages|read packages)\b/;
const GHCR_PATTERN = /\b(ghcr|github container registry|read packages|imagepullsecret|package api|anonymous|container image)\b/;
const GHCR_401_PATTERN = /\b(401|unauthorized|anonymous pull|authentication required)\b/;
const GHCR_403_PATTERN = /\b(403|forbidden|read packages|package api)\b/;

export function normalizeBlockerEvidence(evidence: string): string {
	return evidence.toLowerCase().replace(URL_PATTERN, " ").replace(PUNCTUATION_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim();
}

export function classifyExternalAuthorizationBlocker(evidence: string): string | null {
	const normalized = normalizeBlockerEvidence(evidence);
	if (!normalized || !AUTH_PATTERN.test(normalized) || !MISSING_PATTERN.test(normalized)) return null;
	if (!GHCR_PATTERN.test(normalized)) return "EXTERNAL_AUTHORIZATION_REQUIRED";
	const parts = [GHCR_401_PATTERN.test(normalized) ? "HTTP_401_ANONYMOUS" : null, GHCR_403_PATTERN.test(normalized) ? "HTTP_403_NO_READ_PACKAGES" : null].filter((part): part is string => part !== null);
	return `GHCR_PULL_ACCESS:${parts.join("+") || "AUTHORIZATION_REQUIRED"}:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED`;
}

function nestedBlockerSignature(goal: WorkLoopItem): string | null {
	const blocker = Reflect.get(goal, "blocker");
	const signature = isRecord(blocker) ? blocker["signature"] : null;
	return typeof signature === "string" ? signature : null;
}

export function sameBlockerOccurrences(plan: WorkLoopPlan, signature: string): number {
	return plan.goals.filter((goal) => goal.blockerSignature === signature || nestedBlockerSignature(goal) === signature).length;
}

export function clearGoalBlockerFields(goal: WorkLoopItem): void {
	for (const key of BLOCKER_FIELD_KEYS) Reflect.deleteProperty(goal, key);
}
