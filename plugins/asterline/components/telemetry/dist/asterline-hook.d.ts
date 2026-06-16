import { type PostHogClient } from "./posthog.js";
export type AsterlineSessionStartInput = {
    session_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "SessionStart";
    model: string;
    permission_mode: string;
    source: "startup" | "resume" | "clear";
};
export type AsterlineTelemetryHookOptions = {
    createClient?: () => PostHogClient | Promise<PostHogClient>;
    getDistinctId?: () => string;
};
export declare function runSessionStartHook(_input: AsterlineSessionStartInput, options?: AsterlineTelemetryHookOptions): Promise<string>;
