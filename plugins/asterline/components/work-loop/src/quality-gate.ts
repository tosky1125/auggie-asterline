import { resolve } from "node:path";
import { isWithinAttemptDir } from "./paths.js";
import { emptyBlockers, invalid, literal, numberField, section, stringArray, textField } from "./quality-gate-fields.js";
import { adversarialVerdict, codeQualityStatusField, passedVerdict } from "./quality-gate-verdicts.js";
import type { WorkLoopManualQaArtifactKind, WorkLoopManualQaArtifactRef, WorkLoopManualQaSurface, WorkLoopQualityGate } from "./types.js";

const REVIEWER_ROLES = { codeReview: "judge", manualQa: "operator", gateReview: "skeptic" } as const;
const UNCONDITIONAL_APPROVAL_PATTERN = /\bUNCONDITIONAL\s+APPROVAL\b/i;

export { classifyExternalAuthorizationBlocker, clearGoalBlockerFields, normalizeBlockerEvidence, sameBlockerOccurrences } from "./quality-gate-blockers.js";

interface QualityGateFileInfo { readonly size: number; readonly isFile: () => boolean; readonly isSymbolicLink: () => boolean }
export interface QualityGateFs { readonly existsSync: (path: string) => boolean; readonly lstatSync: (path: string) => QualityGateFileInfo; readonly realpathSync: (path: string) => string }
export interface QualityGateCriterion { readonly goalId: string; readonly criterionId: string }
export interface ValidateQualityGateOptions { readonly repoRoot: string; readonly fs: QualityGateFs; readonly criteria: readonly QualityGateCriterion[]; readonly currentAttemptDir?: string }
interface CriteriaCoverageInput { readonly totalCriteria: number; readonly passCount: number; readonly refs: readonly string[] }

function reviewerRoleField<T extends string>(value: unknown, expected: T, field: string): T {
	const actual = textField(value, field);
	if (actual !== expected) invalid(`${field} must be ${expected}.`, field);
	return expected;
}

function surfaceField(value: unknown, field: string): WorkLoopManualQaSurface {
	if (value === "cli" || value === "http" || value === "tmux" || value === "browser" || value === "gui" || value === "data") return value;
	return invalid(`${field} must be a supported manual QA surface.`, field);
}

function kindField(value: unknown, field: string): WorkLoopManualQaArtifactKind {
	if (value === "cli-transcript" || value === "log" || value === "screenshot" || value === "image" || value === "http-dump" || value === "data-diff") return value;
	return invalid(`${field} must be a supported artifact kind.`, field);
}

function artifactCompatible(surface: WorkLoopManualQaSurface, kind: WorkLoopManualQaArtifactKind): boolean {
	if (surface === "cli" || surface === "tmux") return kind === "cli-transcript" || kind === "log";
	if (surface === "http") return kind === "http-dump";
	if (surface === "browser" || surface === "gui") return kind === "screenshot" || kind === "image";
	return kind === "data-diff";
}

function checkFile(path: string, field: string, opts?: ValidateQualityGateOptions): void {
	if (opts === undefined) return;
	const absolute = resolve(opts.repoRoot, path);
	if (!opts.fs.existsSync(absolute)) invalid(`${field} must point to an existing artifact.`, field);
	const info = opts.fs.lstatSync(absolute);
	if (info.isSymbolicLink() || !info.isFile()) invalid(`${field} must point to a regular non-symlink file.`, field);
	if (info.size <= 0) invalid(`${field} must point to a non-empty artifact.`, field);
	if (opts.currentAttemptDir === undefined) return;
	const attempt = resolve(opts.repoRoot, opts.currentAttemptDir);
	if (!isWithinAttemptDir(absolute, attempt)) invalid(`${field} (${path}) must point to an artifact from the current attempt (${opts.currentAttemptDir}).`, field);
	const realRepo = opts.fs.realpathSync(resolve(opts.repoRoot));
	const realAttempt = opts.fs.realpathSync(attempt);
	const realArtifact = opts.fs.realpathSync(absolute);
	if (!isWithinAttemptDir(realAttempt, realRepo) || !isWithinAttemptDir(realArtifact, realAttempt)) invalid(`${field} (${path}) must resolve inside the current attempt (${opts.currentAttemptDir}).`, field);
}

