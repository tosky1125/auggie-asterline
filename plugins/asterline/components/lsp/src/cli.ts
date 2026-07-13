#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { disposeDefaultLspManager, runMcpStdioProxy } from "../../../mcp/lsp/dist/index.js";

import { runPostToolUseHookCli } from "./asterline-hook-cli.js";

const USAGE = "Usage: asterline-lsp [mcp | hook post-tool-use]\n";

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
	const [command = "mcp", subcommand = ""] = args;
	if (command === "hook" && subcommand === "post-tool-use") {
		await runPostToolUseHookCli();
		return 0;
	}
	if (command === "mcp" && subcommand.length === 0) {
		try {
			await runMcpStdioProxy();
		} finally {
			await disposeDefaultLspManager();
		}
		return 0;
	}
	process.stderr.write(USAGE);
	return 2;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
