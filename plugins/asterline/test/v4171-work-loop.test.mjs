import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const componentRoot = join(pluginRoot, "components", "work-loop");
const cli = join(componentRoot, "dist", "cli.js");

const run = (cwd, args, env = {}, input = null) =>
	new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, [cli, ...args], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
		child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
		child.once("error", reject);
		child.once("close", (code) => resolveRun({ code, stdout, stderr }));
		child.stdin.end(input);
	});

const runSynchronized = (cwd, args, startAt, input) =>
	new Promise((resolveRun, reject) => {
		const script = `const delay=Math.max(0,Number(process.env.START_AT)-Date.now());Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,delay);process.argv=${JSON.stringify([process.execPath, cli, ...args])};await import(${JSON.stringify(pathToFileURL(cli).href)});`;
		const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { cwd, env: { ...process.env, START_AT: String(startAt) }, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = ""; let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
		child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
		child.once("error", reject);
		child.once("close", (code) => resolveRun({ code, stdout, stderr }));
		child.stdin.end(input);
	});

test("Given the v4.17.1 component When inspecting the package Then release bundling is self-contained", async () => {
	// Given / When
	const packageJson = JSON.parse(await readFile(join(componentRoot, "package.json"), "utf8"));
	const recipe = JSON.parse(await readFile(join(componentRoot, "runtime", "work-loop.build.json"), "utf8"));

	// Then
	assert.equal(packageJson.version, "4.17.1");
	assert.equal(packageJson.scripts.build, "node runtime/build-work-loop.mjs");
	assert.equal(recipe.toolchain.command, "bun");
	assert.deepEqual(recipe.entries, [{ source: "work-loop/src/cli.ts", output: "cli.js", executable: true }]);
	assert.deepEqual(recipe.aliases, []);
});

test("Given concurrent CLI writers When adding goals Then every mutation is durable", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-concurrent-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Deliver one safe runtime change", "--json"])).code, 0);

	// When
	const writes = await Promise.all(Array.from({ length: 8 }, (_, index) => run(cwd, [
		"work-loop", "add-goal", "--title", `Concurrent ${index}`, "--objective", `Preserve mutation ${index}`, "--json",
	])));

	// Then
	assert.ok(writes.every((result) => result.code === 0), writes.map((result) => result.stderr).join("\n"));
	const plan = JSON.parse(await readFile(join(cwd, ".asterline", "work-loop", "goals.json"), "utf8"));
	assert.equal(plan.goals.length, 9);
	assert.equal(new Set(plan.goals.map((goal) => goal.title)).size, 9);
});

test("Given repeated steering When an idempotency key matches Then the ledger stays compact and the mutation dedupes", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-steering-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", `Compact ${"evidence ".repeat(2_000)}`, "--json"])).code, 0);
	const args = [
		"work-loop", "steer", "--kind", "add_subgoal", "--title", "Bounded addition", "--objective", "Add one verified goal",
		"--evidence", "dependency discovered", "--rationale", "required for delivery", "--idempotency-key", "stable-1", "--json",
	];

	// When
	const first = await run(cwd, args);
	const second = await run(cwd, args);

	// Then
	assert.equal(first.code, 0, first.stderr);
	assert.equal(second.code, 0, second.stderr);
	assert.equal(JSON.parse(second.stdout).deduped, true);
	const plan = JSON.parse(await readFile(join(cwd, ".asterline", "work-loop", "goals.json"), "utf8"));
	assert.equal(plan.goals.length, 2);
	const lines = (await readFile(join(cwd, ".asterline", "work-loop", "ledger.jsonl"), "utf8")).trim().split("\n");
	const steer = JSON.parse(lines.at(-1));
	assert.equal(steer.steering.before.goalCount, 1);
	assert.equal(steer.steering.after.goalCount, 2);
	assert.equal(Object.hasOwn(steer, "before"), false);
	assert.ok(lines.at(-1).length < 10_000);
});

test("Given a stale mutation lock When a command runs Then the lock is recovered and cleaned", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-stale-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Recover stale state", "--json"])).code, 0);
	const lock = join(cwd, ".asterline", "work-loop", ".mutation.lock");
	await writeFile(lock, JSON.stringify({ pid: 999999, createdAt: "2000-01-01T00:00:00.000Z" }));

	// When
	const result = await run(cwd, ["work-loop", "add-goal", "--title", "Recovered", "--objective", "Continue safely", "--json"]);

	// Then
	assert.equal(result.code, 0, result.stderr);
	await assert.rejects(stat(lock), { code: "ENOENT" });
});

