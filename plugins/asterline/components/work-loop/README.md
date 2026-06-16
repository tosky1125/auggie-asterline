# asterline-work-loop

[![ci](https://img.shields.io/badge/ci-pending-lightgrey.svg)](#) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Asterline plugin scaffold for durable repo-native multi-goal orchestration with embedded success criteria and observable evidence audit.

## Behavior

| Subcommand | Purpose |
|------------|---------|
| `asterline work-loop create-goals` | Create repo-native goals from a brief and seed criteria. |
| `asterline work-loop record-evidence` | Record observable evidence for the active criterion. |
| `asterline work-loop criteria` | Inspect or revise goal success criteria. |
| `asterline work-loop complete-goals` | Complete eligible goals after criteria pass. |
| `asterline work-loop checkpoint` | Refuse completion until criteria and evidence gates pass. |
| `asterline work-loop steer` | Apply steering updates to the plan. |
| `asterline work-loop status` | Report active goal, criteria, and evidence state. |

Wave 1 is scaffold only. Command behavior lands in later waves.

## Asterline Plugin

The plugin ships:

- `.augment-plugin/plugin.json` for Asterline plugin discovery.
- `hooks/hooks.json` for the `UserPromptSubmit` hook.
- `skills/work-loop/` as the future skill directory.

The hook command is:

```bash
node "${PLUGIN_ROOT}/dist/cli.js" hook user-prompt-submit
```

No MCP server or Asterline tool is exposed in this scaffold.

## Local Development

```bash
npm install
npm test
npm run typecheck
npm run check
npm pack --dry-run
```

## Local Asterline Installation

```bash
npx asterline-ai install
```

The installer builds and copies the plugin into `~/.asterline/plugins/cache/sisyphuslabs/asterline/0.1.0`, registers the `sisyphuslabs` marketplace from the `asterline` Git repository, installs runtime dependencies there, and enables:

```toml
[features]
plugins = true
plugin_hooks = true

[plugins."asterline@sisyphuslabs"]
enabled = true
```

## Privacy

This plugin runs locally. The scaffold does not call a network service by itself.

## License

[MIT](LICENSE).

## Related

- [asterline](https://github.com/code-yeongyu/asterline) - Sisyphus Labs Asterline marketplace repository.
