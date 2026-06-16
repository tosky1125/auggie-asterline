import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { contextEnv } from "../request-context.js";
export function getInstallDecisionsPath() {
    const override = contextEnv("LSP_TOOLS_MCP_INSTALL_DECISIONS");
    if (!override)
        return join(homedir(), ".asterline", "lsp-install-decisions.json");
    return isAbsolute(override) ? override : join(homedir(), override);
}
export function loadInstallDecisions() {
    const path = getInstallDecisionsPath();
    if (!existsSync(path))
        return {};
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return isInstallDecisions(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
export function loadInstallDecision(serverId) {
    return loadInstallDecisions()[serverId];
}
export function recordInstallDecision(serverId, decision, decidedAt = new Date().toISOString()) {
    const decisions = loadInstallDecisions();
    decisions[serverId] = { decision, decidedAt };
    writeInstallDecisions(decisions);
}
export function isInstallDecision(value) {
    return value === "declined" || value === "allowed";
}
function writeInstallDecisions(decisions) {
    const path = getInstallDecisionsPath();
    mkdirSync(dirname(path), { recursive: true });
    const tmpPath = `${path}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
    renameSync(tmpPath, path);
}
function isInstallDecisions(value) {
    return isRecord(value) && Object.values(value).every(isInstallDecisionRecord);
}
function isInstallDecisionRecord(value) {
    if (!isRecord(value))
        return false;
    return isInstallDecision(value["decision"]) && typeof value["decidedAt"] === "string";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
