#!/usr/bin/env node
import { runGitBashHookCli } from "./asterline-hook.js";
const TOP_LEVEL_HELP = "Usage:\n  asterline-git-flow hook pre-tool-use\n  asterline-git-flow hook post-compact\n  asterline-git-flow help | --help | -h\n";
async function main() {
    const argv = process.argv.slice(2);
    const command = argv[0];
    if (command === undefined || command === "help" || command === "--help" || command === "-h") {
        process.stdout.write(TOP_LEVEL_HELP);
        return 0;
    }
    if (command === "hook" && argv[1] === "pre-tool-use") {
        await runGitBashHookCli(process.stdin, process.stdout, "pre-tool-use");
        return 0;
    }
    if (command === "hook" && argv[1] === "post-compact") {
        await runGitBashHookCli(process.stdin, process.stdout, "post-compact");
        return 0;
    }
    process.stderr.write(`[asterline-git-flow] unknown command: ${argv.join(" ")}\n${TOP_LEVEL_HELP}`);
    return 1;
}
main()
    .then((code) => {
    process.exit(code);
})
    .catch((error) => {
    process.stderr.write(`[asterline-git-flow] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
