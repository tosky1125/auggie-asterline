import type { WorkspaceEdit } from "./types.js";
export interface ApplyResult {
    success: boolean;
    filesModified: string[];
    totalEdits: number;
    errors: string[];
}
export interface ApplyWorkspaceEditOptions {
    readonly workspaceRoot?: string;
}
export declare function applyWorkspaceEdit(edit: WorkspaceEdit | null, options?: ApplyWorkspaceEditOptions): ApplyResult;
