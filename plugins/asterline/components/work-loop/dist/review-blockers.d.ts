import type { WorkLoopScope } from "./paths.js";
import type { WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan } from "./types.js";
export interface RecordFinalReviewBlockersArgs {
    readonly goalId: string;
    readonly title: string;
    readonly objective: string;
    readonly evidence: string;
    readonly hostGoalJson: string;
}
export interface RecordFinalReviewBlockersResult {
    readonly plan: WorkLoopPlan;
    readonly blockedGoal: WorkLoopItem;
    readonly newGoal: WorkLoopItem;
    readonly ledgerEntries: WorkLoopLedgerEntry[];
}
export declare function recordFinalReviewBlockers(repoRoot: string, args: RecordFinalReviewBlockersArgs, scope?: WorkLoopScope): Promise<RecordFinalReviewBlockersResult>;
