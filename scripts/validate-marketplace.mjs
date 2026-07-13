#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];

const expectedSkills = [
  "clean-ai-code",
  "code-engineer",
  "code-intel",
  "code-intel-setup",
  "comment-guard",
  "debug-trace",
  "deep-research",
  "git-flow",
  "health-check",
  "init-knowledge",
  "reshape-code",
  "review-pass",
  "rule-sync",
  "run-plan",
  "ui-polish",
  "upstream-fix",
  "upstream-report",
  "visual-check",
  "work-loop",
  "work-plan",
];

const requiredRuntime = [
  "components/comment-checker/dist/cli.js",
  "components/git-bash/dist/cli.js",
  "components/lsp/dist/cli.js",
  "components/rules/dist/cli.js",
  "components/telemetry/dist/cli.js",
  "components/start-work-continuation/dist/cli.js",
  "components/ultrawork/dist/cli.js",
  "components/work-loop/dist/cli.js",
  "mcp/ast_grep/dist/cli.js",
  "mcp/git_bash/dist/cli.js",
  "mcp/lsp/dist/cli.js",
  "vendor/picomatch/package.json",
  "vendor/posthog-node/package.json",
  "vendor/lsp-daemon/package.json",
  "vendor/lsp-tools-mcp/package.json",
];

function fail(message) {
  failures.push(message);
}

function abs(path) {
  return join(root, path);
}

function exists(path) {
  try {
    statSync(abs(path));
    return true;
  } catch {
    fail(`${path}: missing`);
    return false;
  }
}

function hasPath(path) {
  try {
    statSync(abs(path));
    return true;
  } catch {
    return false;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(abs(path), "utf8"));
  } catch (error) {
    fail(`${path}: invalid JSON: ${error.message}`);
    return {};
  }
}