test("Given malformed or colliding session identifiers When creating state Then the boundary rejects them", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-session-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));

	// When
	const traversal = await run(cwd, ["work-loop", "create-goals", "--brief", "Stay contained", "--session-id", "../../escape", "--json"]);
	const separator = await run(cwd, ["work-loop", "create-goals", "--brief", "Stay contained", "--session-id", "a/b", "--json"]);

	// Then
	assert.equal(traversal.code, 1);
	assert.equal(separator.code, 1);
	assert.match(`${traversal.stdout}${separator.stdout}`, /WORK_LOOP_SESSION_ID_INVALID/u);
});

test("Given a symlinked state root When creating a plan Then no file is written outside the repository", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-symlink-"));
	const outside = await mkdtemp(join(tmpdir(), "asterline-work-loop-outside-"));
	t.after(() => Promise.all([rm(cwd, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
	await symlink(outside, join(cwd, ".asterline"));

	// When
	const result = await run(cwd, ["work-loop", "create-goals", "--brief", "Stay in repository", "--json"]);

	// Then
	assert.equal(result.code, 1);
	assert.match(result.stdout, /WORK_LOOP_PATH_UNSAFE/u);
	await assert.rejects(stat(join(outside, "work-loop", "goals.json")), { code: "ENOENT" });
});

test("Given malformed durable state When reading status Then the CLI returns a typed error without mutation", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-malformed-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Keep state parseable", "--json"])).code, 0);
	const path = join(cwd, ".asterline", "work-loop", "goals.json");
	await writeFile(path, "{broken", "utf8");

	// When
	const result = await run(cwd, ["work-loop", "status", "--json"]);

	// Then
	assert.equal(result.code, 1);
	assert.match(result.stdout, /WORK_LOOP_PLAN_INVALID/u);
	assert.equal(await readFile(path, "utf8"), "{broken");
});

test("Given Auggie session steering When the CLI accepts it Then the public id is prefixed and only supported Stop is registered", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-auggie-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Track Auggie identity", "--session-id", "session-1", "--json"])).code, 0);
	const payload = JSON.stringify({
		cwd,
		hook_event_name: "UserPromptSubmit",
		prompt: 'ASTERLINE_WORK_LOOP_STEER: {"kind":"annotate_ledger","source":"user_prompt_submit","evidence":"observed","rationale":"record identity"}',
		session_id: "session-1",
	});

	// When
	const result = await run(cwd, ["hook", "user-prompt-submit"], {}, payload);
	const hooks = JSON.parse(await readFile(join(componentRoot, "hooks", "hooks.json"), "utf8"));

	// Then
	assert.equal(result.code, 0, result.stderr);
	assert.equal(JSON.parse(result.stdout).sessionId, "auggie:session-1");
	assert.deepEqual(Object.keys(hooks.hooks), ["Stop"]);
	assert.equal(hooks.hooks.Stop[0].hooks[0].command, 'node "${PLUGIN_ROOT}/dist/cli.js" hook stop');
	assert.equal(Object.hasOwn(hooks.hooks.Stop[0], "matcher"), false);
	assert.equal(Object.hasOwn(hooks.hooks.Stop[0].hooks[0], "statusMessage"), false);
});

test("Given an unfinished scoped goal When Auggie stops without progress Then continuation caps at two and leaves a stuck receipt", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-stop-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const session = "session-stop";
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Finish observable work", "--session-id", session, "--json"])).code, 0);
	assert.equal((await run(cwd, ["work-loop", "complete-goals", "--session-id", session, "--json"])).code, 0);
	const transcript = join(cwd, "transcript.jsonl");
	await writeFile(transcript, "", "utf8");
	const payload = JSON.stringify({ hook_event_name: "Stop", session_id: session, cwd, transcript_path: transcript, stop_hook_active: false });

	// When
	const first = await run(cwd, ["hook", "stop"], {}, payload);
	const second = await run(cwd, ["hook", "stop"], {}, payload);
	const third = await run(cwd, ["hook", "stop"], {}, payload);

	// Then
	assert.equal(JSON.parse(first.stdout).decision, "block");
	assert.match(JSON.parse(first.stdout).reason, /\.augment\/plugins\/marketplaces\/auggie-asterline\/plugins\/asterline\/components\/work-loop\/dist\/cli\.js/u);
	assert.doesNotMatch(JSON.parse(first.stdout).reason, /asterline (?:work-loop|sparkshell)/u);
	assert.match(JSON.parse(second.stdout).reason, /auggie:session-stop/u);
	assert.equal(third.stdout, "");
	const goalId = JSON.parse(await readFile(join(cwd, ".asterline", "work-loop", session, "goals.json"), "utf8")).activeGoalId;
	assert.match(await readFile(join(cwd, ".asterline", "work-loop", session, `auto-continue-${goalId}.stuck`), "utf8"), /2 continuations/u);
});

