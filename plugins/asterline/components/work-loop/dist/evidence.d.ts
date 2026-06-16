import type { WorkLoopScope } from "./paths.js";
import type { WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan, WorkLoopSuccessCriterion } from "./types.js";
type EvidenceStatus = "pass" | "fail" | "blocked";
type RecordEvidenceArgs = {
    readonly goalId: string;
    readonly criterionId: string;
    readonly status: EvidenceStatus;
    readonly evidence: string;
    readonly notes?: string;
};
export declare function recordEvidence(repoRoot: string, args: RecordEvidenceArgs, scope?: WorkLoopScope): Promise<{
    plan: WorkLoopPlan;
    goal: WorkLoopItem;
    criterion: WorkLoopSuccessCriterion;
    ledgerEntry: WorkLoopLedgerEntry;
}>;
export declare function markCriteriaPendingResetForGoal(repoRoot: string, goalId: string, scope?: WorkLoopScope): Promise<{
    plan: WorkLoopPlan;
    resetCount: number;
}>;
export declare function criteriaSummary(plan: WorkLoopPlan): {
    totalCriteria: number;
    passCount: number;
    pendingCount: number;
    failCount: number;
    blockedCount: number;
    goalsWithUnresolvedCriteria: string[];
};
export declare function unresolvedCriteriaOf(goal: WorkLoopItem): WorkLoopSuccessCriterion[];
export declare function requireAllCriteriaPass(goal: WorkLoopItem): void;
export {};
