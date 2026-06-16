# Kotlin — LSP setup

- **Builtin server:** `kotlin-ls` — `kotlin-code-intel`
- **Extensions:** `.kt .kts`
- **Install hint:** `https://github.com/Kotlin/kotlin-code-intel`

## Install

The official **JetBrains Kotlin LSP** is pre-release. Download a build from the [Kotlin/kotlin-code-intel](https://github.com/Kotlin/kotlin-code-intel) releases and put the `kotlin-code-intel` launcher on PATH.

- **macOS:** Download the release archive, extract, then symlink the launcher: `ln -s /path/to/kotlin-code-intel/kotlin-code-intel.sh /usr/local/bin/kotlin-code-intel`
- **Linux:** Same as macOS — extract the release and place/symlink `kotlin-code-intel` on PATH.
- **Windows:** Extract the release and add the directory containing `kotlin-code-intel.bat` to PATH (invoke as `kotlin-code-intel`).

Requires a **JDK** on the machine to run the server.

Confirm it resolves:

```bash
command -v kotlin-code-intel
```

## Configure

Builtin — usually NO config needed (auto-resolved by extension). Configure only to set priority, init options, override extensions, or disable. Same JSON shape in `.asterline/code-intel-client.json` (Auggie) AND `.opencode/code-intel.json` (OpenCode/Asterline):

```json
{ "code-intel": { "kotlin-ls": { "priority": 100 } } }
```

For builtin ids in a PROJECT config, `command` is supplied automatically — only set `priority`/`initialization`/`extensions`/`disabled`/`env`. A fully custom (non-builtin) server with its own `command` must go in the USER config (`~/.asterline/code-intel-client.json`).

### Initialization options (only if commonly needed)

None commonly required. If `kotlin-code-intel` cannot find a Java runtime, set `JAVA_HOME`:

```json
{ "code-intel": { "kotlin-ls": { "env": { "JAVA_HOME": "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home" } } } }
```

The server resolves classpath from Gradle/Maven; keep the build descriptor importable.

## Alternatives

- **`fwcd/kotlin-language-server`** — older community server (not builtin). Still usable but less actively maintained than the official JetBrains one.

## Troubleshooting

- **PATH:** `kotlin-code-intel` on PATH; reopen shell after install.
- **Pre-release churn:** the JetBrains server is early; pin a known-good release and expect occasional breakage.
- **No JDK:** server fails to start — install a JDK and/or set `JAVA_HOME`.
- **Slow first import:** Gradle resolution on first open can be slow on large projects; let it complete.
- **`.kts` scripts:** build/script files resolve more slowly than `.kt` sources; this is expected.

## Verify

```bash
bun ../../scripts/verify-code-intel.ts path/to/File.kt
```
