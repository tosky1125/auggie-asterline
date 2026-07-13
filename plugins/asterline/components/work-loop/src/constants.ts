export const WORK_LOOP_DIR = ".asterline/work-loop";
export const WORK_LOOP_BRIEF = "brief.md";
export const WORK_LOOP_GOALS = "goals.json";
export const WORK_LOOP_LEDGER = "ledger.jsonl";
export const INSTALLED_WORK_LOOP_COMMAND = 'node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop';

export type WorkLoopStatus =
	| "pending"
	| "in_progress"
	| "complete"
	| "failed"
	| "blocked"
	| "review_blocked"
	| "needs_user_decision";

export type WorkLoopHostGoalMode = "aggregate" | "per_story";

export type WorkLoopSteeringStatus = "superseded" | "blocked";

export const WORK_LOOP_STEERING_MUTATION_KINDS = [
	"add_subgoal",
	"split_subgoal",
	"reorder_pending",
	"revise_pending_wording",
	"revise_criterion",
	"annotate_ledger",
	"mark_blocked_superseded",
] as const satisfies readonly string[];
export type WorkLoopSteeringMutationKind = (typeof WORK_LOOP_STEERING_MUTATION_KINDS)[number];

export type WorkLoopSteeringSource = "user_prompt_submit" | "finding" | "cli";

export const WORK_LOOP_SUCCESS_CRITERION_USER_MODELS = [
	"happy",
	"edge",
	"regression",
	"adversarial",
] as const satisfies readonly string[];
export type WorkLoopSuccessCriterionUserModel = (typeof WORK_LOOP_SUCCESS_CRITERION_USER_MODELS)[number];

export const WORK_LOOP_CRITERION_STATUSES = ["pending", "pass", "fail", "blocked"] as const satisfies readonly string[];
export type WorkLoopCriterionStatus = (typeof WORK_LOOP_CRITERION_STATUSES)[number];

export const WORK_LOOP_LEDGER_EVENT_KINDS = [
	"plan_created",
	"goal_started",
	"goal_resumed",
	"goal_completed",
	"goal_blocked",
	"goal_failed",
	"goal_needs_user_decision",
	"goal_retried",
	"aggregate_completed",
	"aggregate_objective_migrated",
	"goal_added",
	"steering_accepted",
	"steering_rejected",
	"final_review_failed",
	"goal_review_blocked",
	"evidence_captured",
	"criterion_failed",
	"criterion_blocked",
	"criteria_revised",
] as const satisfies readonly string[];
export type WorkLoopLedgerEventKind = (typeof WORK_LOOP_LEDGER_EVENT_KINDS)[number];
