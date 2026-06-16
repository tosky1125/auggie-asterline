---
name: code-intel
description: Use when Auggie needs language-server diagnostics, definitions, references, symbols, or rename safety checks in the current workspace.
---

# Asterline Code Intelligence

Call `code-intel` MCP tools through the tool interface; `code-intel.*`/`mcp__code-intel__*` are tool-call names, not shell commands.

## Tools

- `code-intel.status`: list configured, installed, missing, disabled, and active language servers.
- `code-intel.diagnostics`: check one file or directory for LSP diagnostics. Prefer `severity: "error"` after edits.
- `code-intel.goto_definition`: locate a symbol definition from file, line, and character.
- `code-intel.find_references`: find usages of a symbol across the workspace.
- `code-intel.symbols`: inspect document symbols or search workspace symbols.
- `code-intel.prepare_rename`: check whether a rename is valid at a position.
- `code-intel.rename`: apply a language-server workspace edit for a rename.

## Config

Project config lives at `.asterline/code-intel.json`; user config lives at `~/.asterline/code-intel.json`.

```json
{
	"code-intel": {
		"typescript": {
			"command": ["typescript-language-server", "--stdio"],
			"extensions": [".ts", ".tsx", ".js", ".jsx"]
		}
	}
}
```

Use `code-intel.status` first when diagnostics report a missing language server.
