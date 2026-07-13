# Changelog

## 4.17.1 - 2026-07-13

- Ported v4.17.1 continuation selection and checklist behavior to Auggie `run-plan` state.
- Switched installed session and ledger contracts to `auggie:` and `.asterline/run-plan/ledger.jsonl`.
- Removed unsupported `SubagentStop` wiring and rejected plan paths that escape their tracked roots.

## 0.1.0 - 2026-05-28

- Initial release: Stop and SubagentStop continuation injection.