function validateCriteriaCoverage(input: CriteriaCoverageInput, opts?: ValidateQualityGateOptions): void {
	const { totalCriteria, passCount, refs } = input;
	if (opts === undefined) {
		if (passCount < totalCriteria) invalid("criteriaCoverage.passCount must cover totalCriteria.", "criteriaCoverage.passCount");
		return;
	}
	const expected = new Map<string, string>();
	const idCounts = new Map<string, number>();
	for (const criterion of opts.criteria) idCounts.set(criterion.criterionId, (idCounts.get(criterion.criterionId) ?? 0) + 1);
	for (const criterion of opts.criteria) {
		const canonical = `${criterion.goalId}:${criterion.criterionId}`;
		expected.set(canonical, canonical);
		if (idCounts.get(criterion.criterionId) === 1) expected.set(criterion.criterionId, canonical);
	}
	const expectedCount = opts.criteria.length;
	if (totalCriteria !== expectedCount) invalid(`criteriaCoverage.totalCriteria must equal the plan criterion count (${expectedCount}).`, "criteriaCoverage.totalCriteria");
	if (passCount !== expectedCount) invalid(`criteriaCoverage.passCount must equal the plan criterion count (${expectedCount}).`, "criteriaCoverage.passCount");
	const covered = new Set<string>();
	for (const ref of refs) {
		const canonical = expected.get(ref) ?? invalid(`criterionRef references unknown or ambiguous plan criterion ${ref}.`, "manualQa.criterionRef");
		if (covered.has(canonical)) invalid(`criterionRef contains duplicate plan criterion ${ref}.`, "manualQa.criterionRef");
		covered.add(canonical);
	}
	if (covered.size !== expectedCount) invalid("criterionRef must cover every plan criterion exactly once.", "manualQa.criterionRef");
}

function parseArtifactRefs(value: unknown, opts?: ValidateQualityGateOptions): readonly WorkLoopManualQaArtifactRef[] {
	if (!Array.isArray(value) || value.length === 0) invalid("manualQa.artifactRefs must not be empty.", "manualQa.artifactRefs");
	const refs = value.map((item, index) => {
		const ref = section(item, `manualQa.artifactRefs[${index}]`);
		const path = textField(ref["path"], `manualQa.artifactRefs[${index}].path`);
		checkFile(path, `manualQa.artifactRefs[${index}].path`, opts);
		return { id: textField(ref["id"], `manualQa.artifactRefs[${index}].id`), kind: kindField(ref["kind"], `manualQa.artifactRefs[${index}].kind`), description: textField(ref["description"], `manualQa.artifactRefs[${index}].description`), path };
	});
	const ids = new Set<string>();
	for (const ref of refs) { if (ids.has(ref.id)) invalid(`manualQa.artifactRefs contains duplicate ${ref.id}.`, "manualQa.artifactRefs"); ids.add(ref.id); }
	return refs;
}

function referencedArtifacts(value: unknown, field: string, byId: ReadonlyMap<string, WorkLoopManualQaArtifactRef>): readonly WorkLoopManualQaArtifactRef[] {
	return stringArray(value, field).map((id) => byId.get(id) ?? invalid(`${field} references unknown artifact ${id}.`, field));
}

function parseSurfaceEvidence(value: unknown, byId: ReadonlyMap<string, WorkLoopManualQaArtifactRef>): WorkLoopQualityGate["manualQa"]["surfaceEvidence"] {
	if (!Array.isArray(value) || value.length === 0) invalid("manualQa.surfaceEvidence must not be empty.", "manualQa.surfaceEvidence");
	return value.map((item, index) => {
		const field = `manualQa.surfaceEvidence[${index}]`; const row = section(item, field); const surface = surfaceField(row["surface"], `${field}.surface`); const artifacts = referencedArtifacts(row["artifactRefs"], `${field}.artifactRefs`, byId);
		for (const artifact of artifacts) if (!artifactCompatible(surface, artifact.kind)) invalid(`manualQa.surfaceEvidence ${surface} artifact ${artifact.kind} is incompatible.`, "manualQa.surfaceEvidence");
		return { id: textField(row["id"], `${field}.id`), criterionRef: textField(row["criterionRef"], `${field}.criterionRef`), surface, invocation: textField(row["invocation"], `${field}.invocation`), verdict: passedVerdict(row["verdict"], `${field}.verdict`), artifactRefs: artifacts.map((artifact) => artifact.id) };
	});
}

