import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import {
	MAX_PROCESS_OUTPUT_BYTES,
	type ProcessExecutor,
	type ProcessResult,
	spawnProcess,
} from "./process-executor.js";
import type { CommentCheckerHookInput } from "./types.js";

export { MAX_PROCESS_OUTPUT_BYTES, type ProcessExecutor, type ProcessResult, spawnProcess };

export type RunCommentCheckerOptions = {
	readonly binaryPath?: string;
	readonly customPrompt?: string;
	readonly resolveBinary?: () => string | undefined;
	readonly executor?: ProcessExecutor;
};

export type CommentCheckerRunResult =
	| { readonly status: "pass"; readonly message: ""; readonly binaryPath: string; readonly exitCode: 0 }
	| { readonly status: "warning"; readonly message: string; readonly binaryPath: string; readonly exitCode: 2 }
	| {
			readonly status: "error";
			readonly message: string;
			readonly binaryPath: string;
			readonly exitCode: number | null;
	  }
	| { readonly status: "missing"; readonly message: string };

export type CommentCheckerRunner = (input: CommentCheckerHookInput) => Promise<CommentCheckerRunResult>;

export async function runCommentChecker(
	input: CommentCheckerHookInput,
	options: RunCommentCheckerOptions = {},
): Promise<CommentCheckerRunResult> {
	const binaryPath = options.binaryPath ?? options.resolveBinary?.() ?? resolveCommentCheckerBinary();
	if (binaryPath === undefined) {
		return {
			status: "missing",
			message:
				"comment-checker is not provisioned; set ASTERLINE_COMMENT_CHECKER_BINARY to an operator-provisioned executable.",
		};
	}
	const args = options.customPrompt === undefined ? ["check"] : ["check", "--prompt", options.customPrompt];
	const result = await (options.executor ?? spawnProcess)(
		binaryPath,
		args,
		JSON.stringify(input),
		MAX_PROCESS_OUTPUT_BYTES,
		configuredTimeoutMs(),
	);
	const message = result.stderr.length > 0 ? result.stderr : result.stdout;
	if (result.exitCode === 0) return { status: "pass", message: "", binaryPath, exitCode: 0 };
	if (result.exitCode === 2) return { status: "warning", message, binaryPath, exitCode: 2 };
	return { status: "error", message, binaryPath, exitCode: result.exitCode };
}

export function resolveCommentCheckerBinary(): string | undefined {
	const configured = process.env["ASTERLINE_COMMENT_CHECKER_BINARY"];
	if (configured !== undefined && existsSync(configured)) return configured;
	const binaryName = process.platform === "win32" ? "comment-checker.exe" : "comment-checker";
	try {
		const require = createRequire(import.meta.url);
		const packagePath = require.resolve("@code-yeongyu/comment-checker/package.json");
		const binaryPath = join(dirname(packagePath), "bin", binaryName);
		return existsSync(binaryPath) ? binaryPath : undefined;
	} catch (error) {
		if (error instanceof Error) return undefined;
		throw error;
	}
}

function configuredTimeoutMs(): number {
	const raw = process.env["ASTERLINE_COMMENT_CHECKER_TIMEOUT_MS"];
	if (raw === undefined || !/^\d+$/.test(raw)) return 30_000;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= 100 && value <= 30_000 ? value : 30_000;
}
