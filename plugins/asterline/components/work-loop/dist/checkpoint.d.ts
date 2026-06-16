import { type WorkLoopScope } from "./paths.js";
import type { WorkLoopAggregateCompletion, WorkLoopItem, WorkLoopLedgerEntry, WorkLoopPlan } from "./types.js";
export interface CheckpointWorkLoopArgs {
    readonly goalId: string;
    readonly status: "complete" | "failed" | "blocked";
    readonly evidence: string;
    readonly hostGoalJson?: string;
    readonly qualityGateJson?: string;
}
export interface CheckpointWorkLoopResult {
    readonly plan: WorkLoopPlan;
    readonly goal: WorkLoopItem;
    readonly ledgerEntry: WorkLoopLedgerEntry;
    readonly aggregateCompletion?: WorkLoopAggregateCompletion;
}
export declare function checkpointWorkLoop(repoRoot: string, args: CheckpointWorkLoopArgs, scope?: WorkLoopScope): Promise<CheckpointWorkLoopResult>;
