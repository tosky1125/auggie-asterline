#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(runtimeRoot, "../../..");
const repository = process.argv[2];
if (repository === undefined || process.argv.length !== 3) {
  process.stderr.write("Usage: node build-ast-grep.mjs <lazycodex-v4.10.0-repository>\n");
  process.exit(2);
}

const staging = mkdtempSync(join(tmpdir(), "asterline-ast-grep-source-"));
try {
  const materialized = join(staging, "materialized");
  const result = spawnSync(process.execPath, [
    join(pluginRoot, "scripts/materialize-upstream.mjs"),
    "--lock", join(runtimeRoot, "upstream-lock.json"),
    "--destination", materialized,
    "--repository", `lazycodex-v410=${resolve(repository)}`,
  ], { encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());

  const source = readFileSync(join(materialized, "legacy/ast-grep-mcp/dist/cli.js"), "utf8");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (sourceHash !== "ee377792c4c37cb19b7474d57b384ff4c8ec3684264a64d873c82d74f8b96ac7") {
    throw new Error(`source checksum mismatch: ${sourceHash}`);
  }
  const transforms = [
    ['from "fs"', 'from "node:fs"'],
    ['"omo-ast-grep-mcp.log"', '"asterline-ast-grep-mcp.log"'],
    ['"OMO_AST_GREP_SG_PATH"', '"ASTERLINE_AST_GREP_SG_PATH"'],
    ['const codexHome = nonEmptyValue(env["CODEX_HOME"]) ?? join2(homedir(), ".codex");', 'const asterlineHome = nonEmptyValue(env["ASTERLINE_HOME"]) ?? join2(homedir(), ".asterline");'],
    ['join2(codexHome, "runtime", "ast-grep"', 'join2(asterlineHome, "runtime", "ast-grep"'],
    ['"OMO_AST_GREP_DISABLED_TOOLS"', '"ASTERLINE_AST_GREP_DISABLED_TOOLS"'],
    ['process.env.OMO_AST_GREP_WORKSPACE', 'process.env.ASTERLINE_AST_GREP_WORKSPACE'],
    ['Usage: omo-ast-grep [mcp]', 'Usage: asterline-ast-grep [mcp]'],
    ['` + `Install options:\n` + `  bun add -D @ast-grep/cli\n` + `  cargo install ast-grep --locked\n` + `  brew install ast-grep`', '` + `Provision sg through the checksum-pinned Asterline bootstrap.`'],
    ['var runtime = globalThis;\nvar IS_BUN = typeof runtime.Bun !== "undefined";', ''],
    ['function wrapBunProcess(proc) {\n  return {\n    ...proc,\n    stdout: proc.stdout ?? emptyReadableStream(),\n    stderr: proc.stderr ?? emptyReadableStream()\n  };\n}\n', ''],
    ['  if (IS_BUN)\n    return wrapBunProcess(runtime.Bun.spawn(cmd, options));\n', ''],
  ];
  let output = source;
  for (const [from, to] of transforms) {
    const count = output.split(from).length - 1;
    if (count !== 1) throw new Error(`expected one transform match for ${JSON.stringify(from)}, found ${count}`);
    output = output.replace(from, to);
  }
  writeFileSync(join(pluginRoot, "mcp/ast_grep/dist/cli.js"), output, { mode: 0o755 });
  process.stdout.write(`${createHash("sha256").update(output).digest("hex")}\n`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
