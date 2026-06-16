import { type WorkLoopScope } from "./paths.js";
import type { WorkLoopLedgerEntry, WorkLoopPlan } from "./types.js";
export declare function withWorkLoopMutationLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>;
export declare function withWorkLoopMutationLock<T>(repoRoot: string, scope: WorkLoopScope | undefined, fn: () => Promise<T>): Promise<T>;
export declare function readWorkLoopPlan(repoRoot: string, scope?: WorkLoopScope): Promise<WorkLoopPlan>;
export declare function writePlan(repoRoot: string, plan: WorkLoopPlan, scope?: WorkLoopScope): Promise<void>;
export declare function appendLedger(repoRoot: string, entry: WorkLoopLedgerEntry, scope?: WorkLoopScope): Promise<void>;
export declare function readSteeringLedgerEntries(repoRoot: string, scope?: WorkLoopScope): Promise<WorkLoopLedgerEntry[]>;
