import { existsSync } from "node:fs";
import { join } from "node:path";

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

interface OmoResolutionDeps {
	readonly fileExists?: (path: string) => boolean;
	readonly platform?: NodeJS.Platform;
}

const SPARKSHELL_AWARENESS_MARKER = "## Sparkshell Runtime";

export const SPARKSHELL_AWARENESS_DEDUP_KEY = "__omo_sparkshell_awareness__";

export function isAsterlineAppServerActive(env: RuntimeEnv = process.env): boolean {
	const originator = env["ASTERLINE_INTERNAL_ORIGINATOR_OVERRIDE"]?.toLowerCase() ?? "";
	const bundleIdentifier = env["__CFBundleIdentifier"]?.toLowerCase() ?? "";
	const shellActive = isTruthy(env["ASTERLINE_SHELL"]);

	return (
		shellActive &&
		(originator.includes("asterline desktop") ||
			originator.includes("asterline app") ||
			bundleIdentifier === "com.openai.asterline")
	);
}

function isSparkShellAppServerConfigured(env: RuntimeEnv = process.env): boolean {
	const asterlineSocketPath = env["ASTERLINE_APP_SERVER_SOCKET"]?.trim() ?? "";
	const omoSocketPath = env["ASTERLINE_SPARKSHELL_APP_SERVER_SOCKET"]?.trim() ?? "";
	return asterlineSocketPath.length > 0 || omoSocketPath.length > 0;
}

export function resolveOmoInvocation(env: RuntimeEnv = process.env, deps: OmoResolutionDeps = {}): string | null {
	const fileExists = deps.fileExists ?? existsSync;
	const platform = deps.platform ?? process.platform;
	const binNames = platform === "win32" ? ["asterline.cmd", "asterline.exe", "asterline"] : ["asterline"];
	const pathDelimiter = platform === "win32" ? ";" : ":";
	const pathEntries = (env["PATH"] ?? "").split(pathDelimiter).filter((entry) => entry.trim().length > 0);
	for (const pathEntry of pathEntries) {
		for (const binName of binNames) {
			if (fileExists(join(pathEntry, binName))) return "asterline";
		}
	}
	for (const candidateDir of omoCandidateBinDirs(env)) {
		for (const binName of binNames) {
			const candidate = join(candidateDir, binName);
			if (fileExists(candidate)) return candidate;
		}
	}
	return null;
}

function omoCandidateBinDirs(env: RuntimeEnv): readonly string[] {
	const dirs: string[] = [];
	const localBinDir = env["ASTERLINE_LOCAL_BIN_DIR"]?.trim() ?? "";
	if (localBinDir.length > 0) dirs.push(localBinDir);
	const home = env["HOME"]?.trim() || env["USERPROFILE"]?.trim() || "";
	const asterlineHome = env["ASTERLINE_HOME"]?.trim() || (home.length > 0 ? join(home, ".asterline") : "");
	if (asterlineHome.length > 0) dirs.push(join(asterlineHome, "bin"));
	if (home.length > 0) dirs.push(join(home, ".local", "bin"));
	return dirs;
}

export function getSparkShellRuntimeAwareness(env: RuntimeEnv = process.env, deps: OmoResolutionDeps = {}): string {
	const override = env["ASTERLINE_SPARKSHELL_AWARENESS"] ?? env["ASTERLINE_SPARKSHELL_AWARENESS"];
	if (isFalsy(override)) {
		return "";
	}
	if (!isTruthy(override) && !isAsterlineAppServerActive(env) && !isSparkShellAppServerConfigured(env)) {
		return "";
	}

	const resolved = resolveOmoInvocation(env, deps);
	const invocation = resolved ?? (isTruthy(override) ? "asterline" : null);
	if (invocation === null) {
		return "";
	}
	const command = /\s/.test(invocation) ? `"${invocation}"` : invocation;

	return [
		SPARKSHELL_AWARENESS_MARKER,
		"",
		`- Prefer \`${command} sparkshell <command>\` for repo inspection, CLI smoke tests, git/history checks, and bounded verification before falling back to raw shell commands.`,
		`- Use \`${command} sparkshell --shell '<command>'\` only when shell metacharacters are required.`,
		`- Use \`${command} sparkshell --tmux-pane <pane-id> --tail-lines 400\` to inspect an existing tmux pane. Tail lines must stay between 100 and 1000.`,
		"- When no native sidecar or appserver is available, Sparkshell silently falls back to raw command execution. `ASTERLINE_SPARKSHELL_BIN` selects a native sidecar path.",
		"- When `ASTERLINE_THREAD_ID` identifies a Asterline session, Sparkshell appends recent session context (first/latest user request + last 5 conversation messages) after the shell result so output consumers stay aligned with the session goals. `ASTERLINE_SPARKSHELL_SESSION_CONTEXT=0` disables it.",
		`- Route potentially huge output (full log files, big diffs, \`cat\`/\`grep\` over large artifacts) through \`${command} sparkshell\` instead of reading it raw: oversized output is condensed to a budget while preserving error signatures, repeated patterns, session-goal-relevant lines, and head/tail. Tune with \`--budget <chars>\`; disable with \`ASTERLINE_SPARKSHELL_CONDENSE=0\`.`,
		"- Oversized output is first summarized by the spark model (`asterline exec`, default `gpt-5.3-asterline-spark`) fed with the session context: the summary reproduces the output as-is (no masking) and ends with a `[sparkshell caption]` line describing what ran and which lines were omitted. `ASTERLINE_SPARKSHELL_SPARK=0` skips the model and uses deterministic condensation directly.",
	].join("\n");
}

function isTruthy(value: string | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isFalsy(value: string | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	return ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
