#!/usr/bin/env node
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const banned = [
  "temporary " + "fix",
  "quick " + "hack",
  "magic",
  "obvious",
  "self explanatory",
];

function readStdin() {
  try {
    const stat = process.stdin.isTTY;
    if (stat) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const payload = args.has("--dry-run") ? "dry run" : readStdin();
const lower = payload.toLowerCase();
const hits = banned.filter((item) => lower.includes(item));

if (hits.length > 0) {
  console.error(`Asterline commentlint blocked vague comment text: ${hits.join(", ")}`);
  process.exit(1);
}

console.log("Asterline commentlint pass");
