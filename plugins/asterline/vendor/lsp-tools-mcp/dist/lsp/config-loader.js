import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { contextCwd, contextEnv } from "../request-context.js";
import { BUILTIN_SERVERS } from "./server-definitions.js";
export function getConfigPaths() {
    return {
        project: getProjectConfigPaths()[0] ?? join(process.cwd(), ".asterline", "lsp-client.json"),
        user: getUserConfigPath(),
    };
}
function resolveProjectConfigPath(path) {
    return isAbsolute(path) ? path : join(contextCwd(), path);
}
function getProjectConfigPaths() {
    const projectOverride = contextEnv("LSP_TOOLS_MCP_PROJECT_CONFIG");
    if (projectOverride) {
        return projectOverride.split(delimiter).filter(Boolean).map(resolveProjectConfigPath);
    }
    return [join(contextCwd(), ".asterline", "lsp-client.json")];
}
function getUserConfigPath() {
    const userOverride = contextEnv("LSP_TOOLS_MCP_USER_CONFIG");
    if (!userOverride)
        return join(homedir(), ".asterline", "lsp-client.json");
    return isAbsolute(userOverride) ? userOverride : join(homedir(), userOverride);
}
function loadJsonFile(path) {
    if (!existsSync(path))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        return isConfigJson(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
export function loadAllConfigs() {
    const configs = new Map();
    const project = loadFirstJsonFile(getProjectConfigPaths());
    if (project)
        configs.set("project", project);
    const user = loadJsonFile(getUserConfigPath());
    if (user)
        configs.set("user", user);
    return configs;
}
function loadFirstJsonFile(paths) {
    for (const path of paths) {
        const config = loadJsonFile(path);
        if (config)
            return config;
    }
    return null;
}
export function getMergedServers() {
    const configs = loadAllConfigs();
    const servers = [];
    const disabled = new Set();
    const seen = new Set();
    const sources = ["project", "user"];
    for (const source of sources) {
        const config = configs.get(source);
        if (!config?.lsp)
            continue;
        for (const [id, rawEntry] of Object.entries(config.lsp)) {
            const entry = parseLspEntry(rawEntry);
            if (!entry)
                continue;
            if (entry.disabled) {
                disabled.add(id);
                continue;
            }
            if (seen.has(id))
                continue;
            const server = createServerFromEntry(id, entry, source);
            if (!server)
                continue;
            servers.push(server);
            seen.add(id);
        }
    }
    for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
        if (disabled.has(id) || seen.has(id))
            continue;
        servers.push({
            id,
            command: config.command,
            extensions: config.extensions,
            priority: -100,
            source: "builtin",
        });
    }
    return servers.sort((a, b) => {
        if (a.source !== b.source) {
            const order = {
                project: 0,
                user: 1,
                builtin: 2,
            };
            return order[a.source] - order[b.source];
        }
        return b.priority - a.priority;
    });
}
function createServerFromEntry(id, entry, source) {
    const builtin = BUILTIN_SERVERS[id];
    if (source === "project") {
        if (!builtin)
            return null;
        const server = createServer({
            id,
            command: builtin.command,
            extensions: entry.extensions ?? builtin.extensions,
            priority: entry.priority ?? 0,
            source,
        });
        if (entry.initialization !== undefined) {
            server.initialization = entry.initialization;
        }
        return server;
    }
    if (entry.command && entry.extensions) {
        const server = createServer({
            id,
            command: entry.command,
            extensions: entry.extensions,
            priority: entry.priority ?? 0,
            source,
        });
        applyOptionalServerFields(server, entry);
        return server;
    }
    if (!builtin)
        return null;
    const server = createServer({
        id,
        command: entry.command ?? builtin.command,
        extensions: entry.extensions ?? builtin.extensions,
        priority: entry.priority ?? 0,
        source,
    });
    applyOptionalServerFields(server, entry);
    return server;
}
function createServer(input) {
    const server = {
        id: input.id,
        command: input.command,
        extensions: input.extensions,
        priority: input.priority,
        source: input.source,
    };
    if (input.env !== undefined) {
        server.env = input.env;
    }
    if (input.initialization !== undefined) {
        server.initialization = input.initialization;
    }
    return server;
}
function applyOptionalServerFields(server, entry) {
    if (entry.env !== undefined) {
        server.env = entry.env;
    }
    if (entry.initialization !== undefined) {
        server.initialization = entry.initialization;
    }
}
function isConfigJson(value) {
    if (!isRecord(value))
        return false;
    const lsp = value["lsp"];
    return lsp === undefined || isRecord(lsp);
}
function parseLspEntry(value) {
    return isLspEntry(value) ? value : null;
}
function isLspEntry(value) {
    if (!isRecord(value))
        return false;
    const disabled = value["disabled"];
    const command = value["command"];
    const extensions = value["extensions"];
    const priority = value["priority"];
    const env = value["env"];
    const initialization = value["initialization"];
    return ((disabled === undefined || typeof disabled === "boolean") &&
        (command === undefined || isStringArray(command)) &&
        (extensions === undefined || isStringArray(extensions)) &&
        (priority === undefined || typeof priority === "number") &&
        (env === undefined || isStringRecord(env)) &&
        (initialization === undefined || isRecord(initialization)));
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isStringRecord(value) {
    return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function getDisabledServerIds() {
    const configs = loadAllConfigs();
    const disabled = new Set();
    for (const config of configs.values()) {
        if (!config.lsp)
            continue;
        for (const [id, rawEntry] of Object.entries(config.lsp)) {
            const entry = parseLspEntry(rawEntry);
            if (!entry)
                continue;
            if (entry.disabled)
                disabled.add(id);
        }
    }
    return disabled;
}
