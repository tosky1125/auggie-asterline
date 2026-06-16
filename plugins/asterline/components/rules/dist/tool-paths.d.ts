export interface AsterlinePostToolUseLike {
    tool_name: string;
    tool_input: unknown;
    tool_response: unknown;
}
export declare function extractAsterlineToolPaths(input: AsterlinePostToolUseLike, cwd: string): string[];
