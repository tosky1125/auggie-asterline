export interface WorkLoopErrorOptions {
	readonly cause?: unknown;
	readonly details?: Record<string, unknown>;
}

export class WorkLoopError extends Error {
	readonly code: string;
	readonly details?: Record<string, unknown>;

	constructor(message: string, code: string, opts?: WorkLoopErrorOptions) {
		super(message, opts?.cause === undefined ? undefined : { cause: opts.cause });
		this.name = "WorkLoopError";
		this.code = code;
		if (opts?.details !== undefined) {
			this.details = opts.details;
		}
	}
}

export function iso(): string {
	return new Date().toISOString();
}