test("Given concurrent Stop hooks When they consume one continuation budget Then at most two block", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-stop-race-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const session = "session-race";
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Serialize continuation", "--session-id", session, "--json"])).code, 0);
	assert.equal((await run(cwd, ["work-loop", "complete-goals", "--session-id", session, "--json"])).code, 0);
	const transcript = join(cwd, "transcript.jsonl");
	await writeFile(transcript, "", "utf8");
	const payload = JSON.stringify({ hook_event_name: "Stop", session_id: session, cwd, transcript_path: transcript, stop_hook_active: false });

	const startAt = Date.now() + 1_000;
	const results = await Promise.all(Array.from({ length: 12 }, () => runSynchronized(cwd, ["hook", "stop"], startAt, payload)));
	const blocked = results.filter((result) => result.stdout !== "" && JSON.parse(result.stdout).decision === "block");
	assert.equal(blocked.length, 2);
	assert.ok(results.every((result) => result.code === 0), results.map((result) => result.stderr).join("\n"));
});

test("Given active run-plan work for the same Auggie id When Stop fires Then work-loop defers without consuming its budget", async (t) => {
	// Given
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-run-plan-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const session = "session-plan";
	assert.equal((await run(cwd, ["work-loop", "create-goals", "--brief", "Defer to run-plan", "--session-id", session, "--json"])).code, 0);
	await mkdir(join(cwd, ".asterline", "plans"), { recursive: true });
	await writeFile(join(cwd, ".asterline", "plans", "active.md"), "- [ ] remaining\n", "utf8");
	await writeFile(join(cwd, ".asterline", "boulder.json"), JSON.stringify({ works: { one: { status: "active", session_ids: [`auggie:${session}`], active_plan: ".asterline/plans/active.md" } } }), "utf8");
	const transcript = join(cwd, "transcript.jsonl");
	await writeFile(transcript, "", "utf8");

	// When
	const result = await run(cwd, ["hook", "stop"], {}, JSON.stringify({ hook_event_name: "Stop", session_id: session, cwd, transcript_path: transcript, stop_hook_active: false }));

	// Then
	assert.equal(result.stdout, "");
	await assert.rejects(stat(join(cwd, ".asterline", "work-loop", session, "auto-continue-G001-defer-to-run-plan.json")), { code: "ENOENT" });
});

test("Given the installed work-loop skill When inspected Then it uses current Asterline names and parallel-only Auggie limits", async () => {
	// Given / When
	const skillRoot = join(componentRoot, "skills", "work-loop");
	const text = `${await readFile(join(componentRoot, "README.md"), "utf8")}\n${await readFile(join(skillRoot, "SKILL.md"), "utf8")}\n${await readFile(join(skillRoot, "references", "full-workflow.md"), "utf8")}`;

	// Then
	for (const name of ["work-loop", "deep-work", "run-plan", "review-pass", "debug-trace", "team-mode"]) assert.match(text, new RegExp(`\\b${name}\\b`, "u"));
	assert.doesNotMatch(text, /multi_agent_v1|spawn_agent|wait_agent|close_agent|ultrawork|ulw-loop|ai-slop-cleaner/u);
	assert.match(text, /parallel task decomposition only/u);
	assert.match(text, /does not (?:provide|promise)[^\n]*(?:messaging|resumption|threads)/u);
	assert.doesNotMatch(text, /asterline (?:work-loop|sparkshell)/u);
	assert.match(text, /\.augment\/plugins\/marketplaces\/auggie-asterline\/plugins\/asterline\/components\/work-loop\/dist\/cli\.js/u);
});

