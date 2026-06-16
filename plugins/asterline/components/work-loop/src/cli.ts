#!/usr/bin/env node
import { isWorkLoopSubcommand, workLoopCommand } from "./cli-commands.js";
import { runPreToolUseGoalBudgetGuardCli, runWorkLoopHookCli } from "./asterline-hook.js";

const TOP_LEVEL_HELP =
	"Usage:\n  asterline work-loop <subcommand> [args]\n  asterline hook user-prompt-submit         (Asterline UserPromptSubmit hook)\n  asterline help | --help | -h              (this message)\n\nRun `asterline work-loop help` for work-loop subcommands.\n";

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const command = argv[0];
	if (command === undefined || command === "help" || command === "--help" || command === "-h") {
		process.stdout.write(TOP_LEVEL_HELP);
		return 0;
	}
	if (command === "work-loop") return workLoopCommand(argv.slice(1));
	if (command === "hook") {
		const sub = argv[1];
		if (sub === "user-prompt-submit") {
			await runWorkLoopHookCli(process.stdin, process.stdout);
			return 0;
		}
		if (sub === "pre-tool-use") {
			await runPreToolUseGoalBudgetGuardCli(process.stdin, process.stdout);
			return 0;
		}
		process.stderr.write(`[asterline] unknown hook subcommand: ${sub ?? "(none)"}\n`);
		return 1;
	}
	if (isWorkLoopSubcommand(command)) return workLoopCommand(argv);
	process.stderr.write(`[asterline] unknown command: ${command}\n${TOP_LEVEL_HELP}`);
	return 1;
}

main()
	.then((code) => {
		process.exit(code);
	})
	.catch((error: unknown) => {
		process.stderr.write(`[asterline] ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	});
