export { extractMutatedFilePaths } from "./mutated-file-paths.js";
export type DiagnosticsRunner = (filePath: string) => Promise<string>;
export interface AsterlinePostToolUseInput {
    session_id?: unknown;
    tool_name?: unknown;
    tool_input?: unknown;
    tool_response?: unknown;
    transcript_path?: unknown;
}
export interface AsterlinePostCompactInput {
    session_id?: unknown;
}
export declare function runLspDiagnosticsText(filePath: string): Promise<string>;
export declare function runLspPostToolUseHook(input: AsterlinePostToolUseInput, runDiagnostics?: DiagnosticsRunner): Promise<string>;
export declare function runLspPostCompactHook(input: AsterlinePostCompactInput): Promise<string>;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
