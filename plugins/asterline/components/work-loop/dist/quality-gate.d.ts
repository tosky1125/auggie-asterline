import type { WorkLoopItem, WorkLoopPlan, WorkLoopQualityGate } from "./types.js";
export declare function validateQualityGate(input: unknown): WorkLoopQualityGate;
export declare function normalizeBlockerEvidence(evidence: string): string;
export declare function classifyExternalAuthorizationBlocker(evidence: string): string | null;
export declare function sameBlockerOccurrences(plan: WorkLoopPlan, signature: string): number;
export declare function clearGoalBlockerFields(goal: WorkLoopItem): void;
