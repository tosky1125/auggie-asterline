# Build-only source closure

`build-sources/` contains exact, licensed inputs used only to reproduce committed self-contained bundles. Installed hooks and MCP processes must never import this directory.

Picomatch 4.0.4 is pinned by release tag, Git commit/tree, npm archive integrity, and per-file SHA-256 in `build-sources.lock.json`. The retained files are byte-identical in the tagged Git tree and published npm archive. `components/rules/scripts/build.mjs` supplies this source through an explicit F3 alias; the emitted runtime contains no bare dependency or build-source path.

F2 materializes application source from `upstream-lock.json`. External build dependencies that are not stored in that application repository are closed here with the same immutable-source requirements. Refresh a source atomically, verify its upstream tag and archive, update every checksum and license, rebuild twice, and run `test/v4171-vendor-removal.test.mjs`.
