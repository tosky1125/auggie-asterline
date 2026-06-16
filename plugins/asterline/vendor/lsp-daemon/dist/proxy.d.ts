import { type CallToolOptions, type DaemonToolContext } from "./daemon-client.js";
import { type DaemonPaths } from "./paths.js";
export interface ProxyOptions {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    paths?: DaemonPaths;
    context?: DaemonToolContext;
    ensure?: CallToolOptions["ensure"];
}
export declare function runMcpStdioProxy(options?: ProxyOptions): Promise<void>;
