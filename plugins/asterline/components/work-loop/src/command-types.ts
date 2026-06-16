import type { WorkLoopHostGoalMode, WorkLoopStatus } from "./constants.js";

export interface CreateWorkLoopOptions {
	brief: string;
	goals?: readonly { readonly title?: string; readonly objective: string }[];
	hostGoalMode?: WorkLoopHostGoalMode;
	now?: Date;
	force?: boolean;
}

export interface StartNextOptions {
	now?: Date;
	retryFailed?: boolean;
}

export interface CheckpointOptions {
	goalId: string;
	status: Extract<WorkLoopStatus, "complete" | "failed"> | "blocked";
	evidence?: string;
	hostGoal?: unknown;
	qualityGate?: unknown;
	allowActiveFinalHostGoal?: boolean;
	now?: Date;
}

export interface AddWorkLoopGoalOptions {
	title: string;
	objective: string;
	evidence?: string;
	now?: Date;
}

export interface RecordFinalReviewBlockersOptions extends AddWorkLoopGoalOptions {
	goalId: string;
	hostGoal?: unknown;
}
