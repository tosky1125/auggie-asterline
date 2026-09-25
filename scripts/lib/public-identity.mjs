import { readFileSync } from "node:fs";
import { join } from "node:path";

const legacyStem = ["om", "o"].join("");
const forbidden = [
  `$${legacyStem}:`, `/${legacyStem}:`, "$lcx", "lcx-", "ulw-loop", "ulw-plan", "LazyCodex", "lazycodex",
  "lazycodex-ai", `${legacyStem}-codex`, "lazycodex-generated", `(${legacyStem})`, "O" + "m" + "O", "OM" + "O", "Codex",
  "codex", "CODEX", ".codex", "codex-", "openai/codex", "create_goal",
];
const forbiddenPatterns = [
  { label: "standalone legacy stem", re: new RegExp(`(^|[^A-Za-z0-9_])${legacyStem}([^A-Za-z0-9_]|$)`) },
  { label: "legacy dot path", re: new RegExp(`(^|[^A-Za-z0-9_])\\.${legacyStem}(\\/|\\b)`) },
  { label: "home legacy dot path", re: new RegExp(`~\\/\\.${legacyStem}(\\/|\\b)`) },
  { label: "legacy agent call", re: new RegExp(`call_${legacyStem}_agent`) },
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
