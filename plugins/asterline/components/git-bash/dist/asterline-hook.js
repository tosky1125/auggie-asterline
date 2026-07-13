import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
const MAX_INPUT_BYTES = 1024 * 1024;
const REMINDER = "On Windows, prefer the ASTERLINE git_bash MCP for shell commands before using built-in launch-process. Use launch-process when git_bash is unavailable or for non-shell operations.";
class HookInputLimitError extends Error {
}
class GitBashPathError extends Error {
}
export function parsePreToolUsePayload(raw) {
    if (raw.trim().length === 0 || Buffer.byteLength(raw) > MAX_INPUT_BYTES)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return isPreToolUsePayload(parsed) ? parsed : null;
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return null;
        throw error;
    }
}
export function applyGitBashPreToolUseReminder(payload, options = {}) {
    if (!isWindowsHost(options))
        return "";
    const markerPath = reminderMarkerPath(payload.session_id, options);
    mkdirSync(dirname(markerPath), { recursive: true });
    if (!claimReminder(markerPath))
        return "";
    const output = {
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: REMINDER },
    };
    return `${JSON.stringify(output)}\n`;
}
export async function runGitBashHookCli(stdin, stdout, options = {}) {
    try {
        const payload = parsePreToolUsePayload(await readAll(stdin));
        if (payload === null)
            return;
        const output = applyGitBashPreToolUseReminder(payload, options);
        if (output.length > 0)
            stdout.write(output);
    }
    catch (error) {
        // no-excuse-ok: catch -- hook boundary must fail open for host and filesystem errors.
        if (error instanceof Error)
            return;
    }
}
function claimReminder(path) {
    try {
        closeSync(openSync(path, "wx", 0o600));
        return true;
    }
    catch (error) {
        if (isRecord(error) && error["code"] === "EEXIST")
            return false;
        throw error;
    }
}
function isWindowsHost(options) {
    if ((options.platform ?? process.platform) === "win32")
        return true;
    const env = options.env ?? process.env;
    return env["OS"] === "Windows_NT" || env["ComSpec"] !== undefined || env["SystemRoot"] !== undefined;
}
function reminderMarkerPath(sessionId, options) {
    const root = pluginDataRoot(options);
    const digest = createHash("sha256").update(sessionId).digest("hex");
    return join(root, "git-bash-reminder", `${digest}.seen`);
}
function pluginDataRoot(options) {
    const env = options.env ?? process.env;
    const configured = options.pluginDataRoot?.trim() || env["ASTERLINE_PLUGIN_DATA"]?.trim() || env["PLUGIN_DATA"]?.trim();
    if (configured !== undefined && configured.length > 0) {
        if (!isAbsolute(configured))
            throw new GitBashPathError("plugin data root must be absolute");
        return resolve(configured);
    }
    return join(resolve(env["HOME"]?.trim() || homedir()), ".augment", "asterline", "plugin-data");
}
function isPreToolUsePayload(value) {
    if (!isRecord(value))
        return false;
    return (value["hook_event_name"] === "PreToolUse" &&
        typeof value["session_id"] === "string" &&
        value["session_id"].length > 0 &&
        value["tool_name"] === "launch-process" &&
        isRecord(value["tool_input"]) &&
        typeof value["tool_input"]["command"] === "string" &&
        value["tool_input"]["command"].trim().length > 0);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readAll(stdin) {
    return new Promise((resolve, reject) => {
        let data = "";
        let accepting = true;
        stdin.setEncoding("utf8");
        stdin.on("data", (chunk) => {
            if (!accepting)
                return;
            data += chunk instanceof Buffer ? chunk.toString() : String(chunk);
            if (Buffer.byteLength(data) > MAX_INPUT_BYTES) {
                accepting = false;
                reject(new HookInputLimitError("hook input exceeds byte limit"));
            }
        });
        stdin.once("error", reject);
        stdin.once("end", () => resolve(data));
    });
}
