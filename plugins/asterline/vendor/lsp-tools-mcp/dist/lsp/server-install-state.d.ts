export type InstallDecision = "declined" | "allowed";
export interface InstallDecisionRecord {
    readonly decision: InstallDecision;
    readonly decidedAt: string;
}
type InstallDecisions = Record<string, InstallDecisionRecord>;
export declare function getInstallDecisionsPath(): string;
export declare function loadInstallDecisions(): InstallDecisions;
export declare function loadInstallDecision(serverId: string): InstallDecisionRecord | undefined;
export declare function recordInstallDecision(serverId: string, decision: InstallDecision, decidedAt?: string): void;
export declare function isInstallDecision(value: unknown): value is InstallDecision;
export {};
