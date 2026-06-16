import { type CommentCheckRequest } from "./core.js";
import { type CommentCheckerRunner } from "./runner.js";
export type AsterlinePostToolUseInput = {
    session_id: string;
    turn_id: string;
    transcript_path: string | null;
    cwd: string;
    hook_event_name: "PostToolUse";
    model: string;
    permission_mode: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_response: unknown;
    tool_use_id: string;
};
export type AsterlineHookOptions = {
    run?: CommentCheckerRunner;
};
export declare function extractAsterlineCommentCheckRequests(input: AsterlinePostToolUseInput): CommentCheckRequest[];
export declare function runCommentCheckerPostToolUse(input: AsterlinePostToolUseInput, options?: AsterlineHookOptions): Promise<string>;
export declare function runAsterlineHookCli(): Promise<void>;
export declare function parseAsterlinePostToolUseInput(input: string): AsterlinePostToolUseInput | undefined;
