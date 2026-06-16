import type { AsterlineRulesHookOptions } from "./asterline-hook-options.js";
import type { TranscriptSearchOptions } from "./transcript-search.js";
export declare function runStaticInjection(cwd: string, transcriptPath: string | null, eventName: "SessionStart" | "UserPromptSubmit", cachePath: string, options: AsterlineRulesHookOptions, completedPostCompactChannel?: "static", transcriptSearchOptions?: TranscriptSearchOptions, model?: string): string;
