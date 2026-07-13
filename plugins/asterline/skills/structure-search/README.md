# Asterline Structure Search

The Asterline `structure-search` skill provides AST-aware search and deterministic
rewrite workflows across the 25 languages supported by
[`ast-grep`](https://ast-grep.github.io/). It preserves the upstream helper,
reference corpus, smoke tests, and license while adapting runtime discovery to
Auggie.

## Runtime policy

Auggie `SessionStart` provisions a checksum-pinned `sg` executable under the
Asterline runtime directory. Neither this skill nor its retained `install`
compatibility command invokes a package manager or downloads software.

The helper resolves:

1. `ASTERLINE_AST_GREP_SG_PATH`.
2. `$ASTERLINE_HOME/runtime/ast-grep/<platform>-<arch>/sg`.
3. `$HOME/.asterline/runtime/ast-grep/<platform>-<arch>/sg`.
4. A skill-local binary or an existing verified executable.

See [runtime diagnostics](references/install.md) when `sg` is unavailable.

## Usage

```bash
python3 scripts/ast_grep_helper.py search 'console.log($MSG)' --lang ts src/
python3 scripts/ast_grep_helper.py replace 'console.log($MSG)' 'logger.info($MSG)' --lang ts src/
python3 scripts/ast_grep_helper.py replace 'console.log($MSG)' 'logger.info($MSG)' --lang ts src/ --apply
python3 scripts/ast_grep_helper.py scan src/
python3 scripts/ast_grep_helper.py validate '\w+' --lang ts
python3 scripts/ast_grep_helper.py doctor
python3 scripts/ast_grep_helper.py langs
```

Rewrite is dry-run by default. `--apply` performs the required second invocation
without combining `--json` and `--update-all`.

## Corpus

- [Agent contract](SKILL.md)
- [CLI reference](references/cli.md)
- [Pattern syntax](references/patterns.md)
- [Failure modes](references/pitfalls.md)
- [Recipes](references/recipes.md)
- [Project configuration](references/sgconfig.md)
- [YAML rules](references/yaml-rules.md)
- [Runtime diagnostics](references/install.md)
- `scripts/ast_grep_helper.py` and its `scripts/structure_search/` implementation modules
- `tests/smoke.sh` and `tests/smoke.ps1`

## Limits

ast-grep matches syntax structure. Use LSP tooling for symbol resolution, type
inference, references, and data flow. Use `rg` for text contents, comments,
filenames, and regex-shaped byte searches.

## Provenance and license

The pinned upstream source is recorded in [SOURCE](SOURCE). The corpus remains
available under the included [MIT license](LICENSE).
