import type {
	WorkLoopHostGoalMode,
	WorkLoopCriterionStatus,
	WorkLoopLedgerEventKind,
	WorkLoopStatus,
	WorkLoopSteeringMutationKind,
	WorkLoopSteeringStatus,
	WorkLoopSuccessCriterionUserModel,
} from "./constants.js";
import type { WorkLoopSteeringAudit } from "./steering-types.js";

export interface WorkLoopSuccessCriterion {
	readonly id: string;
	readonly scenario: string;
	readonly userModel: WorkLoopSuccessCriterionUserModel;
	readonly expectedEvidence: string;
	readonly essential?: boolean;
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
	evidenceLayoutVersion?: 2;
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

export type WorkLoopManualQaSurface = "cli" | "http" | "tmux" | "browser" | "gui" | "data";
export type WorkLoopManualQaArtifactKind = "cli-transcript" | "log" | "screenshot" | "image" | "http-dump" | "data-diff";

export interface WorkLoopManualQaArtifactRef {
	readonly id: string;
	readonly kind: WorkLoopManualQaArtifactKind;
	readonly description: string;
	readonly path: string;
}

export interface WorkLoopManualQaSurfaceEvidence {
	readonly id: string;
	readonly criterionRef: string;
	readonly surface: WorkLoopManualQaSurface;
	readonly invocation: string;
	readonly verdict: "passed";
	readonly artifactRefs: readonly string[];
}

export interface WorkLoopManualQaAdversarialCase {
	readonly id: string;
	readonly criterionRef: string;
	readonly scenario: string;
	readonly expectedBehavior: string;
	readonly verdict: "passed" | "not_applicable";
	readonly reason?: string;
	readonly artifactRefs: readonly string[];
}

export interface WorkLoopQualityGate {
	readonly codeReview: { readonly by: string; readonly recommendation: "APPROVE"; readonly codeQualityStatus: "CLEAR" | "WATCH"; readonly reportPath: string; readonly evidence: string; readonly blockers: readonly [] };
	readonly manualQa: { readonly by: string; readonly status: "passed"; readonly evidence: string; readonly surfaceEvidence: readonly WorkLoopManualQaSurfaceEvidence[]; readonly adversarialCases: readonly WorkLoopManualQaAdversarialCase[]; readonly artifactRefs: readonly WorkLoopManualQaArtifactRef[] };
	readonly gateReview: { readonly by: string; readonly recommendation: "APPROVE"; readonly reportPath: string; readonly evidence: string; readonly blockers: readonly [] };
	readonly iteration: { readonly fullRerun: true; readonly status: "passed"; readonly rerunCommands: readonly string[]; readonly evidence: string };
	readonly criteriaCoverage: { readonly totalCriteria: number; readonly passCount: number; readonly originalIntent: string; readonly desiredOutcome: string; readonly userOutcomeReview: string; readonly adversarialClassesCovered: readonly string[] };
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
	qualityGate?: unknown;
	steering?: WorkLoopSteeringAudit;
	before?: unknown;
	after?: unknown;
	mutationKind?: WorkLoopSteeringMutationKind;
	idempotencyKey?: string;
	blockerSignature?: string;
	blockerOccurrenceCount?: number;
	requiredExternalDecision?: string;
}
