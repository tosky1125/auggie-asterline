import { spawn } from "node:child_process";

export type ProcessResult = { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string };
export const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const MAX_COMBINED_OUTPUT_BYTES = 96 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const KILL_GRACE_MS = 250;

export type ProcessExecutor = (
	command: string,
	args: readonly string[],
	stdin: string,
	maxOutputBytes?: number,
	timeoutMs?: number,
) => Promise<ProcessResult>;

type OutputAccumulator = { text: string; bytes: number; truncated: boolean };
type OutputState = {
	readonly stdout: OutputAccumulator;
	readonly stderr: OutputAccumulator;
	combinedBytes: number;
};

function appendOutput(
	output: OutputAccumulator,
	chunk: string,
	state: OutputState,
	streamLimit: number,
	combinedLimit: number,
): boolean {
	if (output.truncated) return true;
	const bytes = Buffer.from(chunk);
	const permitted = Math.max(0, Math.min(streamLimit - output.bytes, combinedLimit - state.combinedBytes));
	const accepted = Math.min(bytes.length, permitted);
	if (accepted > 0) output.text += bytes.subarray(0, accepted).toString("utf8");
	output.bytes += accepted;
	state.combinedBytes += accepted;
	if (accepted === bytes.length) return false;
	output.truncated = true;
	return true;
}

function formatOutput(output: OutputAccumulator, stream: "stdout" | "stderr"): string {
	return output.truncated ? `${output.text}\n[${stream} truncated after ${output.bytes} captured bytes]` : output.text;
}

function positiveInteger(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function spawnProcess(
	command: string,
	args: readonly string[],
	stdin: string,
	maxOutputBytes = MAX_PROCESS_OUTPUT_BYTES,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const streamLimit = positiveInteger(maxOutputBytes, MAX_PROCESS_OUTPUT_BYTES);
		const combinedLimit = Math.min(MAX_COMBINED_OUTPUT_BYTES, Math.floor(streamLimit * 1.5));
		const deadline = positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
		const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
		const output: OutputState = {
			stdout: { text: "", bytes: 0, truncated: false },
			stderr: { text: "", bytes: 0, truncated: false },
			combinedBytes: 0,
		};
		let settled = false;
		let aborting = false;
		let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
		let forceTimer: ReturnType<typeof setTimeout> | undefined;
		let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

		const clearTimers = (): void => {
			if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
			if (forceTimer !== undefined) clearTimeout(forceTimer);
			if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
		};
		const onStdout = (chunk: string): void => {
			if (!aborting && appendOutput(output.stdout, chunk, output, streamLimit, combinedLimit)) abort();
		};
		const onStderr = (chunk: string): void => {
			if (!aborting && appendOutput(output.stderr, chunk, output, streamLimit, combinedLimit)) abort();
		};
		const onStdinError = (): void => undefined;
		const cleanup = (): void => {
			clearTimers();
			child.stdout.off("data", onStdout);
			child.stderr.off("data", onStderr);
			child.stdin.off("error", onStdinError);
			child.off("error", onError);
			child.off("close", onClose);
		};
		const finish = (exitCode: number | null): void => {
			if (settled) return;
			settled = true;
			cleanup();
			child.stdin.destroy();
			resolve({
				exitCode: aborting ? null : exitCode,
				stdout: formatOutput(output.stdout, "stdout"),
				stderr: formatOutput(output.stderr, "stderr"),
			});
		};
		const killSafely = (signal: NodeJS.Signals): void => {
			try {
				child.kill(signal);
			} catch (error) {
				if (!(error instanceof Error)) throw error;
			}
		};
		function abort(): void {
			if (aborting || settled) return;
			aborting = true;
			child.stdin.destroy();
			killSafely("SIGTERM");
			forceTimer = setTimeout(() => {
				killSafely("SIGKILL");
				fallbackTimer = setTimeout(() => finish(null), KILL_GRACE_MS);
			}, KILL_GRACE_MS);
		}
		function onError(error: Error): void {
			appendOutput(output.stderr, error.message, output, streamLimit, combinedLimit);
			abort();
		}
		function onClose(exitCode: number | null): void {
			finish(exitCode);
		}

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.stdin.on("error", onStdinError);
		child.once("error", onError);
		child.once("close", onClose);
		deadlineTimer = setTimeout(() => {
			appendOutput(output.stderr, "comment-checker timed out", output, streamLimit, combinedLimit);
			abort();
		}, deadline);
		child.stdin.end(stdin);
	});
}
