import type { WorkLoopScope } from "./paths.js";
import type { SteerWorkLoopResult, WorkLoopPlan, WorkLoopSteeringAudit, WorkLoopSteeringProposal } from "./types.js";
export declare function validateWorkLoopSteeringProposal(plan: WorkLoopPlan, proposal: unknown): WorkLoopSteeringAudit;
export declare function applySteeringMutation(plan: WorkLoopPlan, proposal: WorkLoopSteeringProposal, audit: WorkLoopSteeringAudit): WorkLoopPlan;
export declare function parseWorkLoopSteeringDirective(text: string): WorkLoopSteeringProposal | null;
export declare function steerWorkLoop(repoRoot: string, proposal: WorkLoopSteeringProposal, scope?: WorkLoopScope): Promise<SteerWorkLoopResult>;
