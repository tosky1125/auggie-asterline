# PUBLIC SKILL CONTRACTS

## OVERVIEW

Twenty shipped Auggie skills imported from a pinned upstream runtime and adapted to the Asterline namespace. Skill prose is executable routing policy, not ordinary documentation.

## STRUCTURE

```text
skills/<name>/
├── SKILL.md             # Trigger, gate, and routing contract
├── references/          # Progressively loaded detail
├── scripts/             # Executable checks/generators/helpers
└── agents/openai.yaml   # Optional discovery metadata
```

Deep toolkits: `code-engineer`, `code-intel-setup`, `debug-trace`, `visual-check`. Workflow routers: `work-loop`, `work-plan`.

## PUBLIC CONTRACT

- Directory name must equal frontmatter `name`.
- The exact twenty directory names are hardcoded in the root validator, aggregate contract test, README, and smoke expectations; the plugin runtime validator checks only the count.
- Keep `SKILL.md` concise enough to route; put scenario detail in `references/` and executable enforcement in `scripts/`.
- Preserve explicit Auggie compatibility sections in orchestration-heavy skills. Port foreign harness examples instead of invoking them literally.
- Optional `agents/openai.yaml` describes discovery UI; it does not replace `SKILL.md` behavior.

## EDITING RULES

- Verify every renamed local path, script, config key, and tool name against the actual tree. Mechanical identity replacement has already created broken references.
- Do not rename helper files only in prose. Update imports, scripts, references, validation, and examples as one change.
- Keep progressive-disclosure routers: language/runtime/topic references should be read only when their branch applies.
- Do not add a new skill alias or directory without intentionally changing the public inventory everywhere.

## WHERE TO LOOK

| Concern | Location |
| --- | --- |
| Strict language implementation guidance | `code-engineer/` |
| LSP installation/configuration | `code-intel-setup/` |
| Runtime debugging methodology | `debug-trace/` |
| Visual/browser/TUI QA | `visual-check/` |
| Durable execution protocol | `work-loop/`, `run-plan/` |
| Planning protocol | `work-plan/` |

## VALIDATION

Run the inherited plugin check and root marketplace validator after edits; use the inherited live smoke for command-surface changes. Those gates validate inventory/branding/loadability but do not prove that referenced scripts and config paths exist, so check those paths directly.

## KNOWN DRIFT

- Code-intel setup prose uses renamed helper/config names while shipped scripts retain LSP names.
- Code-engineer prose contains at least one renamed checker basename that does not match the file on disk.
- Imported verification scripts may search for absent upstream monorepo packages.
