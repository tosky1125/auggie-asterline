export interface PreToolUsePayload {
    readonly hook_event_name: "PreToolUse";
    readonly session_id: string;
    readonly tool_input: Readonly<Record<string, unknown>>;
    readonly tool_name: "launch-process";
}
export interface GitBashHookOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform | string;
    readonly pluginDataRoot?: string;
}
export declare function parsePreToolUsePayload(raw: string): PreToolUsePayload | null;
export declare function applyGitBashPreToolUseReminder(payload: PreToolUsePayload, options?: GitBashHookOptions): string;
export declare function runGitBashHookCli(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream, options?: GitBashHookOptions): Promise<void>;
