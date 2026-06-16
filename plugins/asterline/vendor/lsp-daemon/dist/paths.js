import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
const requireFromHere = createRequire(import.meta.url);
const MAX_SOCKET_PATH_LENGTH = 100;
export function resolveDaemonVersion(requireFn = requireFromHere) {
    for (const candidate of ["./package.json", "../package.json"]) {
        try {
            const pkg = requireFn(candidate);
            if (typeof pkg.version === "string" && pkg.version.length > 0)
                return pkg.version;
        }
        catch { }
    }
    return "0";
}
export function daemonBaseDir(env = process.env) {
    const explicit = env["ASTERLINE_LSP_DAEMON_DIR"]?.trim();
    if (explicit)
        return explicit;
    const pluginData = env["PLUGIN_DATA"]?.trim();
    if (pluginData)
        return join(pluginData, "daemon");
    const asterlineHome = env["ASTERLINE_HOME"]?.trim();
    const home = asterlineHome && asterlineHome.length > 0 ? asterlineHome : join(homedir(), ".asterline");
    return join(home, "asterline-lsp", "daemon");
}
export function daemonPaths(env = process.env, version = resolveDaemonVersion()) {
    const dir = join(daemonBaseDir(env), `v${version}`);
    return {
        version,
        dir,
        socket: resolveSocketPath(dir, version),
        lock: join(dir, "daemon.lock"),
        pid: join(dir, "daemon.pid"),
        log: join(dir, "daemon.log"),
    };
}
function resolveSocketPath(dir, version) {
    const digest = createHash("sha256").update(dir).digest("hex").slice(0, 16);
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\asterline-lsp-${version}-${digest}`;
    }
    const natural = join(dir, "daemon.sock");
    if (natural.length < MAX_SOCKET_PATH_LENGTH)
        return natural;
    return join(tmpdir(), `asterline-lsp-${version}-${digest}.sock`);
}