function walk(path) {
  const out = [];
  for (const name of readdirSync(abs(path))) {
    const rel = relative(root, join(abs(path), name));
    if (statSync(abs(rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

function assertNodeEntrypointLoads(path) {
  const result = spawnSync("node", [abs(path), "help"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    fail(`${path}: failed to start: ${result.error.message}`);
    return;
  }
  if (result.signal !== null) {
    fail(`${path}: terminated by ${result.signal}`);
    return;
  }
  if (output.includes("ERR_MODULE_NOT_FOUND") || output.includes("Cannot find module")) {
    fail(`${path}: module load failed: ${output.split(/\r?\n/)[0]}`);
    return;
  }
  if (![0, 1, 2].includes(result.status ?? -1)) {
    fail(`${path}: unexpected help exit ${result.status}: ${output.split(/\r?\n/)[0]}`);
  }
}

function mcpLocalEntrypoint(name, server) {
  if (server?.command !== "bash") {
    fail(`MCP server ${name} must launch through bash`);
    return null;
  }
  if (server?.args?.[0] !== "-lc") {
    fail(`MCP server ${name} must use bash -lc`);
    return null;
  }
  const command = server?.args?.[1];
  if (typeof command !== "string") {
    fail(`MCP server ${name} missing bash command`);
    return null;
  }
  const match = command.match(
    /^exec node "\$HOME\/\.augment\/plugins\/marketplaces\/auggie-asterline\/plugins\/asterline\/(.+)" mcp$/,
  );
  if (!match) {
    fail(`MCP server ${name} must use the installed Asterline marketplace path`);
    return null;
  }
  return `plugins/asterline/${match[1]}`;
}

for (const path of [
  "README.md",
  ".augment-plugin/marketplace.json",
  "plugins/asterline/.augment-plugin/plugin.json",
  "plugins/asterline/.mcp.json",
  "plugins/asterline/hooks/hooks.json",
  "plugins/asterline/package.json",
  "plugins/asterline/scripts/validate-runtime.mjs",
]) {
  exists(path);
}

for (const path of requiredRuntime) exists(`plugins/asterline/${path}`);

const marketplace = readJson(".augment-plugin/marketplace.json");
const plugin = readJson("plugins/asterline/.augment-plugin/plugin.json");
const hooks = readJson("plugins/asterline/hooks/hooks.json");
const mcp = readJson("plugins/asterline/.mcp.json");
const pkg = readJson("plugins/asterline/package.json");

if (marketplace.name !== "auggie-asterline") fail("marketplace name mismatch");
if (marketplace.version !== "4.17.1") fail("marketplace version mismatch");
const entry = marketplace.plugins?.[0];
if (entry?.name !== "asterline") fail("marketplace plugin name mismatch");
if (entry?.version !== "4.17.1") fail("marketplace plugin version mismatch");
if (entry?.source !== "./plugins/asterline") fail("marketplace source mismatch");

if (plugin.name !== "asterline") fail("plugin name mismatch");
if (plugin.version !== "4.17.1") fail("plugin version mismatch");
for (const key of ["skills", "agents", "rules", "hooks", "mcpServers"]) {
  if (!plugin[key]) fail(`plugin manifest missing ${key}`);
}

if (pkg.name !== "@asterline/auggie-plugin") fail("runtime package name mismatch");
if (pkg.version !== "4.17.1") fail("runtime package version mismatch");
if (pkg.bin?.["asterline-telemetry"] !== undefined) fail("runtime telemetry bin must not be published");
if (pkg.dependencies?.["posthog-node"] !== undefined) fail("runtime posthog-node dependency must not be published");
for (const binName of Object.keys(pkg.bin ?? {})) {
  if (!binName.startsWith("asterline-")) fail(`runtime bin is not Asterline branded: ${binName}`);
}

const skillDirs = readdirSync(abs("plugins/asterline/skills"))
  .filter((name) => statSync(abs(`plugins/asterline/skills/${name}`)).isDirectory())
  .sort();
if (JSON.stringify(skillDirs) !== JSON.stringify(expectedSkills)) {
  fail(`skill set mismatch: ${skillDirs.join(", ")}`);
}
for (const skill of expectedSkills) exists(`plugins/asterline/skills/${skill}/SKILL.md`);

const hookText = JSON.stringify(hooks);
if (!hookText.includes("^launch-process$")) fail("missing Auggie launch-process hook matcher");
if (!hookText.includes("^(str-replace-editor|save-file)$")) fail("missing Auggie edit hook matcher");
for (const token of ["create_goal", "apply_patch", "LazyCodex", "OMO", "omo"]) {
  if (hookText.includes(token)) fail(`hook manifest contains legacy token: ${token}`);
}
for (const entries of Object.values(hooks.hooks ?? {})) {
  for (const entry of entries) {
    if (typeof entry.matcher === "string") new RegExp(entry.matcher);
    for (const hook of entry.hooks ?? []) {
      if (!hook.command.includes("/hooks/bin/")) fail(`hook command does not use wrapper: ${hook.command}`);
    }
  }
}

for (const name of ["ast_grep", "grep_app", "context7", "lsp"]) {
  if (!mcp.mcpServers?.[name]) fail(`missing MCP server ${name}`);
}
if (mcp.mcpServers?.git_bash) {
  fail("git_bash MCP must not be registered on Linux marketplace installs");
}
for (const name of ["ast_grep", "lsp"]) {
  mcpLocalEntrypoint(name, mcp.mcpServers?.[name]);
}

const publicFiles = [
  "README.md",
  ".augment-plugin/marketplace.json",
  "plugins/asterline/.augment-plugin/plugin.json",
  "plugins/asterline/hooks/hooks.json",
  "plugins/asterline/.mcp.json",
  ...walk("plugins/asterline/skills"),
];
const publicRuntimeDirs = [
  "plugins/asterline/hooks/bin",
  "plugins/asterline/components/*/hooks",
  "plugins/asterline/components/*/skills",
  "plugins/asterline/components/comment-checker/dist",
  "plugins/asterline/components/git-bash/dist",
  "plugins/asterline/components/lsp/dist",
  "plugins/asterline/components/rules/dist",
  "plugins/asterline/components/telemetry/dist",
  "plugins/asterline/components/start-work-continuation/dist",
  "plugins/asterline/components/ultrawork/dist",
  "plugins/asterline/components/work-loop/dist",
  "plugins/asterline/mcp/ast_grep/dist",
  "plugins/asterline/mcp/git_bash/dist",
  "plugins/asterline/mcp/lsp/dist",
];
for (const dir of publicRuntimeDirs) {
  if (dir.includes("*")) {
    const [prefix, suffix] = dir.split("*");
    for (const name of readdirSync(abs(prefix.slice(0, -1)))) {
      const candidate = `${prefix}${name}${suffix}`;
      if (hasPath(candidate)) publicFiles.push(...walk(candidate));
    }
  } else {
    publicFiles.push(...walk(dir));
  }
}
for (const component of readdirSync(abs("plugins/asterline/components"))) {
  for (const name of ["README.md", "NOTICE", "package.json", "directive.md"]) {
    const path = `plugins/asterline/components/${component}/${name}`;
    if (hasPath(path)) publicFiles.push(path);
  }
}
for (const target of Object.values(pkg.bin ?? {})) {
  if (typeof target === "string") {
    const path = `plugins/asterline/${target.replace(/^\.\//, "")}`;
    publicFiles.push(path);
    assertNodeEntrypointLoads(path);
  }
}
for (const name of ["ast_grep", "lsp"]) {
  const path = mcpLocalEntrypoint(name, mcp.mcpServers?.[name]);
  if (path) {
    publicFiles.push(path);
    assertNodeEntrypointLoads(path);
  }
}
publicFiles.push(...walk("plugins/asterline/components/work-loop/dist"));
const forbidden = [
  "$omo:",
  "/omo:",
  "$lcx",
  "lcx-",
  "ulw-loop",
  "ulw-plan",
  "LazyCodex",
  "lazycodex",
  "lazycodex-ai",
  "omo-codex",
  "lazycodex-generated",
  "(omo)",
  "OmO",
  "OMO",
  "Codex",
  "codex",
  "CODEX",
  ".codex",
  "codex-",
  "openai/codex",
  "create_goal",
];
const forbiddenPatterns = [
  { label: "standalone omo", re: /(^|[^A-Za-z0-9_])omo([^A-Za-z0-9_]|$)/ },
  { label: ".omo path", re: /(^|[^A-Za-z0-9_])\.omo(\/|\b)/ },
  { label: "~/.omo path", re: /~\/\.omo(\/|\b)/ },
  { label: "call_omo_agent", re: /call_omo_agent/ },
  { label: "camel Codex identifier", re: /[A-Za-z]Codex|Codex[A-Za-z]/ },
];
for (const file of [...new Set(publicFiles)]) {
  const text = readFileSync(abs(file), "utf8");
  for (const token of forbidden) {
    if (text.includes(token)) fail(`${file}: forbidden public token ${token}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.re.test(text)) fail(`${file}: forbidden public pattern ${pattern.label}`);
  }
}

const packagePublicMetadata = JSON.stringify({
  name: pkg.name,
  description: pkg.description,
  bin: Object.keys(pkg.bin ?? {}),
});
for (const token of forbidden) {
  if (packagePublicMetadata.includes(token)) fail(`plugins/asterline/package.json: forbidden public metadata token ${token}`);
}
for (const pattern of forbiddenPatterns) {
  if (pattern.re.test(packagePublicMetadata)) {
    fail(`plugins/asterline/package.json: forbidden public metadata pattern ${pattern.label}`);
  }
}

if (hasPath("plugins/omo")) fail("old plugin tree must not exist");
if (hasPath("plugins/asterline/commands")) fail("commands directory should not exist");

if (failures.length > 0) {
  console.error("Asterline marketplace validation failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Asterline marketplace validation passed");
console.log(`skills=${skillDirs.length} runtime=${requiredRuntime.length}`);
