#!/usr/bin/env node

import { runAsterlineHookCli } from "./asterline-hook.js";

const [command, subcommand] = process.argv.slice(2);

if (command === "hook" && subcommand === "post-tool-use") {
	await runAsterlineHookCli();
} else {
	process.stderr.write("Usage: asterline-comment-checker hook post-tool-use\n");
	process.exitCode = 2;
}