test("Given the committed runtime When hashed repeatedly Then it is reproducible and contains no external runtime imports", async () => {
	// Given / When
	const first = await readFile(cli);
	const second = await readFile(cli);
	const text = first.toString("utf8");

	// Then
	assert.equal(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
	assert.doesNotMatch(text, /(?:from|import\s*\()\s*["'](?!node:|[./])/u);
	assert.doesNotMatch(text, /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|exec|run)\b/u);
});

test("Given a v2 aggregate plan When an intermediate goal completes Then only essential criteria gate progress", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-essential-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const created = await run(cwd, ["work-loop", "create-goals", "--brief", "- First deliverable\n- Second deliverable", "--json"]);
	assert.equal(created.code, 0, created.stderr);
	const plan = JSON.parse(created.stdout).plan;
	assert.equal(plan.evidenceLayoutVersion, 2);
	assert.deepEqual(plan.goals[0].successCriteria.map((criterion) => criterion.essential), [true, true, false]);
	assert.equal((await run(cwd, ["work-loop", "complete-goals", "--json"])).code, 0);
	for (const criterionId of ["C001", "C002"]) {
		const captured = await run(cwd, ["work-loop", "record-evidence", "--goal-id", plan.goals[0].id, "--criterion-id", criterionId, "--status", "pass", "--evidence", `${criterionId} verified`, "--json"]);
		assert.equal(captured.code, 0, captured.stderr);
	}
	const checkpoint = await run(cwd, ["work-loop", "checkpoint", "--goal-id", plan.goals[0].id, "--status", "complete", "--evidence", "implementation complete and validation passed", "--host-goal-json", JSON.stringify({ goal: { objective: plan.asterlineObjective, status: "active" } }), "--json"]);
	assert.equal(checkpoint.code, 0, checkpoint.stderr);
	assert.equal(JSON.parse(checkpoint.stdout).goal.status, "complete");
});

test("Given a final v2 checkpoint When gate artifacts are stale or current Then containment rejects stale and accepts current", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "asterline-work-loop-gate-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const created = JSON.parse((await run(cwd, ["work-loop", "create-goals", "--brief", "Final verified delivery", "--session-id", "gate-session", "--json"])).stdout).plan;
	const goal = created.goals[0];
	assert.equal((await run(cwd, ["work-loop", "complete-goals", "--session-id", "gate-session", "--json"])).code, 0);
	for (const criterionId of ["C001", "C002", "C003"]) assert.equal((await run(cwd, ["work-loop", "record-evidence", "--goal-id", goal.id, "--criterion-id", criterionId, "--status", "pass", "--evidence", `${criterionId} verified`, "--session-id", "gate-session", "--json"])).code, 0);
	const status = JSON.parse((await run(cwd, ["work-loop", "status", "--session-id", "gate-session", "--json"])).stdout);
	assert.match(status.currentAttemptDir, /\.asterline\/evidence\/work-loop\/gate-session\/.*\/a1$/u);
	await mkdir(join(cwd, status.currentAttemptDir), { recursive: true });
	for (const name of ["code.md", "gate.md", "qa.log"]) await writeFile(join(cwd, status.currentAttemptDir, name), `${name} verified\n`);
	await writeFile(join(cwd, "stale.log"), "old attempt\n");
	const gate = (artifactPath) => JSON.stringify({ codeReview: { by: "judge", recommendation: "APPROVE", codeQualityStatus: "CLEAR", reportPath: `${status.currentAttemptDir}/code.md`, evidence: "review passed", blockers: [] }, manualQa: { by: "operator", status: "passed", evidence: "manual QA passed", surfaceEvidence: [{ id: "S1", criterionRef: "C001", surface: "cli", invocation: "node --test", verdict: "passed", artifactRefs: ["A1"] }], adversarialCases: [{ id: "X1", criterionRef: "C002", scenario: "malformed input", expectedBehavior: "typed rejection", verdict: "passed", artifactRefs: ["A1"] }], artifactRefs: [{ id: "A1", kind: "cli-transcript", description: "QA transcript", path: artifactPath }] }, gateReview: { by: "skeptic", recommendation: "APPROVE", reportPath: `${status.currentAttemptDir}/gate.md`, evidence: "gate passed", blockers: [] }, iteration: { fullRerun: true, status: "passed", rerunCommands: ["node --test"], evidence: "full rerun passed" }, criteriaCoverage: { totalCriteria: 3, passCount: 3, originalIntent: "deliver safely", desiredOutcome: "verified delivery", userOutcomeReview: "outcome met", adversarialClassesCovered: ["malformed_input"] } });
	const baseArgs = ["work-loop", "checkpoint", "--goal-id", goal.id, "--status", "complete", "--evidence", "final work complete and validation passed", "--host-goal-json", JSON.stringify({ goal: { objective: created.asterlineObjective, status: "complete" } }), "--session-id", "gate-session", "--json"];
	const stale = await run(cwd, [...baseArgs, "--quality-gate-json", gate("stale.log")]);
	assert.equal(stale.code, 1);
	assert.match(stale.stdout, /WORK_LOOP_QUALITY_GATE_INVALID/u);
	const current = await run(cwd, [...baseArgs, "--quality-gate-json", gate(`${status.currentAttemptDir}/qa.log`)]);
	assert.equal(current.code, 0, current.stderr || current.stdout);
	assert.equal(JSON.parse(current.stdout).aggregateCompletion.status, "complete");
});