function parseAdversarialCases(value: unknown, byId: ReadonlyMap<string, WorkLoopManualQaArtifactRef>): WorkLoopQualityGate["manualQa"]["adversarialCases"] {
	if (!Array.isArray(value) || value.length === 0) invalid("manualQa.adversarialCases must not be empty.", "manualQa.adversarialCases");
	return value.map((item, index) => {
		const field = `manualQa.adversarialCases[${index}]`; const row = section(item, field); const artifacts = referencedArtifacts(row["artifactRefs"], `${field}.artifactRefs`, byId); const verdict = adversarialVerdict(row, field);
		return { id: textField(row["id"], `${field}.id`), criterionRef: textField(row["criterionRef"], `${field}.criterionRef`), scenario: textField(row["scenario"], `${field}.scenario`), expectedBehavior: textField(row["expectedBehavior"], `${field}.expectedBehavior`), verdict: verdict.verdict, ...(verdict.reason === undefined ? {} : { reason: verdict.reason }), artifactRefs: artifacts.map((artifact) => artifact.id) };
	});
}

function validateLegacyQualityGate(gate: Record<string, unknown>): WorkLoopQualityGate {
	const cleaner = section(gate["aiSlopCleaner"], "aiSlopCleaner"); const verification = section(gate["verification"], "verification"); const review = section(gate["codeReview"], "codeReview"); const coverage = section(gate["criteriaCoverage"], "criteriaCoverage");
	if (cleaner["status"] !== "passed") invalid("aiSlopCleaner.status must be passed.", "aiSlopCleaner.status"); if (verification["status"] !== "passed") invalid("verification.status must be passed.", "verification.status");
	const totalCriteria = numberField(coverage["totalCriteria"], "criteriaCoverage.totalCriteria"); const passCount = numberField(coverage["passCount"], "criteriaCoverage.passCount"); if (passCount < totalCriteria) invalid("criteriaCoverage.passCount must cover totalCriteria.", "criteriaCoverage.passCount");
	const evidence = textField(review["evidence"], "codeReview.evidence"); const approved = UNCONDITIONAL_APPROVAL_PATTERN.test(evidence); const recommendation = review["recommendation"] === "APPROVE" || (approved && (review["recommendation"] === undefined || (typeof review["recommendation"] === "string" && review["recommendation"].trim() === ""))) ? "APPROVE" : invalid("codeReview.recommendation must be APPROVE or codeReview.evidence should include UNCONDITIONAL APPROVAL.", "codeReview.recommendation"); const architectStatus = review["architectStatus"] === "CLEAR" || (approved && (review["architectStatus"] === undefined || (typeof review["architectStatus"] === "string" && review["architectStatus"].trim() === ""))) ? "CLEAR" : invalid("codeReview.architectStatus must be CLEAR or codeReview.evidence should include UNCONDITIONAL APPROVAL.", "codeReview.architectStatus");
	const verificationEvidence = textField(verification["evidence"], "verification.evidence"); const commands = stringArray(verification["commands"], "verification.commands"); const covered = stringArray(coverage["adversarialClassesCovered"], "criteriaCoverage.adversarialClassesCovered");
	const base: WorkLoopQualityGate = { codeReview: { by: "judge", recommendation, codeQualityStatus: "CLEAR", reportPath: "legacy", evidence, blockers: [] }, manualQa: { by: "operator", status: "passed", evidence: verificationEvidence, surfaceEvidence: [], adversarialCases: [], artifactRefs: [] }, gateReview: { by: "skeptic", recommendation: "APPROVE", reportPath: "legacy", evidence, blockers: [] }, iteration: { fullRerun: true, status: "passed", rerunCommands: commands, evidence: verificationEvidence }, criteriaCoverage: { totalCriteria, passCount, originalIntent: "legacy", desiredOutcome: "legacy", userOutcomeReview: "legacy", adversarialClassesCovered: covered } };
	return Object.assign(base, { aiSlopCleaner: { status: "passed", evidence: textField(cleaner["evidence"], "aiSlopCleaner.evidence") }, verification: { status: "passed", commands, evidence: verificationEvidence }, codeReview: Object.assign(base.codeReview, { architectStatus }) });
}

