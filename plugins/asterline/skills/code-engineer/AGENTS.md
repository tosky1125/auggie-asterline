# CODE-ENGINEER TOOLKIT

## OVERVIEW

Large language-routed implementation policy: 72 files spanning Go, Python, Rust, unsafe Rust, TypeScript, logging, and executable rule checks.

## STRUCTURE

- `SKILL.md` owns the global gate and routes by language/task.
- `references/<language>/README.md` is the first stop for a language; topic files refine only the active branch.
- `scripts/<language>/` contains enforceable checks and templates; script output is part of the contract.

## CONVENTIONS

- Preserve parse-at-boundary, exhaustive variants, typed errors, strict toolchains, and the 250 pure-LOC ceiling across language branches.
- Keep examples aligned with the currently named Asterline skills and files.
- Treat reference prose and enforcement scripts as a pair; rule additions require both sides or an explicit prose-only rationale.
- Avoid generic `utils`/`helpers` splits when applying the file ceiling; split by domain responsibility.

## PATH INTEGRITY

- Confirm every checker command against `scripts/`; imported prose has renamed basenames that do not always exist.
- Do not blindly rebrand code identifiers, package names, compiler flags, or upstream library APIs.
- Python scripts and TypeScript scripts have separate dependency/runtime assumptions; preserve their shebang/runner examples.

## VALIDATION

- Run the affected language checker on both a clean fixture and a deliberate violation.
- Run plugin and marketplace validation after changing public skill prose.
- Search references for the old and new rule/script name before declaring a rename complete.

## ANTI-PATTERNS

- Do not load every reference for every task; routing accuracy is part of the skill design.
- Do not weaken a checker to reconcile stale prose.
- Do not add unenforced absolute rules without updating the relevant script or explaining why enforcement is impossible.
