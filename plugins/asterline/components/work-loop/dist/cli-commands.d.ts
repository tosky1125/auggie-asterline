export declare const WORK_LOOP_SUBCOMMANDS: readonly ["help", "create-goals", "status", "complete-goals", "checkpoint", "steer", "add-goal", "criteria", "record-evidence", "record-review-blockers"];
export type WorkLoopSubcommand = (typeof WORK_LOOP_SUBCOMMANDS)[number];
export declare function isWorkLoopSubcommand(value: string): value is WorkLoopSubcommand;
export declare function workLoopCommand(argv: readonly string[]): Promise<number>;
