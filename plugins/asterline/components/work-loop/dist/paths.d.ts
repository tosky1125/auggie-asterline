export interface WorkLoopScope {
    readonly sessionId?: string | null;
}
type EnvMap = Readonly<Record<string, string | undefined>>;
export declare function normalizeWorkLoopSessionId(sessionId: string | null | undefined): string | null;
export declare function resolveWorkLoopSessionIdFromEnv(env?: EnvMap): string | null;
export declare function workLoopRelativeDir(scope?: WorkLoopScope): string;
export declare function workLoopDir(repoRoot: string, scope?: WorkLoopScope): string;
export declare function workLoopBriefRelativePath(scope?: WorkLoopScope): string;
export declare function workLoopGoalsRelativePath(scope?: WorkLoopScope): string;
export declare function workLoopLedgerRelativePath(scope?: WorkLoopScope): string;
export declare function workLoopBriefPath(repoRoot: string, scope?: WorkLoopScope): string;
export declare function workLoopGoalsPath(repoRoot: string, scope?: WorkLoopScope): string;
export declare function workLoopLedgerPath(repoRoot: string, scope?: WorkLoopScope): string;
export declare function repoRelative(absolutePath: string, repoRoot: string): string;
export {};
