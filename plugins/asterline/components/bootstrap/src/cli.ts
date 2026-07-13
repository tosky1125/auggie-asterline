#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runSessionStart } from "./hook.ts";
import { runWorker } from "./worker.ts";

const HELP = "Asterline bootstrap 4.17.1\nUsage: asterline-bootstrap hook session-start | worker [--once] [--data-root <absolute-path>] | help\n";

type WorkerFlags = { readonly once: boolean; readonly dataRoot?: string };

function parseWorkerFlags(args: readonly string[]): WorkerFlags {
	let once = false;
	let dataRoot: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--once") {
			once = true;
			continue;
		}
		if (value === "--data-root") {
			dataRoot = args[index + 1];
			if (dataRoot === undefined || dataRoot.startsWith("--")) throw new Error("--data-root requires a value");
			index += 1;
			continue;
		}
		throw new Error(`unknown worker option: ${value ?? ""}`);
	}
	return { once, ...(dataRoot === undefined ? {} : { dataRoot }) };
}

async function main(args: readonly string[]): Promise<number> {
	const command = args[0];
	if (command === undefined || command === "help" || command === "--help" || command === "-h") {
		process.stdout.write(HELP);
		return 0;
	}
	if (command === "hook" && args[1] === "session-start") {
		await runSessionStart({ env: process.env });
		return 0;
	}
	if (command === "worker") {
		const flags = parseWorkerFlags(args.slice(1));
		const result = await runWorker({ env: process.env, once: flags.once, ...(flags.dataRoot === undefined ? {} : { dataOverride: flags.dataRoot }) });
		process.stdout.write(`[asterline-bootstrap] ${result.kind === "ran" ? result.status : result.reason}\n`);
		return 0;
	}
	process.stderr.write(`[asterline-bootstrap] unknown command\n${HELP}`);
	return 1;
}

function isEntry(): boolean {
	const candidate = process.argv[1];
	if (candidate === undefined) return false;
	try {
		return realpathSync(candidate) === realpathSync(fileURLToPath(import.meta.url));
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

if (isEntry()) {
	main(process.argv.slice(2)).then(
		(code) => { process.exitCode = code; },
		(error: unknown) => {
			process.stderr.write(`[asterline-bootstrap] ${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 0;
		},
	);
}
