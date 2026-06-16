import { type WorkLoopScope } from "./paths.js";
import type { WorkLoopHostGoalMode, WorkLoopItem, WorkLoopPlan, WorkLoopSuccessCriterion } from "./types.js";
export type WorkLoopPlanSummary = {
    readonly total: number;
    readonly pending: number;
    readonly in_progress: number;
    readonly complete: number;
    readonly failed: number;
    readonly blocked: number;
    readonly review_blocked: number;
    readonly needs_user_decision: number;
    readonly superseded: number;
    readonly criteria: {
        readonly total: number;
        readonly pass: number;
        readonly pending: number;
        readonly fail: number;
        readonly blocked: number;
    };
};
export declare function seedDefaultSuccessCriteria(goalIndex: number, objective: string): WorkLoopSuccessCriterion[];
export declare function deriveGoalCandidates(brief: string): Array<{
    title: string;
    objective: string;
}>;
export declare function createWorkLoopPlan(repoRoot: string, args: {
    brief: string;
    hostGoalMode?: WorkLoopHostGoalMode;
    force?: boolean;
}, scope?: WorkLoopScope): Promise<WorkLoopPlan>;
export declare function addWorkLoopGoal(repoRoot: string, args: {
    title: string;
    objective: string;
}, scope?: WorkLoopScope): Promise<{
    plan: WorkLoopPlan;
    goal: WorkLoopItem;
}>;
export declare function startNextWorkLoop(repoRoot: string, args?: {
    retryFailed?: boolean;
}, scope?: WorkLoopScope): Promise<{
    plan: WorkLoopPlan;
    goal: WorkLoopItem;
    resumed: boolean;
} | {
    done: true;
    plan: WorkLoopPlan;
}>;
export declare function summarizeWorkLoopPlan(plan: WorkLoopPlan): WorkLoopPlanSummary;
