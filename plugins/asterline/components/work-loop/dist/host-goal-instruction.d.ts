import type { WorkLoopItem, WorkLoopPlan } from "./types.js";
export interface AsterlineCreateGoalPayload {
    readonly objective: string;
}
export interface WorkLoopGoalInstruction {
    readonly text: string;
    readonly json: AsterlineCreateGoalPayload;
}
export declare function buildHostGoalInstruction(args: {
    readonly plan: WorkLoopPlan;
    readonly goal: WorkLoopItem;
    readonly isFinal?: boolean;
}): WorkLoopGoalInstruction;
