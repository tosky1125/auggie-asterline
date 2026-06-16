export interface WorkLoopErrorOptions {
    readonly cause?: unknown;
    readonly details?: Record<string, unknown>;
}
export declare class WorkLoopError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: string, opts?: WorkLoopErrorOptions);
}
export declare function iso(): string;
