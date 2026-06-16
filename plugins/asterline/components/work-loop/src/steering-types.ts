import type { WorkLoopSteeringMutationKind, WorkLoopSteeringSource } from "./constants.js";
import type { WorkLoopPlan } from "./domain-types.js";

export interface WorkLoopSteeringInvariantResult {
	accepted: boolean;
	structuralInvariantAccepted: boolean;
	evidenceBackedNecessity: boolean;
	noEasierCompletion: boolean;
	rejectedReasons: string[];
	reasons?: string[];
}

export interface WorkLoopSteeringChildGoal {
	title: string;
	objective: string;
}

export interface WorkLoopSteeringAfterPayload {
	title?: string;
	objective?: string;
	pendingGoalIds?: string[];
	children?: WorkLoopSteeringChildGoal[];
}

export interface WorkLoopSteeringProposal {
	kind: WorkLoopSteeringMutationKind;
	source: WorkLoopSteeringSource;
	targetGoalId?: string;
	targetGoalIds?: string[];
	criterionId?: string;
	evidence: string;
	rationale: string;
	title?: string;
	objective?: string;
	childGoals?: WorkLoopSteeringChildGoal[];
	revisedTitle?: string;
	revisedObjective?: string;
	pendingOrder?: string[];
	blockedReason?: string;
	after?: WorkLoopSteeringAfterPayload;
	directiveText?: string;
	promptSignature?: string;
	idempotencyKey?: string;
	now?: Date;
}

export interface WorkLoopSteeringAudit {
	kind: WorkLoopSteeringMutationKind;
	source: WorkLoopSteeringSource;
	targetGoalIds: string[];
	criterionId?: string;
	before?: unknown;
	after?: unknown;
	evidence: string;
	rationale: string;
	invariant: WorkLoopSteeringInvariantResult;
	directiveText?: string;
	promptSignature?: string;
	idempotencyKey?: string;
	deduped?: boolean;
}

export interface SteerWorkLoopResult {
	plan: WorkLoopPlan;
	accepted: boolean;
	audit: WorkLoopSteeringAudit;
	rejectedReasons: string[];
	deduped: boolean;
}
