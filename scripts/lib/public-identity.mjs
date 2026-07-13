import { readFileSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  "$omo:", "/omo:", "$lcx", "lcx-", "ulw-loop", "ulw-plan", "LazyCodex", "lazycodex",
  "lazycodex-ai", "omo-codex", "lazycodex-generated", "(omo)", "OmO", "OMO", "Codex",
  "codex", "CODEX", ".codex", "codex-", "openai/codex", "create_goal",
];
const forbiddenPatterns = [
  { label: "standalone omo", re: /(^|[^A-Za-z0-9_])omo([^A-Za-z0-9_]|$)/ },
  { label: ".omo path", re: /(^|[^A-Za-z0-9_])\.omo(\/|\b)/ },
  { label: "~/.omo path", re: /~\/\.omo(\/|\b)/ },
  { label: "call_omo_agent", re: /call_omo_agent/ },
  { label: "camel Codex identifier", re: /[A-Za-z]Codex|Codex[A-Za-z]/ },
];

const exempt = (file) => file.endsWith("/ATTRIBUTION.md") || file.endsWith("/NOTICE") || file.startsWith("plugins/asterline/skills/session-history/");

export function scanPublicIdentity(root, files, fail) {
  for (const file of [...new Set(files)]) {
    if (exempt(file)) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const token of forbidden) {
      if (text.includes(token)) fail(`${file}: forbidden public token ${token}`);
    }
    for (const pattern of forbiddenPatterns) {
      if (pattern.re.test(text)) fail(`${file}: forbidden public pattern ${pattern.label}`);
    }
  }
}

export function scanPublicMetadata(label, value, fail) {
  for (const token of forbidden) {
    if (value.includes(token)) fail(`${label}: forbidden public metadata token ${token}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.re.test(value)) fail(`${label}: forbidden public metadata pattern ${pattern.label}`);
  }
}
