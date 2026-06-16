export interface RequestContext {
    cwd?: string;
    env?: Record<string, string>;
}
export declare function runWithRequestContext<T>(context: RequestContext, fn: () => T): T;
export declare function contextCwd(): string;
export declare function contextEnv(key: string): string | undefined;
