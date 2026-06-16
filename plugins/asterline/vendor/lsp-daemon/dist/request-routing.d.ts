import { type JsonRpcResponse } from "@code-yeongyu/lsp-tools-mcp/dist/mcp.js";
import { type RequestContext } from "@code-yeongyu/lsp-tools-mcp/dist/request-context.js";
export declare const CONTEXT_KEY = "_context";
export interface RoutedRequest {
    input: unknown;
    context: RequestContext | undefined;
}
export declare function extractRequestContext(raw: unknown): RoutedRequest;
export declare function handleDaemonMessage(raw: unknown): Promise<JsonRpcResponse | undefined>;
