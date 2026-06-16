# Rust — LSP setup

- **Builtin server:** `rust` — `rust-analyzer`
- **Extensions:** `.rs`
- **Install hint:** `rustup component add rust-analyzer`

## Install

- **macOS:** `rustup component add rust-analyzer` (or `brew install rust-analyzer`)
- **Linux:** `rustup component add rust-analyzer`
- **Windows:** `rustup component add rust-analyzer`

The rustup component is the recommended path — it stays pinned to your toolchain.
`rust-analyzer` also needs the `rust-src` component to index the standard library
(`rustup component add rust-src`).

Confirm it resolves:

```bash
command -v rust-analyzer
```

## Configure

Builtin — usually NO config needed (auto-resolved by extension). Configure only to set priority, init options, override extensions, or disable. Same JSON shape in `.asterline/code-intel-client.json` (Auggie) AND `.opencode/code-intel.json` (OpenCode/Asterline):

```json
{ "code-intel": { "rust": { "priority": 100 } } }
```

For builtin ids in a PROJECT config, `command` is supplied automatically — only set `priority`/`initialization`/`extensions`/`disabled`/`env`. A fully custom (non-builtin) server with its own `command` must go in the USER config (`~/.asterline/code-intel-client.json`).

### Initialization options (only if commonly needed)

None commonly required. To switch the check command to clippy:

```json
{ "code-intel": { "rust": { "initialization": { "check": { "command": "clippy" } } } } }
```

## Alternatives

None — `rust-analyzer` is the official and sole Rust language server.

## Troubleshooting
- **PATH:** `rust-analyzer` must be on PATH; reopen shell after install. The rustup shim lives in `~/.cargo/bin`.
- **Exits while loading rust-src:** if rust-analyzer crashes during stdlib indexing, reinstall the source component:

  ```bash
  rustup component remove rust-src && rustup component add rust-src
  ```

- **No proc-macro / build script support:** ensure the project builds with `cargo check`; rust-analyzer reuses the same toolchain.

## Verify

```bash
bun ../../scripts/verify-code-intel.ts path/to/file.rs
```
