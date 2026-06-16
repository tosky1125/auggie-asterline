import type { AsterlineRulesHookOptions } from "./asterline-hook-options.js";
export type { AsterlineRulesHookOptions } from "./asterline-hook-options.js";
export type AsterlineSessionStartInput = {
    session_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "SessionStart";
    model: string;
    permission_mode: string;
    source: "startup" | "resume" | "clear" | "compact";
};
export type AsterlineUserPromptSubmitInput = {
    session_id: string;
    turn_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "UserPromptSubmit";
    model: string;
    permission_mode: string;
    prompt: string;
};
export type AsterlinePostToolUseInput = {
    session_id: string;
    turn_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "PostToolUse";
    model: string;
    permission_mode: string;
    tool_name: string;
    tool_input: unknown;
    tool_response: unknown;
    tool_use_id: string;
};
export type AsterlinePostCompactInput = {
    session_id: string;
    turn_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "PostCompact";
    model: string;
    trigger: "manual" | "auto";
};
export declare function runSessionStartHook(input: AsterlineSessionStartInput, options?: AsterlineRulesHookOptions): Promise<string>;
export declare function runPostCompactHook(input: AsterlinePostCompactInput, options?: AsterlineRulesHookOptions): Promise<string>;
export declare function runUserPromptSubmitHook(input: AsterlineUserPromptSubmitInput, options?: AsterlineRulesHookOptions): Promise<string>;
export declare function runPostToolUseHook(input: AsterlinePostToolUseInput, options?: AsterlineRulesHookOptions): Promise<string>;
