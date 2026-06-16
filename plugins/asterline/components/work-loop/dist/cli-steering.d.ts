import type { SteerWorkLoopResult, WorkLoopSteeringMutationKind, WorkLoopSteeringProposal, WorkLoopSteeringSource, WorkLoopSuccessCriterionUserModel } from "./types.js";
export type CliSteeringProposal = WorkLoopSteeringProposal & {
    readonly goalId?: string;
    readonly scenario?: string;
    readonly expectedEvidence?: string;
    readonly userModel?: WorkLoopSuccessCriterionUserModel;
};
export declare function parseSteeringKind(argv: readonly string[]): WorkLoopSteeringMutationKind;
export declare function parseSteeringSource(argv: readonly string[]): WorkLoopSteeringSource;
export declare function parseSteeringProposal(argv: readonly string[]): Promise<CliSteeringProposal>;
export declare function normalizeSteeringProposal(proposal: CliSteeringProposal): CliSteeringProposal;
export declare function printSteerResult(result: SteerWorkLoopResult, json: boolean): void;