export function validateQualityGate(input: unknown, opts?: ValidateQualityGateOptions): WorkLoopQualityGate {
	const gate = section(input, "qualityGate");
	if (opts === undefined && gate["aiSlopCleaner"] !== undefined) return validateLegacyQualityGate(gate);
	const codeReview = section(gate["codeReview"], "codeReview"); const manualQa = section(gate["manualQa"], "manualQa"); const gateReview = section(gate["gateReview"], "gateReview"); const iteration = section(gate["iteration"], "iteration"); const coverage = section(gate["criteriaCoverage"], "criteriaCoverage");
	const totalCriteria = numberField(coverage["totalCriteria"], "criteriaCoverage.totalCriteria"); const passCount = numberField(coverage["passCount"], "criteriaCoverage.passCount");
	const artifactRefs = parseArtifactRefs(manualQa["artifactRefs"], opts); const byId = new Map(artifactRefs.map((ref) => [ref.id, ref])); const surfaceEvidence = parseSurfaceEvidence(manualQa["surfaceEvidence"], byId); const adversarialCases = parseAdversarialCases(manualQa["adversarialCases"], byId); const codeReportPath = textField(codeReview["reportPath"], "codeReview.reportPath"); const gateReportPath = textField(gateReview["reportPath"], "gateReview.reportPath"); checkFile(codeReportPath, "codeReview.reportPath", opts); checkFile(gateReportPath, "gateReview.reportPath", opts);
	validateCriteriaCoverage({ totalCriteria, passCount, refs: [...surfaceEvidence, ...adversarialCases].map((item) => item.criterionRef) }, opts);
	return { codeReview: { by: reviewerRoleField(codeReview["by"], REVIEWER_ROLES.codeReview, "codeReview.by"), recommendation: literal(codeReview["recommendation"], "APPROVE", "codeReview.recommendation"), codeQualityStatus: codeQualityStatusField(codeReview["codeQualityStatus"], "codeReview.codeQualityStatus"), reportPath: codeReportPath, evidence: textField(codeReview["evidence"], "codeReview.evidence"), blockers: emptyBlockers(codeReview["blockers"], "codeReview.blockers") }, manualQa: { by: reviewerRoleField(manualQa["by"], REVIEWER_ROLES.manualQa, "manualQa.by"), status: literal(manualQa["status"], "passed", "manualQa.status"), evidence: textField(manualQa["evidence"], "manualQa.evidence"), surfaceEvidence, adversarialCases, artifactRefs }, gateReview: { by: reviewerRoleField(gateReview["by"], REVIEWER_ROLES.gateReview, "gateReview.by"), recommendation: literal(gateReview["recommendation"], "APPROVE", "gateReview.recommendation"), reportPath: gateReportPath, evidence: textField(gateReview["evidence"], "gateReview.evidence"), blockers: emptyBlockers(gateReview["blockers"], "gateReview.blockers") }, iteration: { fullRerun: literal(iteration["fullRerun"], true, "iteration.fullRerun"), status: literal(iteration["status"], "passed", "iteration.status"), rerunCommands: stringArray(iteration["rerunCommands"], "iteration.rerunCommands"), evidence: textField(iteration["evidence"], "iteration.evidence") }, criteriaCoverage: { totalCriteria, passCount, originalIntent: textField(coverage["originalIntent"], "criteriaCoverage.originalIntent"), desiredOutcome: textField(coverage["desiredOutcome"], "criteriaCoverage.desiredOutcome"), userOutcomeReview: textField(coverage["userOutcomeReview"], "criteriaCoverage.userOutcomeReview"), adversarialClassesCovered: stringArray(coverage["adversarialClassesCovered"], "criteriaCoverage.adversarialClassesCovered") } };
}
