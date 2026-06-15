#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (error) {
    fail(`${path}: invalid JSON: ${error.message}`);
    return null;
  }
}

function exists(path) {
  try {
    statSync(join(root, path));
    return true;
  } catch {
    fail(`${path}: missing`);
    return false;
  }
}

function hasPath(path) {
  try {
    statSync(join(root, path));
    return true;
  } catch {
    return false;
  }
}

function filesIn(path, suffix = ".md") {
  const abs = join(root, path);
  try {
    return readdirSync(abs)
      .filter((name) => name.endsWith(suffix))
      .sort();
  } catch (error) {
    fail(`${path}: cannot read: ${error.message}`);
    return [];
  }
}

function walk(path) {
  const abs = join(root, path);
  let out = [];
  for (const name of readdirSync(abs)) {
    const item = join(abs, name);
    const rel = relative(root, item);
    const info = statSync(item);
    if (info.isDirectory()) {
      out = out.concat(walk(rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const marketplace = readJson(".augment-plugin/marketplace.json");
const plugin = readJson("plugins/asterline/.augment-plugin/plugin.json");
readJson("plugins/asterline/.mcp.json");
const hooks = readJson("plugins/asterline/hooks/hooks.json");

for (const path of [
  "README.md",
  ".augment-plugin/marketplace.json",
  "plugins/asterline/.augment-plugin/plugin.json",
  "plugins/asterline/.mcp.json",
  "plugins/asterline/hooks/hooks.json",
  "plugins/asterline/hooks/commentlint.mjs",
]) {
  exists(path);
}

if (marketplace) {
  if (marketplace.name !== "auggie-asterline") fail("marketplace name mismatch");
  const entry = marketplace.plugins?.[0];
  if (entry?.name !== "asterline") fail("marketplace plugin name mismatch");
  if (entry?.source !== "./plugins/asterline") fail("marketplace source mismatch");
}

if (plugin) {
  if (plugin.name !== "asterline") fail("plugin name mismatch");
  for (const key of ["skills", "agents", "rules", "hooks", "mcpServers"]) {
    if (!plugin[key]) fail(`plugin manifest missing ${key}`);
  }
  if (plugin.commands) fail("plugin manifest should not expose commands");
}

if (hooks) {
  for (const [event, entries] of Object.entries(hooks.hooks ?? {})) {
    if (!Array.isArray(entries)) {
      fail(`hooks.${event}: expected array`);
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      if (typeof entry.matcher === "string") {
        try {
          new RegExp(entry.matcher);
        } catch (error) {
          fail(`hooks.${event}.${index}.matcher invalid regex: ${error.message}`);
        }
      }
    }
  }
}

const agentFiles = filesIn("plugins/asterline/agents");
const ruleFiles = filesIn("plugins/asterline/rules");
const skillDirs = readdirSync(join(root, "plugins/asterline/skills"))
  .filter((name) => statSync(join(root, "plugins/asterline/skills", name)).isDirectory())
  .sort();

if (hasPath("plugins/asterline/commands")) fail("commands directory should not exist");
if (agentFiles.length !== 6) fail(`expected 6 agents, found ${agentFiles.length}`);
if (ruleFiles.length < 3) fail(`expected at least 3 rules, found ${ruleFiles.length}`);
if (skillDirs.length !== 13) fail(`expected 13 skills, found ${skillDirs.length}`);

const expectedSkills = [
  "atlas",
  "blueprint",
  "cleanroom",
  "codestyle",
  "commentlint",
  "deepmap",
  "inspect",
  "pixelproof",
  "refinery",
  "ruleweaver",
  "run",
  "symbolwire",
  "tracebug",
];
for (const skill of expectedSkills) {
  if (!skillDirs.includes(skill)) fail(`missing skill ${skill}`);
}
if (skillDirs.includes("runbook")) fail("runbook skill should be renamed to run");

for (const skill of skillDirs) {
  exists(`plugins/asterline/skills/${skill}/SKILL.md`);
}

const legacyLower = ["o", "m", "o"].join("");
const legacyTitle = ["O", "m", "O"].join("");
const oldProjectName = ["Lazy", "Codex"].join("");
const oldAgentCall = ["call", legacyLower, "agent"].join("_");
const forbidden = [
  legacyLower,
  legacyTitle,
  `$${legacyLower}`,
  `/${legacyLower}:`,
  oldProjectName,
  ["Cod", "ex"].join(""),
  ["multi", "agent", "v1"].join("_"),
  ["agent", "type"].join("_"),
  ["fork", "context"].join("_"),
  oldAgentCall,
  `task(${["subagent", "type"].join("_")}`,
  ["team", ""].join("_"),
  ["lcx", ""].join("-"),
];
const scanned = [
  "README.md",
  ".augment-plugin",
  "plugins/asterline",
].flatMap((path) => {
  const abs = join(root, path);
  const info = statSync(abs);
  return info.isDirectory() ? walk(path) : [path];
});

for (const file of scanned) {
  const text = readFileSync(join(root, file), "utf8");
  for (const token of forbidden) {
    if (text.includes(token)) fail(`${file}: forbidden token ${token}`);
  }
}

if (hasPath(join("plugins", legacyLower))) fail("old plugin tree must not exist");

if (failures.length > 0) {
  console.error("Asterline marketplace validation failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Asterline marketplace validation passed");
console.log(`agents=${agentFiles.length} rules=${ruleFiles.length} skills=${skillDirs.length}`);
