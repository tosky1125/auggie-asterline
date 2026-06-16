type RuntimeEnv = Readonly<Record<string, string | undefined>>;
interface OmoResolutionDeps {
    readonly fileExists?: (path: string) => boolean;
    readonly platform?: NodeJS.Platform;
}
export declare const SPARKSHELL_AWARENESS_DEDUP_KEY = "__omo_sparkshell_awareness__";
export declare function isAsterlineAppServerActive(env?: RuntimeEnv): boolean;
export declare function resolveOmoInvocation(env?: RuntimeEnv, deps?: OmoResolutionDeps): string | null;
export declare function getSparkShellRuntimeAwareness(env?: RuntimeEnv, deps?: OmoResolutionDeps): string;
export {};
