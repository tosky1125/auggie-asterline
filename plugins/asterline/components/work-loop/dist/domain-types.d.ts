import type { WorkLoopHostGoalMode, WorkLoopCriterionStatus, WorkLoopLedgerEventKind, WorkLoopStatus, WorkLoopSteeringMutationKind, WorkLoopSteeringStatus, WorkLoopSuccessCriterionUserModel } from "./constants.js";
import type { WorkLoopSteeringAudit } from "./steering-types.js";
export interface WorkLoopSuccessCriterion {
    readonly id: string;
    readonly scenario: string;
    readonly userModel: WorkLoopSuccessCriterionUserModel;
    readonly expectedEvidence: string;
    capturedEvidence: string | null;
    status: WorkLoopCriterionStatus;
    capturedAt?: string;
    notes?: string;
}
export interface WorkLoopItem {
    id: string;
    title: string;
    objective: string;
    status: WorkLoopStatus;
    successCriteria: WorkLoopSuccessCriterion[];
    attempt: number;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
    failedAt?: string;
    reviewBlockedAt?: string;
    evidence?: string;
    failureReason?: string;
    steeringStatus?: WorkLoopSteeringStatus;
    supersededBy?: string[];
    supersedes?: string[];
    blockedReason?: string;
    blockerSignature?: string;
    blockerOccurrenceCount?: number;
    requiredExternalDecision?: string;
    nonRetriable?: boolean;
    steeringEvidence?: string;
    steeringRationale?: string;
}
export interface WorkLoopAggregateCompletion {
    status: "complete";
    completedAt: string;
    evidence: string;
    hostGoal?: unknown;
}
export interface WorkLoopPlan {
    version: 1;
    createdAt: string;
    updatedAt: string;
    briefPath: string;
    goalsPath: string;
    ledgerPath: string;
    hostGoalMode?: WorkLoopHostGoalMode;
    asterlineObjective?: string;
    asterlineObjectiveAliases?: string[];
    aggregateCompletion?: WorkLoopAggregateCompletion;
    activeGoalId?: string;
    goals: WorkLoopItem[];
}
export interface WorkLoopQualityGate {
    aiSlopCleaner: {
        status: "passed";
        evidence: string;
    };
    verification: {
        status: "passed";
        commands: string[];
        evidence: string;
    };
    codeReview: {
        recommendation: "APPROVE";
        architectStatus: "CLEAR";
        evidence: string;
    };
}
export interface WorkLoopLedgerEntry {
    at: string;
    kind: WorkLoopLedgerEventKind;
    goalId?: string;
    criterionId?: string;
    status?: WorkLoopStatus;
    criterionStatus?: WorkLoopCriterionStatus;
    message?: string;
    hostGoal?: unknown;
    evidence?: string;
    capturedEvidence?: string;
    qualityGate?: WorkLoopQualityGate;
    steering?: WorkLoopSteeringAudit;
    before?: unknown;
    after?: unknown;
    mutationKind?: WorkLoopSteeringMutationKind;
    idempotencyKey?: string;
    blockerSignature?: string;
    blockerOccurrenceCount?: number;
    requiredExternalDecision?: string;
}
