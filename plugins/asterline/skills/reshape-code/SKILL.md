---
name: reshape-code
description: "Refactor and simplify code while preserving behavior. Use for cleanup, restructuring, extraction, simplification, modernization, and other focused code reshaping work."
---

## Auggie delegation compatibility

Auggie supports only bounded one-shot parallel decomposition. Inspect the currently visible delegation surface before using it; do not invent tool names. Give each worker a self-contained assignment with disjoint ownership, collect its terminal result through the host surface, and let the parent verify and integrate it.

Persistent teams, rosters, worker messaging, thread creation, resume, and cross-turn worker identity are unavailable. Any foreign-harness orchestration example below is conceptual only: translate it to fresh independent one-shot assignments, or run serially when the work cannot be split safely. This capability boundary overrides every example in this skill.


## Usage
\`\`\`
/reshape-code <reshape-codeing-target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]

Arguments:
  reshape-codeing-target: What to reshape-code. Can be:
    - File path: src/auth/handler.ts
    - Symbol name: "AuthService class"
    - Pattern: "all functions using deprecated API"
    - Description: "extract validation logic into separate module"

Options:
  --scope: Refactoring scope (default: module)
    - file: Single file only
    - module: Module/directory scope
    - project: Entire codebase

  --strategy: Risk tolerance (default: safe)
    - safe: Conservative, maximum test coverage required
    - aggressive: Allow broader changes with adequate coverage
\`\`\`

## What This Command Does

Performs intelligent, deterministic reshape-codeing with full codebase awareness. Unlike blind search-and-replace, this command:

1. **Understands your intent** - Analyzes what you actually want to achieve
2. **Maps the codebase** - Builds a definitive codemap before touching anything
3. **Assesses risk** - Evaluates test coverage and determines verification strategy
4. **Plans meticulously** - Creates a detailed plan with Plan agent
5. **Executes precisely** - Step-by-step reshape-codeing with LSP and AST-grep
6. **Verifies constantly** - Runs tests after each change to ensure zero regression

---

# PHASE 0: INTENT GATE (MANDATORY FIRST STEP)

**BEFORE ANY ACTION, classify and validate the request.**

## Step 0.1: Parse Request Type

| Signal | Classification | Action |
|--------|----------------|--------|
| Specific file/symbol | Explicit | Proceed to codebase analysis |
| "Refactor X to Y" | Clear transformation | Proceed to codebase analysis |
| "Improve", "Clean up" | Open-ended | **MUST ask**: "What specific improvement?" |
| Ambiguous scope | Uncertain | **MUST ask**: "Which modules/files?" |
| Missing context | Incomplete | **MUST ask**: "What's the desired outcome?" |

## Step 0.2: Validate Understanding

Before proceeding, confirm:
- [ ] Target is clearly identified
- [ ] Desired outcome is understood
- [ ] Scope is defined (file/module/project)
- [ ] Success criteria can be articulated

**If ANY of above is unclear, ASK CLARIFYING QUESTION:**

\`\`\`
I want to make sure I understand the reshape-codeing goal correctly.

**What I understood**: [interpretation]
**What I'm unsure about**: [specific ambiguity]

Options I see:
1. [Option A] - [implications]
2. [Option B] - [implications]

**My recommendation**: [suggestion with reasoning]

Should I proceed with [recommendation], or would you prefer differently?
\`\`\`

## Step 0.3: Create Initial Todos

**IMMEDIATELY after understanding the request, create todos:**

\`\`\`
TodoWrite([
  {"id": "phase-1", "content": "PHASE 1: Codebase Analysis - launch parallel explore agents", "status": "pending", "priority": "high"},
  {"id": "phase-2", "content": "PHASE 2: Build Codemap - map dependencies and impact zones", "status": "pending", "priority": "high"},
  {"id": "phase-3", "content": "PHASE 3: Test Assessment - analyze test coverage and verification strategy", "status": "pending", "priority": "high"},
  {"id": "phase-4", "content": "PHASE 4: Plan Generation - invoke Plan agent for detailed reshape-codeing plan", "status": "pending", "priority": "high"},
  {"id": "phase-5", "content": "PHASE 5: Execute Refactoring - step-by-step with continuous verification", "status": "pending", "priority": "high"},
  {"id": "phase-6", "content": "PHASE 6: Final Verification - full test suite and regression check", "status": "pending", "priority": "high"}
])
\`\`\`

---

# PHASE 1: CODEBASE ANALYSIS (PARALLEL EXPLORATION)

**Mark phase-1 as in_progress.**

## 1.1: Launch Parallel Explore Agents (BACKGROUND)

Launch these five independent one-shot research assignments in parallel:

\`\`\`
- Target discovery: find all definitions and occurrences of `[TARGET]`; report paths, lines, and usage patterns.
- Dependency discovery: find imports, users, and dependents; report dependency chains and import graphs.
- Pattern discovery: find analogous implementations and established conventions.
- Test discovery: find related test files, test cases, and available coverage evidence.
- Architecture discovery: report nearby module boundaries, layers, and design patterns.
\`\`\`

## 1.2: Direct Tool Exploration (WHILE AGENTS RUN)

While background agents are running, use direct tools:

### LSP Tools for Precise Analysis:

\`\`\`typescript
// Find definition(s)
LspGotoDefinition(filePath, line, character)  // Where is it defined?

// Find ALL usages across workspace
LspFindReferences(filePath, line, character, includeDeclaration=true)

// Get file structure
LspDocumentSymbols(filePath)  // Hierarchical outline
LspWorkspaceSymbols(filePath, query="[target_symbol]")  // Search by name

// Get current diagnostics
code-intel_diagnostics(filePath)  // Errors, warnings before we start
\`\`\`

### AST-Grep Skill for Pattern Analysis:

\`\`\`bash
// Find structural patterns
sg --pattern 'function $NAME($$$) { $$$ }' --lang ts src/

// Preview reshape-codeing (DRY RUN)
ast_grep_replace(
  pattern="[old_pattern]",
  rewrite="[new_pattern]",
  lang="[language]",
  dryRun=true  // ALWAYS preview first
)
\`\`\`

### Grep for Text Patterns:

\`\`\`
grep(pattern="[search_term]", path="src/", include="*.ts")
\`\`\`

## 1.3: Collect Background Results

\`\`\`
Collect each terminal one-shot result returned by Auggie.
Verify every cited path directly before using it in the codemap.
...
\`\`\`

**Mark phase-1 as completed after all results collected.**

---

# PHASE 2: BUILD CODEMAP (DEPENDENCY MAPPING)

**Mark phase-2 as in_progress.**

## 2.1: Construct Definitive Codemap

Based on Phase 1 results, build:

\`\`\`
## CODEMAP: [TARGET]

### Core Files (Direct Impact)
- \`path/to/file.ts:L10-L50\` - Primary definition
- \`path/to/file2.ts:L25\` - Key usage

### Dependency Graph
\`\`\`
[TARGET]
├── imports from:
│   ├── module-a (types)
│   └── module-b (utils)
├── imported by:
│   ├── consumer-1.ts
│   ├── consumer-2.ts
│   └── consumer-3.ts
└── used by:
    ├── handler.ts (direct call)
    └── service.ts (dependency injection)
\`\`\`

### Impact Zones
| Zone | Risk Level | Files Affected | Test Coverage |
|------|------------|----------------|---------------|
| Core | HIGH | 3 files | 85% covered |
| Consumers | MEDIUM | 8 files | 70% covered |
| Edge | LOW | 2 files | 50% covered |

### Established Patterns
- Pattern A: [description] - used in N places
- Pattern B: [description] - established convention
\`\`\`

## 2.2: Identify Refactoring Constraints

Based on codemap:
- **MUST follow**: [existing patterns identified]
- **MUST NOT break**: [critical dependencies]
- **Safe to change**: [isolated code zones]
- **Requires migration**: [breaking changes impact]

**Mark phase-2 as completed.**

---

# PHASE 3: TEST ASSESSMENT (VERIFICATION STRATEGY)

**Mark phase-3 as in_progress.**

## 3.1: Detect Test Infrastructure

\`\`\`bash
# Check for test commands
cat package.json | jq '.scripts | keys[] | select(test("test"))'

# Or for Python
ls -la pytest.ini pyproject.toml setup.cfg

# Or for Go
ls -la *_test.go
\`\`\`

## 3.2: Analyze Test Coverage

\`\`\`
TASK: Analyze test coverage for [TARGET].
DELIVERABLE: Answer all five questions with cited paths and commands.
  1. Which test files cover this code?
  2. What test cases exist?
  3. Are there integration tests?
  4. What edge cases are tested?
  5. What measured coverage evidence exists? Do not estimate a percentage without data.
\`\`\`

## 3.3: Determine Verification Strategy

Based on test analysis:

| Coverage Level | Strategy |
|----------------|----------|
| HIGH (>80%) | Run existing tests after each step |
| MEDIUM (50-80%) | Run tests + add safety assertions |
| LOW (<50%) | **PAUSE**: Propose adding tests first |
| NONE | **BLOCK**: Refuse aggressive reshape-codeing |

**If coverage is LOW or NONE, ask user:**

\`\`\`
Test coverage for [TARGET] is [LEVEL].

**Risk Assessment**: Refactoring without adequate tests is dangerous.

Options:
1. Add tests first, then reshape-code (RECOMMENDED)
2. Proceed with extra caution, manual verification required
3. Abort reshape-codeing

Which approach do you prefer?
\`\`\`

## 3.4: Document Verification Plan

\`\`\`
## VERIFICATION PLAN

### Test Commands
- Unit: \`bun test\` / \`npm test\` / \`pytest\` / etc.
- Integration: [command if exists]
- Type check: \`tsc --noEmit\` / \`pyright\` / etc.

### Verification Checkpoints
After each reshape-codeing step:
1. code-intel_diagnostics → zero new errors
2. Run test command → all pass
3. Type check → clean

### Regression Indicators
- [Specific test that must pass]
- [Behavior that must be preserved]
- [API contract that must not change]
\`\`\`

**Mark phase-3 as completed.**

---

# PHASE 4: PLAN GENERATION (PLAN AGENT)

**Mark phase-4 as in_progress.**

## 4.1: Invoke Plan Agent

\`\`\`
TASK: Create a detailed refactoring plan.
DELIVERABLE: Atomic dependency-ordered steps with verification for every step.

Create a detailed reshape-codeing plan:

  ## Refactoring Goal
  [User's original request]

  ## Codemap (from Phase 2)
  [Insert codemap here]

  ## Test Coverage (from Phase 3)
  [Insert verification plan here]

  ## Constraints
  - MUST follow existing patterns: [list]
  - MUST NOT break: [critical paths]
  - MUST run tests after each step

  ## Requirements
  1. Break down into atomic reshape-codeing steps
  2. Each step must be independently verifiable
  3. Order steps by dependency (what must happen first)
  4. Specify exact files and line ranges for each step
  5. Include rollback strategy for each step
  6. Define commit checkpoints
\`\`\`

## 4.2: Review and Validate Plan

After receiving plan from Plan agent:

1. **Verify completeness**: All identified files addressed?
2. **Verify safety**: Each step reversible?
3. **Verify order**: Dependencies respected?
4. **Verify verification**: Test commands specified?

## 4.3: Register Detailed Todos

Convert Plan agent output into granular todos:

\`\`\`
TodoWrite([
  // Each step from the plan becomes a todo
  {"id": "reshape-code-1", "content": "Step 1: [description]", "status": "pending", "priority": "high"},
  {"id": "verify-1", "content": "Verify Step 1: run tests", "status": "pending", "priority": "high"},
  {"id": "reshape-code-2", "content": "Step 2: [description]", "status": "pending", "priority": "medium"},
  {"id": "verify-2", "content": "Verify Step 2: run tests", "status": "pending", "priority": "medium"},
  // ... continue for all steps
])
\`\`\`

**Mark phase-4 as completed.**

---

# PHASE 5: EXECUTE REFACTORING (DETERMINISTIC EXECUTION)

**Mark phase-5 as in_progress.**

## 5.1: Execution Protocol

For EACH reshape-codeing step:

### Pre-Step
1. Mark step todo as \`in_progress\`
2. Read current file state
3. Verify code-intel_diagnostics is baseline

### Execute Step
Use appropriate tool:

**For Symbol Renames:**
\`\`\`typescript
code-intel_prepare_rename(filePath, line, character)  // Validate rename is possible
code-intel_rename(filePath, line, character, newName)  // Execute rename
\`\`\`

**For Pattern Transformations:**
\`\`\`bash
// Preview first
sg --pattern '[pattern]' --rewrite '[rewrite]' --lang ts path/to/file.ts

// If preview looks good, execute
sg --pattern '[pattern]' --rewrite '[rewrite]' --lang ts path/to/file.ts
\`\`\`

**For Structural Changes:**
\`\`\`typescript
// Use Edit tool for precise changes
edit(filePath, oldString, newString)
\`\`\`

### Post-Step Verification (MANDATORY)

\`\`\`typescript
// 1. Check diagnostics
code-intel_diagnostics(filePath)  // Must be clean or same as baseline

// 2. Run tests
bash("bun test")  // Or appropriate test command

// 3. Type check
bash("tsc --noEmit")  // Or appropriate type check
\`\`\`

### Step Completion
1. If verification passes → Mark step todo as \`completed\`
2. If verification fails → **STOP AND FIX**

## 5.2: Failure Recovery Protocol

If ANY verification fails:

1. **STOP** immediately
2. **REVERT** the failed change
3. **DIAGNOSE** what went wrong
4. **OPTIONS**:
   - Fix the issue and retry
   - Skip this step (if optional)
   - Consult oracle agent for help
   - Ask user for guidance

**NEVER proceed to next step with broken tests.**

## 5.3: Commit Checkpoints

After each logical group of changes:

\`\`\`bash
git add [changed-files]
git commit -m "reshape-code(scope): description

[details of what was changed and why]"
\`\`\`

**Mark phase-5 as completed when all reshape-codeing steps done.**

---

# PHASE 6: FINAL VERIFICATION (REGRESSION CHECK)

**Mark phase-6 as in_progress.**

## 6.1: Full Test Suite

\`\`\`bash
# Run complete test suite
bun test  # or npm test, pytest, go test, etc.
\`\`\`

## 6.2: Type Check

\`\`\`bash
# Full type check
tsc --noEmit  # or equivalent
\`\`\`

## 6.3: Lint Check

\`\`\`bash
# Run linter
eslint .  # or equivalent
\`\`\`

## 6.4: Build Verification (if applicable)

\`\`\`bash
# Ensure build still works
bun run build  # or npm run build, etc.
\`\`\`

## 6.5: Final Diagnostics

\`\`\`typescript
// Check all changed files
for (file of changedFiles) {
  code-intel_diagnostics(file)  // Must all be clean
}
\`\`\`

## 6.6: Generate Summary

\`\`\`markdown
## Refactoring Complete

### What Changed
- [List of changes made]

### Files Modified
- \`path/to/file.ts\` - [what changed]
- \`path/to/file2.ts\` - [what changed]

### Verification Results
- Tests: PASSED (X/Y passing)
- Type Check: CLEAN
- Lint: CLEAN
- Build: SUCCESS

### No Regressions Detected
All existing tests pass. No new errors introduced.
\`\`\`

**Mark phase-6 as completed.**

---

# CRITICAL RULES

## NEVER DO
- Skip code-intel_diagnostics check after changes
- Proceed with failing tests
- Make changes without understanding impact
- Use \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\`
- Delete tests to make them pass
- Commit broken code
- Refactor without understanding existing patterns

## ALWAYS DO
- Understand before changing
- Preview before applying (`sg --pattern ... --rewrite ... --lang ...`)
- Verify after every change
- Follow existing codebase patterns
- Keep todos updated in real-time
- Commit at logical checkpoints
- Report issues immediately

## ABORT CONDITIONS
If any of these occur, **STOP and consult user**:
- Test coverage is zero for target code
- Changes would break public API
- Refactoring scope is unclear
- 3 consecutive verification failures
- User-defined constraints violated

---

# Tool Usage Philosophy

You already know these tools. Use them intelligently:

## LSP Tools
Leverage LSP tools for precision analysis. Key patterns:
- **Understand before changing**: \`LspGotoDefinition\` to grasp context
- **Impact analysis**: \`LspFindReferences\` to map all usages before modification
- **Safe reshape-codeing**: \`code-intel_prepare_rename\` → \`code-intel_rename\` for symbol renames
- **Continuous verification**: \`code-intel_diagnostics\` after every change

## AST-Grep
Use \`ast-grep\` skill helper or \`sg\` CLI for structural transformations.
**Critical**: Always preview first, review, then execute.

## Agents
- \`explore\`: Parallel codebase pattern discovery
- \`plan\`: Detailed reshape-codeing plan generation
- \`oracle\`: Read-only consultation for complex architectural decisions and debug-trace
- \`librarian\`: **Use proactively** when encountering deprecated methods or library migration tasks. Query official docs and OSS examples for modern replacements.

## Deprecated Code & Library Migration
When you encounter deprecated methods/APIs during reshape-codeing:
1. Fire \`librarian\` to find the recommended modern alternative
2. **DO NOT auto-upgrade to latest version** unless user explicitly requests migration
3. If user requests library migration, use \`librarian\` to fetch latest API docs before making changes

---

**Remember: Refactoring without tests is reckless. Refactoring without understanding is destructive. This command ensures you do neither.**

<user-request>
$ARGUMENTS
</user-request>
`

export const REFACTOR_TEAM_MODE_ADDENDUM = `
---

# Auggie one-shot parallel refactoring

When the plan contains independent steps with disjoint file ownership, use `$team-mode` to launch fresh one-shot workers in parallel. Give every worker the Intent Card, exact paths, regression test, verification command, and rollback boundary. Workers do not communicate or persist; the parent collects terminal results, runs an independent verification pass, and integrates only confirmed changes.

Serialize steps that share files, generated artifacts, or state. If a worker is inconclusive, start a new bounded assignment with the missing evidence rather than pretending to resume it.
