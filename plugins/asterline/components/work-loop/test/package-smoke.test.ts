// biome-ignore-all format: smoke test pulls verbatim JSON for structural assertion.
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readText(relative: string): Promise<string> {
	return readFile(join(repoRoot, relative), "utf8");
}

async function readJson(relative: string): Promise<unknown> {
	return JSON.parse(await readText(relative));
}

type ShellResult = {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
};

function bootstrapScriptFrom(text: string): string {
	const heading = text.indexOf("### 1. Create goals from the brief");
	expect(heading).toBeGreaterThanOrEqual(0);
	const blockStart = text.indexOf("```sh\n", heading);
	expect(blockStart).toBeGreaterThanOrEqual(0);
	const codeStart = blockStart + "```sh\n".length;
	const blockEnd = text.indexOf("\n```", codeStart);
	expect(blockEnd).toBeGreaterThan(codeStart);
	return text.slice(codeStart, blockEnd);
}

async function runShell(script: string, env: NodeJS.ProcessEnv): Promise<ShellResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn("/bin/sh", ["-c", script], { env });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (code) => {
			resolvePromise({
				code,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			});
		});
	});
}

describe("package.json", () => {
	it("declares ESM + Node >=20 without dependency installation metadata", async () => {
		const pkg = await readJson("package.json") as Record<string, unknown>;
		expect(pkg["type"]).toBe("module");
		expect(pkg["packageManager"]).toBeUndefined();
		expect(pkg["dependencies"]).toBeUndefined();
		expect(pkg["devDependencies"]).toBeUndefined();
		expect((pkg["engines"] as Record<string, unknown>)["node"]).toBe(">=20.0.0");
	});

	it("#given package metadata #when bin is inspected #then exposes the asterline-work-loop binary pointing at dist/cli.js", async () => {
		const pkg = await readJson("package.json") as Record<string, unknown>;
		const bin = pkg["bin"] as Record<string, string>;
		expect(bin["asterline-work-loop"]).toBe("./dist/cli.js");
	});

	it("ships the expected release files", async () => {
		const pkg = await readJson("package.json") as Record<string, unknown>;
		const files = pkg["files"] as readonly string[];
		expect(files).toContain("dist");
		expect(files).toContain("hooks");
		expect(files).toContain("skills");
		expect(files).not.toContain(".augment-plugin");
	});
});

describe("component plugin identity", () => {
	it("is owned by the aggregate ASTERLINE plugin root", async () => {
		await expect(readText(".augment-plugin/plugin.json")).rejects.toMatchObject({ code: "ENOENT" });
	});
});

describe("hooks/hooks.json", () => {
	it("registers only supported Auggie Stop without unsupported properties", async () => {
		const hooks = await readJson("hooks/hooks.json") as Record<string, unknown>;
		const events = hooks["hooks"] as Record<string, unknown>;
		expect(Object.keys(events)).toEqual(["Stop"]);
		expect(JSON.stringify(events)).not.toContain("matcher");
		expect(JSON.stringify(events)).not.toContain("statusMessage");
	});
});

describe("src/cli.ts", () => {
	it("starts with #!/usr/bin/env node shebang", async () => {
		const text = await readText("src/cli.ts");
		expect(text.split("\n")[0]).toBe("#!/usr/bin/env node");
	});
});

describe("skills/work-loop/SKILL.md", () => {
	it("exists", async () => {
		const info = await stat(join(repoRoot, "skills/work-loop/SKILL.md"));
		expect(info.isFile()).toBe(true);
	});

	it("#given Asterline skill hinting #when work-loop skill metadata is inspected #then work-loop is the primary mention name", async () => {
		const text = await readText("skills/work-loop/SKILL.md");

		expect(text).toMatch(/^---\nname: work-loop\n/m);
	});

	it("#given Asterline dollar hinting #when querying work-loop #then work-loop surfaces the work-loop alias", async () => {
		const text = await readText("skills/work-loop/agents/openai.yaml");

		expect(text).toContain('display_name: "work-loop (asterline)"');
		expect(text).not.toContain("work-loop / work-loop");
		expect(text).toContain('short_description: "Durable evidence-bound work loop"');
		expect(text).toContain("Use $work-loop");
	});

	it("#given Asterline dollar hinting #when querying work-loop #then work-loop remains discoverable as an alias", async () => {
		const text = await readText("skills/work-loop/agents/openai.yaml");

		expect(text).toContain("search_terms:");
		expect(text).toContain('- "work-loop"');
	});

	it("#given the marketplace payload #when bootstrap runs #then it invokes the installed work-loop bundle", async () => {
		const text = await readText("skills/work-loop/references/full-workflow.md");
		const bootstrap = bootstrapScriptFrom(text);
		const root = await mkdtemp(join(tmpdir(), "asterline-work-loop-bootstrap-"));
		try {
			const badBin = join(root, "bad-bin");
			const home = join(root, "home");
			const installedCli = join(home, ".augment", "plugins", "marketplaces", "auggie-asterline", "plugins", "asterline", "components", "work-loop", "dist", "cli.js");
			await mkdir(badBin, { recursive: true });
			await mkdir(dirname(installedCli), { recursive: true });
			await writeFile(join(badBin, "asterline"), "#!/bin/sh\nprintf '%s\\n' \"error: unknown command 'work-loop'\" >&2\nexit 1\n");
			await chmod(join(badBin, "asterline"), 0o755);
			await writeFile(
				installedCli,
				[
					"#!/usr/bin/env node",
					"const args = process.argv.slice(2);",
					"if (args[0] === 'work-loop' && args[1] === 'help') process.exit(0);",
					"if (args[0] === 'work-loop' && args[1] === 'status' && args.includes('--json')) {",
					"  console.log(JSON.stringify({ ok: true, source: 'installed-work-loop' }));",
					"  process.exit(0);",
					"}",
					"console.error('unexpected args: ' + args.join(' '));",
					"process.exit(1);",
					"",
				].join("\n"),
			);

			const result = await runShell(`${bootstrap}\nwork_loop status --json`, {
				...process.env,
				HOME: home,
				PATH: `${badBin}:${process.env["PATH"] ?? ""}`,
			});

			expect(result.code).toBe(0);
			expect(result.stdout).toContain('"source":"installed-work-loop"');
			expect(result.stderr).not.toContain("unknown command");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

});

describe("source LOC budget", () => {
	it("every source file stays at or under 250 pure LOC", async () => {
		const files = [
			"src/types.ts", "src/paths.ts", "src/plan-io.ts", "src/plan-crud.ts", "src/goal-status.ts",
			"src/evidence.ts", "src/quality-gate.ts", "src/checkpoint.ts", "src/review-blockers.ts",
			"src/steering.ts", "src/host-goal-instruction.ts", "src/host-goal-snapshot.ts", "src/asterline-hook.ts",
			"src/cli.ts", "src/cli-arg-parser.ts", "src/cli-output.ts", "src/cli-steering.ts", "src/cli-commands.ts",
		];
		for (const file of files) {
			const text = await readText(file);
			const pure = text.split("\n").filter((line) => {
				const trimmed = line.trim();
				return trimmed.length > 0 && !trimmed.startsWith("//");
			}).length;
			expect(pure, `${file} pure LOC`).toBeLessThanOrEqual(250);
		}
	});
});
