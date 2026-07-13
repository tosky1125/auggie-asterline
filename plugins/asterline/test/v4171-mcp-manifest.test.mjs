import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("../.mcp.json", import.meta.url);
const installedRoot =
  "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline";
const expectedNames = ["ast_grep", "codegraph", "context7", "grep_app", "lsp"];
const packageManagers = /\b(?:npm|npx|pnpm|yarn|bun|bunx)\b/u;

async function readManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

function assertExactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}

test("registers the exact LazyCodex 4.17.1 MCP inventory for Auggie", async () => {
  const manifest = await readManifest();

  assertExactKeys(manifest, ["mcpServers"], "top-level MCP schema drifted");
  assertExactKeys(
    manifest.mcpServers,
    expectedNames,
    "Asterline MCP inventory must match the supported v4.17.1 port",
  );
});

test("uses Auggie's explicit HTTP transport schema for remote MCPs", async () => {
  const { mcpServers } = await readManifest();
  const expectedRemote = {
    context7: "https://mcp.context7.com/mcp",
    grep_app: "https://mcp.grep.app",
  };

  for (const [name, url] of Object.entries(expectedRemote)) {
    const server = mcpServers[name];
    assertExactKeys(server, ["type", "url"], `${name} has unsupported fields`);
    assert.equal(server.type, "http", `${name} must opt into Streamable HTTP`);
    assert.equal(server.url, url);
  }
});

test("keeps every local MCP self-contained at the installed marketplace path", async () => {
  const { mcpServers } = await readManifest();
  const expectedEntries = {
    ast_grep: `${installedRoot}/mcp/ast_grep/dist/cli.js\" mcp`,
    codegraph: `${installedRoot}/mcp/codegraph/dist/serve.js\"`,
    lsp: `${installedRoot}/mcp/lsp/dist/cli.js\" mcp`,
  };

  for (const [name, pathFragment] of Object.entries(expectedEntries)) {
    const server = mcpServers[name];
    assertExactKeys(server, ["args", "command"], `${name} has unsupported fields`);
    assert.equal(server.command, "bash");
    assert.equal(server.args.length, 2);
    assert.equal(server.args[0], "-lc");
    assert.match(server.args[1], /^exec node /u);
    assert.ok(server.args[1].includes(pathFragment), `${name} path drifted`);
    assert.doesNotMatch(server.args.join(" "), packageManagers);
  }
});

test("rejects the legacy untyped HTTP shape as malformed for this contract", () => {
  const legacyServer = { url: "https://mcp.grep.app" };

  assert.notEqual(legacyServer.type, "http");
  assert.throws(
    () => {
      assertExactKeys(legacyServer, ["type", "url"], "missing explicit transport");
    },
    /missing explicit transport/u,
  );
});

test("does not register the platform-specific git_bash payload", async () => {
  const manifestText = await readFile(manifestUrl, "utf8");

  assert.doesNotMatch(manifestText, /git_bash/u);
});
